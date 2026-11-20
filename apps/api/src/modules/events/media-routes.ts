import { randomUUID } from 'node:crypto';
import { and, eq, eventMedia, events, sql, withContext } from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../lib/audit.ts';
import { inOrg, requireOrgPermission, type Services } from '../../lib/context.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { MAX_IMAGE_BYTES, inspectImage } from '../../lib/images.ts';
import { MediaDto, mediaUrl } from './content.ts';

const MAX_GALLERY = 8;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function mediaRoutes(app: FastifyInstance, s: Services): Promise<void> {
  // Las imágenes llegan como cuerpo binario (no JSON). Límite propio, mayor al general de 256 KB.
  app.addContentTypeParser(IMAGE_TYPES, { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES + 1024 }, (_req, body, done) => done(null, body));

  const r = app.withTypeProvider<ZodTypeProvider>();
  const EventParams = z.object({ orgId: z.string().uuid(), eventId: z.string().uuid() });

  r.post(
    '/v1/organizations/:orgId/events/:eventId/media',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['business'],
        summary: 'Subir una imagen del evento (portada o galería)',
        description: 'Cuerpo binario JPG, PNG o WebP de hasta 3 MB, sin metadatos EXIF. La portada nueva reemplaza a la anterior. Galería: hasta 8.',
        params: EventParams,
        querystring: z.object({ kind: z.enum(['cover', 'gallery']).default('gallery') }),
        response: { 201: MediaDto },
      },
    },
    async (req, reply) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.write');
      if (!Buffer.isBuffer(req.body)) throw new AppError(415, 'image_unsupported', 'Enviá la imagen como archivo (image/jpeg, image/png o image/webp).');
      const info = inspectImage(req.body);
      const kind = req.query.kind;
      const result = await inOrg(s.db, access, async (tx) => {
        const [e] = await tx
          .select()
          .from(events)
          .where(and(eq(events.id, req.params.eventId), eq(events.organizationId, access.orgId)))
          .for('update');
        if (!e) throw notFound('Evento');
        if (e.status === 'cancelled' || e.status === 'finished') throw conflict('event_closed', 'El evento está cerrado y ya no admite cambios.');
        let position = 0;
        if (kind === 'gallery') {
          const [row] = await tx
            .select({ n: sql<number>`count(*)`.mapWith(Number), max: sql<number>`coalesce(max(${eventMedia.position}), 0)`.mapWith(Number) })
            .from(eventMedia)
            .where(and(eq(eventMedia.eventId, e.id), eq(eventMedia.kind, 'gallery')));
          if ((row?.n ?? 0) >= MAX_GALLERY) throw conflict('gallery_full', `La galería admite hasta ${MAX_GALLERY} imágenes. Borrá alguna para subir otra.`);
          position = (row?.max ?? 0) + 1;
        }
        const id = randomUUID();
        await tx.insert(eventMedia).values({
          id,
          organizationId: access.orgId,
          eventId: e.id,
          kind,
          position,
          contentType: info.contentType,
          bytes: req.body as Buffer,
          width: info.width,
          height: info.height,
          sizeBytes: info.sizeBytes,
          sha256: info.sha256,
          createdBy: access.userId,
        });
        if (kind === 'cover') {
          // La portada anterior se borra: una sola portada por evento.
          await tx.update(events).set({ coverMediaId: id, updatedAt: s.now() }).where(eq(events.id, e.id));
          await tx.delete(eventMedia).where(and(eq(eventMedia.eventId, e.id), eq(eventMedia.kind, 'cover'), sql`${eventMedia.id} <> ${id}`));
        }
        await audit(tx, {
          orgId: access.orgId,
          actorUserId: access.userId,
          action: kind === 'cover' ? 'event.cover_set' : 'event.gallery_added',
          entityType: 'event',
          entityId: e.id,
          data: { mediaId: id, sha256: info.sha256, sizeBytes: info.sizeBytes, width: info.width, height: info.height },
          ip: req.ip,
        });
        return { id, url: mediaUrl(id), width: info.width, height: info.height };
      });
      return reply.status(201).send(result);
    },
  );

  r.delete(
    '/v1/organizations/:orgId/events/:eventId/media/:mediaId',
    { schema: { tags: ['business'], summary: 'Borrar una imagen del evento', params: EventParams.extend({ mediaId: z.string().uuid() }), response: { 204: z.null() } } },
    async (req, reply) => {
      const access = await requireOrgPermission(s.db, req, req.params.orgId, 'events.write');
      await inOrg(s.db, access, async (tx) => {
        const gone = await tx
          .delete(eventMedia)
          .where(and(eq(eventMedia.id, req.params.mediaId), eq(eventMedia.eventId, req.params.eventId), eq(eventMedia.organizationId, access.orgId)))
          .returning({ id: eventMedia.id, kind: eventMedia.kind });
        if (gone.length === 0) throw notFound('Imagen');
        await audit(tx, { orgId: access.orgId, actorUserId: access.userId, action: 'event.media_deleted', entityType: 'event', entityId: req.params.eventId, data: { mediaId: req.params.mediaId, kind: gone[0]!.kind }, ip: req.ip });
      });
      return reply.status(204).send(null);
    },
  );

  // Servir imágenes: públicas si el evento está publicado; si es borrador, sólo para la productora (?org=).
  app.get<{ Params: { mediaId: string }; Querystring: { org?: string } }>(
    '/v1/media/:mediaId',
    { config: { rateLimit: { max: 600, timeWindow: '1 minute' } }, schema: { hide: true } },
    async (req, reply) => {
      const { mediaId } = req.params;
      if (!/^[0-9a-f-]{36}$/.test(mediaId)) throw notFound('Imagen');
      const select = { contentType: eventMedia.contentType, bytes: eventMedia.bytes, sha256: eventMedia.sha256 };
      let row = (await withContext(s.db, {}, (tx) => tx.select(select).from(eventMedia).where(eq(eventMedia.id, mediaId))))[0];
      let isPublic = Boolean(row);
      if (!row && req.query.org && /^[0-9a-f-]{36}$/.test(req.query.org) && req.auth) {
        const access = await requireOrgPermission(s.db, req, req.query.org, 'events.read');
        row = (await inOrg(s.db, access, (tx) => tx.select(select).from(eventMedia).where(eq(eventMedia.id, mediaId))))[0];
        isPublic = false;
      }
      if (!row) throw notFound('Imagen');
      const etag = `"${row.sha256}"`;
      reply
        .header('content-type', row.contentType)
        .header('etag', etag)
        .header('content-disposition', 'inline')
        // Una imagen nunca cambia (reemplazarla crea otra): caché larga en navegador y CDN si es pública.
        .header('cache-control', isPublic ? 'public, max-age=31536000, s-maxage=31536000, immutable' : 'private, no-store');
      if (req.headers['if-none-match'] === etag) return reply.status(304).send();
      return reply.send(row.bytes);
    },
  );
}
