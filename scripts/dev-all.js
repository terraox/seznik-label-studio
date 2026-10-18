/**
 * One command for the full local stack:
 *   npm run dev:all                  Postgres check + admin (3000) + Metro
 *   npm run dev:all -- --printer-api also start backend/ (8787)
 *   npm run dev:all -- --usb|--clear forwarded to Metro (scripts/dev-start.js)
 *
 * Postgres is only checked, never started (install method varies). Ctrl+C stops everything.
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const withPrinterApi = args.includes('--printer-api');
const metroArgs = args.filter((a) => a !== '--printer-api');

const children = [];

function prefixed(name, cwd, cmd, cmdArgs) {
  const child = spawn(cmd, cmdArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const pipe = (stream, out) =>
    stream.on('data', (buf) =>
      buf
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach((line) => out.write(`[${name}] ${line}\n`)),
    );
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => console.log(`[${name}] exited (${code})`));
  children.push(child);
  return child;
}

function postgresUp() {
  return new Promise((resolve) => {
    const sock = net.connect({ port: 5432, host: '127.0.0.1' });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(1500, () => done(false));
    sock.on('connect', () => done(true));
    sock.on('error', () => done(false));
  });
}

function shutdown() {
  children.forEach((c) => c.kill('SIGTERM'));
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

(async () => {
  if (!(await postgresUp())) {
    console.warn('[stack] Postgres is not answering on 5432. OTP and login will hang until it is running.');
  }
  prefixed('admin', path.join(root, 'admin'), 'npm', ['run', 'dev']);
  if (withPrinterApi) prefixed('printer-api', path.join(root, 'backend'), 'npm', ['run', 'dev']);

  const metro = spawn('node', [path.join(__dirname, 'dev-start.js'), ...metroArgs], {
    cwd: root,
    stdio: 'inherit',
  });
  metro.on('exit', shutdown);
  children.push(metro);
})();
