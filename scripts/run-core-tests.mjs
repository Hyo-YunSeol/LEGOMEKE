import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = (await readdir(new URL('../tests/', import.meta.url)))
  .filter((name) => name.endsWith('.test.js') && name !== 'browser-runtime.test.js')
  .sort()
  .map((name) => `tests/${name}`);

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit'
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
