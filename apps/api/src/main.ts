import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const { app, close } = await buildApp({ config });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Cerrando servidor');
  await close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.HOST, port: config.PORT });
