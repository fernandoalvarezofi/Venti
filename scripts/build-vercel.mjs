/**
 * Empaqueta la API para Vercel con la Build Output API v3 (.vercel/output).
 * Un único bundle ESM + los estáticos de Swagger UI. Ver docs/DEPLOY.md.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'api.func');

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

await build({
  entryPoints: [join(root, 'apps/api/src/vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: false,
  sourcemap: 'linked',
  legalComments: 'none',
  // pg intenta cargar el driver nativo opcional; no se usa.
  external: ['pg-native'],
  // Las dependencias CommonJS (fastify, pg) usan require(): se lo proveemos dentro del bundle ESM.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});

cpSync(join(root, 'node_modules/@fastify/swagger-ui/static'), join(fn, 'swagger-static'), { recursive: true });

writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2),
);
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }));
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/api' }] }, null, 2),
);
console.log('Salida de Vercel lista en .vercel/output');
