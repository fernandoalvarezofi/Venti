import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, type Services } from '../../lib/context.ts';
import { createHold, getHold, quote, releaseHold } from './service.ts';

const Items = z
  .array(z.object({ ticketTypeId: z.string().uuid(), quantity: z.number().int().min(1).max(100) }))
  .min(1)
  .max(10);

const HoldDto = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  status: z.enum(['active', 'converted', 'expired', 'released']),
  expiresAt: z.date(),
  currency: z.string(),
  subtotalCents: z.number(),
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

const QuoteDto = z.object({
  eventId: z.string().uuid(),
  currency: z.string(),
  lines: z.array(
    z.object({
      ticketTypeId: z.string().uuid(),
      ticketTypeName: z.string(),
      stageId: z.string().uuid(),
      stageName: z.string(),
      quantity: z.number(),
      unitPriceCents: z.number(),
      lineTotalCents: z.number(),
    }),
  ),
  subtotalCents: z.number(),
  totalCents: z.number(),
});

export async function inventoryRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/v1/checkout/quote',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['checkout'],
        summary: 'Cotizar una selección de entradas',
        description: 'Precio vigente por etapa, cargo por servicio y total, calculados en el servidor. No reserva stock.',
        body: z.object({ eventId: z.string().uuid(), items: Items }),
        response: { 200: QuoteDto },
      },
    },
    async (req) => quote(s.db, { eventId: req.body.eventId, items: req.body.items, now: s.now() }),
  );

  r.post(
    '/v1/holds',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['checkout'],
        summary: 'Reservar entradas temporalmente',
        description: 'Bloquea el stock por unos minutos mientras el comprador paga. Reemplaza cualquier reserva activa del mismo usuario para el mismo evento. Los montos quedan congelados.',
        body: z.object({ eventId: z.string().uuid(), items: Items }),
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
