/**
 * Entrada para Vercel Functions. Reutiliza la misma app Fastify que `main.ts`;
 * la instancia se crea una vez por contenedor y atiende muchas invocaciones.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

// El build copia los estáticos de Swagger UI junto al bundle (scripts/build-vercel.mjs).
const env = { SWAGGER_STATIC_DIR: join(dirname(fileURLToPath(import.meta.url)), 'swagger-static'), ...process.env };

const ready = buildApp({ config: loadConfig(env) }).then(async (venti) => {
  await venti.app.ready();
  return venti.app;
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await ready;
  app.server.emit('request', req, res);
}
