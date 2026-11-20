import { sql } from '@venti/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Services } from '../../lib/context.ts';

export async function healthRoutes(app: FastifyInstance, s: Services): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/health/live',
    { config: { rateLimit: false }, schema: { tags: ['health'], response: { 200: z.object({ status: z.literal('ok') }) } } },
    async () => ({ status: 'ok' as const }),
  );

  r.get(
    '/health/ready',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['health'],
        response: {
          200: z.object({ status: z.literal('ok'), database: z.literal('ok') }),
          503: z.object({ status: z.literal('degraded'), database: z.literal('down') }),
        },
      },
    },
    async (_req, reply) => {
      try {
        await s.db.execute(sql`select 1`);
        return { status: 'ok' as const, database: 'ok' as const };
      } catch {
        return reply.status(503).send({ status: 'degraded' as const, database: 'down' as const });
      }
    },
  );
}
