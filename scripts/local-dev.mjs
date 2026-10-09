import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const node = process.execPath;
const pnpm = path.join(root, '.tools/node_modules/pnpm/bin/pnpm.cjs');
process.env.npm_config_store_dir = path.join(root, '.tools/pnpm-store');
process.env.PATH = `${path.dirname(node)}${path.delimiter}${path.join(root, '.tools/node_modules/.bin')}${path.delimiter}${process.env.PATH}`;
const local = path.join(root, '.local');
mkdirSync(local, { recursive: true });
const envFile = path.join(root, 'artifacts/api-server/.env');
if (!existsSync(envFile)) {
  const password = randomBytes(24).toString('hex');
  writeFileSync(envFile, `NODE_ENV=development\nPORT=3001\nDATABASE_URL=postgresql://dolldime:${password}@127.0.0.1:5433/dolldime\n`);
}
process.loadEnvFile(envFile);
const databaseUrl = new URL(process.env.DATABASE_URL);
const pgBin = path.join(root, '.tools/node_modules/@embedded-postgres/windows-x64/native/bin');
const data = path.join(local, 'postgres-data');
const log = path.join(local, 'postgres.log');
function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(exe)} exited with ${result.status}`);
}
const pgCtl = path.join(pgBin, 'pg_ctl.exe');
if (process.argv.includes('--stop-db')) {
  run(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop']);
  process.exit(0);
}

// A configured external database is used as-is. Only provision our local cluster.
const useLocalDb = databaseUrl.hostname === '127.0.0.1' && databaseUrl.port === '5433';
if (useLocalDb) {
  if (!existsSync(path.join(data, 'PG_VERSION'))) {
    const passwordFile = path.join(local, 'init-password');
    writeFileSync(passwordFile, decodeURIComponent(databaseUrl.password));
    try {
      run(path.join(pgBin, 'initdb.exe'), ['-D', data, '-U', decodeURIComponent(databaseUrl.username), '--pwfile', passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']);
    } finally { unlinkSync(passwordFile); }
  }
  const status = spawnSync(pgCtl, ['-D', data, 'status'], { stdio: 'ignore', windowsHide: true });
  if (status.status !== 0) {
    run(pgCtl, ['-D', data, '-l', log, '-o', '-h 127.0.0.1 -p 5433', '-w', 'start']);
  }
  const require = createRequire(path.join(root, 'lib/db/package.json'));
  const { Client } = require('pg');
  const client = new Client({ connectionString: new URL('postgres', databaseUrl).href });
  await client.connect();
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName]);
  if (!result.rowCount) {
    await client.query(`CREATE DATABASE "${databaseName.replaceAll('"', '""')}"`);
  }
  await client.end();
  run(node, [pnpm, '--filter', '@workspace/db', 'run', 'push']);
}
if (process.argv.includes('--setup-db')) process.exit(0);

const lanIp = Object.values(os.networkInterfaces()).flat().find(info => info && info.family === 'IPv4' && !info.internal)?.address;
const apiPort = process.env.PORT || '3001';
const web = process.argv.includes('--web');
const apiUrl = process.env.EXPO_PUBLIC_API_URL || `http://${web ? 'localhost' : lanIp || 'localhost'}:${apiPort}/api`;
const children = [];
function launch(name, args, env) {
  console.log(`Starting ${name}...`);
  const child = spawn(node, [pnpm, ...args], { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', err => { console.error(err); shutdown(1); });
  child.on('exit', code => { if (!stopping) { console.error(`${name} stopped (${code}).`); shutdown(code || 1); } });
}
let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  }
  console.log('Apps stopped. Local PostgreSQL remains running; use --stop-db to stop it.');
  process.exitCode = code;
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
launch('API', ['--filter', '@workspace/api-server', 'run', 'dev'], {
  NODE_ENV: 'development', PORT: apiPort,
  API_PUBLIC_ORIGIN: apiUrl.replace(/\/api$/, ''),
  CORS_ALLOWED_ORIGINS: [process.env.CORS_ALLOWED_ORIGINS, 'http://localhost:8081', lanIp && `http://${lanIp}:8081`].filter(Boolean).join(','),
});
launch('Admin', ['--filter', '@workspace/admin', 'run', 'dev'], { PORT: '5173', BASE_PATH: '/admin/', API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` });
launch('Mobile', ['--filter', '@workspace/mobile', 'run', 'dev', ...(web ? ['--web'] : [])], { PORT: '8081', EXPO_PUBLIC_API_URL: apiUrl });
console.log(`Admin: http://localhost:5173/admin/\nMobile: http://localhost:8081\nMobile API: ${apiUrl}\nPress Ctrl+C to stop the applications.`);
