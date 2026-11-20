/**
 * Configura el proyecto `venti` en Vercel con la CLI oficial y la sesión del dueño de la cuenta.
 *   1. Inicia sesión en Vercel si hace falta (se autoriza desde el navegador).
 *   2. Carga las variables de .secrets/2-pegar-en-vercel-env.txt en Production (los valores viajan por stdin, nunca se imprimen).
 *   3. Fija la región de las funciones en São Paulo (gru1).
 * Uso (lo corre el dueño):  node scripts/setup-vercel.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEAM = 'team_LAcfgmB17TkqMFCKOxcyCJWe';
const PROJECT = 'venti';
const ENV_FILE = new URL('../.secrets/2-pegar-en-vercel-env.txt', import.meta.url);

function vercel(args, opts = {}) {
  // shell en Windows para resolver npx; los argumentos no contienen secretos.
  return spawnSync('npx', ['--yes', 'vercel@66.2.0', ...args], { shell: true, encoding: 'utf8', ...opts });
}

console.log('\n== 1/3 Sesión en Vercel ==');
if (vercel(['whoami', '--scope', TEAM]).status !== 0) {
  console.log('Se va a abrir (o mostrar) un enlace: aprobalo en el navegador con tu cuenta de Vercel.');
  const login = vercel(['login'], { stdio: 'inherit' });
  if (login.status !== 0) {
    console.error('No se pudo iniciar sesión en Vercel.');
    process.exit(1);
  }
}
console.log('Sesión OK.');

console.log('\n== 2/3 Variables de entorno (Production) ==');
const lines = readFileSync(ENV_FILE, 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith('#'));
let ok = 0;
for (const line of lines) {
  const i = line.indexOf('=');
  const key = line.slice(0, i).trim();
  const value = line.slice(i + 1);
  const r = vercel(['env', 'add', key, 'production', '--force', '--scope', TEAM, '--project', PROJECT], { input: value });
  if (r.status === 0) {
    ok++;
    console.log(`  ✓ ${key}`);
  } else {
    console.log(`  ✗ ${key}: ${(r.stderr || r.stdout || '').split('\n').filter(Boolean).slice(-1)[0] ?? 'error'}`);
  }
}
console.log(`${ok} de ${lines.length} variables cargadas.`);

console.log('\n== 3/3 Región de las funciones: São Paulo (gru1) ==');
const dir = mkdtempSync(join(tmpdir(), 'venti-'));
const body = join(dir, 'body.json');
writeFileSync(body, JSON.stringify({ serverlessFunctionRegion: 'gru1' }));
const region = vercel(['api', `/v9/projects/${PROJECT}?teamId=${TEAM}`, '--method', 'PATCH', '--input', `"${body}"`]);
rmSync(dir, { recursive: true, force: true });
console.log(region.status === 0 ? 'Región OK.' : `No se pudo cambiar la región: ${(region.stderr || '').trim().split('\n').slice(-1)[0]}`);

console.log(ok === lines.length && region.status === 0 ? '\nTodo listo. Avisale a Claude.' : '\nHubo errores: copiá este resultado y pasáselo a Claude.');
