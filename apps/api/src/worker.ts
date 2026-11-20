/**
 * Procesos de fondo. Mismo código que la API, otro entrypoint (ADR 0001).
 * Hoy: expiración de reservas. Próximas etapas: conciliación de pagos, liquidaciones, notificaciones (outbox).
 */
import { createDb } from '@venti/db';
import { loadConfig } from './config.ts';
import { expireHolds } from './modules/inventory/service.ts';

const config = loadConfig();
const { db, close } = createDb(config.DATABASE_URL, { max: 2 });
const INTERVAL_MS = 15_000;
const BATCH = 500;
let running = true;

async function tick(): Promise<void> {
  try {
    let n: number;
    do {
      n = await expireHolds(db, BATCH);
      if (n > 0) console.log(JSON.stringify({ level: 'info', msg: 'holds expirados', count: n, at: new Date().toISOString() }));
    } while (n === BATCH && running);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'fallo expirando holds', err: String(err) }));
  }
}

const timer = setInterval(() => void tick(), INTERVAL_MS);
void tick();

const stop = async () => {
  running = false;
  clearInterval(timer);
  await close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
