import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, type Services } from '../../lib/context.ts';
import { createHold, getHold, releaseHold } from './service.ts';

const HoldDto = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  status: z.enum(['active', 'converted', 'expired', 'released']),
  expiresAt: z.date(),
  currency: z.string(),
  totalCents: z.number(),
  items: z.array(
    z.object({
      ticketTypeId: z.string().uuid(),
      ticketTypeName: z.string(),
      stageName: z.string().nullable(),
      quantity: z.number(),
      unitPriceCents: z.number(),
    }),
  ),
});

export async function inventoryRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/v1/holds',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['checkout'],
        summary: 'Reservar entradas temporalmente',
        description: 'Bloquea el stock por unos minutos mientras el comprador paga. Reemplaza cualquier reserva activa del mismo usuario para el mismo evento.',
        body: z.object({
          eventId: z.string().uuid(),
          items: z
            .array(z.object({ ticketTypeId: z.string().uuid(), quantity: z.number().int().min(1).max(100) }))
            .min(1)
            .max(10),
        }),
        response: { 201: HoldDto },
      },
    },
    async (req, reply) => {
      const { userId } = requireAuth(req);
      const hold = await createHold(s.db, { userId, eventId: req.body.eventId, items: req.body.items, ttlMinutes: s.config.HOLD_TTL_MINUTES, now: s.now() });
      return reply.status(201).send(hold);
    },
  );

  r.get(
    '/v1/holds/:holdId',
    { schema: { tags: ['checkout'], summary: 'Ver una reserva propia', params: z.object({ holdId: z.string().uuid() }), response: { 200: HoldDto } } },
    async (req) => getHold(s.db, requireAuth(req).userId, req.params.holdId, s.now()),
  );

  r.delete(
    '/v1/holds/:holdId',
    { schema: { tags: ['checkout'], summary: 'Liberar una reserva propia', params: z.object({ holdId: z.string().uuid() }), response: { 204: z.null() } } },
    async (req, reply) => {
      await releaseHold(s.db, requireAuth(req).userId, req.params.holdId, s.now());
      return reply.status(204).send(null);
    },
  );
}
