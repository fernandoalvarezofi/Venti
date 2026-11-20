/** Detiene limpiamente el PostgreSQL de desarrollo (útil si el proceso padre se cortó sin Ctrl+C). */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const binDir = join(dirname(require.resolve(`@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-x64/package.json`)), 'native', 'bin');
const dataDir = fileURLToPath(new URL('../../../.pgdata', import.meta.url));

try {
  execFileSync(join(binDir, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast'], { stdio: 'inherit' });
} catch {
  console.log('No había un PostgreSQL de desarrollo corriendo.');
}
