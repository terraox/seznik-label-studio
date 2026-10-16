/**
 * Start Metro for the Expo development build.
 *
 * The development client remembers the last packager URL (`launchMode: most-recent`).
 * `--localhost` writes 127.0.0.1:8081 onto the phone, which only works while
 * `adb reverse` is active — and Android drops that map on every USB disconnect.
 *
 * Default: advertise the LAN IP so the saved URL survives unplug, and keep a
 * reverse watcher so leftover localhost sessions still recover over USB.
 * Pass `--usb` to force localhost when Wi‑Fi is blocked.
 *
 * The terminal QR uses exp+gesu:// — the stock Camera app cannot open it.
 * Connect from inside the sez-print development app instead.
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { lanIp } = require('./keep-adb-reverse');

const projectRoot = path.resolve(__dirname, '..');
const METRO_PORT = 8081;
const forceUsb = process.argv.includes('--usb');
const clearCache = process.argv.includes('-c') || process.argv.includes('--clear');
const useLocalhost = forceUsb && !process.argv.includes('--lan');

function freePort(port) {
  if (process.platform === 'win32') {
    const netstat = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: true });
    if (netstat.status !== 0) return;
    const pids = new Set();
    for (const line of netstat.stdout.split('\n')) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      spawnSync('taskkill', ['/PID', pid, '/F'], { shell: true, stdio: 'ignore' });
      console.log(`Freed port ${port} (stopped PID ${pid})`);
    }
  } else {
    try {
      const lsof = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' });
      if (lsof.status === 0 && lsof.stdout) {
        const pids = lsof.stdout.trim().split(/\s+/).filter(Boolean);
        for (const pid of pids) {
          if (pid && pid !== String(process.pid)) {
            spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
            console.log(`Freed port ${port} (stopped PID ${pid})`);
          }
        }
      }
    } catch {
      // ignore
    }
  }
}

function printConnectHelp(port) {
  const ip = lanIp();
  const lanUrl = `http://${ip}:${port}`;
  const usbUrl = `http://localhost:${port}`;
  const manualUrl = useLocalhost ? usbUrl : lanUrl;
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  DO NOT scan the terminal QR with the Camera app.                ║
║  Camera cannot open exp+gesu:// (shows "No usable data").        ║
╠══════════════════════════════════════════════════════════════════╣
║  Connect for live reload (scan QR *inside* the sez-print app):     ║
║  1. Install APK from: npm run build:android:dev  (NOT preview)   ║
║  2. Open sez-print → dev launcher → tap "Scan QR code"           ║
║     (Do NOT use the phone Camera app or Expo Go.)                ║
║  3. Scan the QR shown in this terminal, OR enter manually:        ║
║     ${manualUrl.padEnd(52)}║
║  USB fallback (kept alive automatically): ${usbUrl.padEnd(22)}║
║                                                                  ║
║  Standalone testing (no Metro): npm run build:android            ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

function startReverseKeeper(packagerUrl) {
  const keeper = spawn(
    process.execPath,
    [
      path.join(__dirname, 'keep-adb-reverse.js'),
      '--open',
      `--url=${packagerUrl}`,
    ],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  keeper.on('error', (err) => {
    console.warn(`USB: reverse keeper failed to start: ${err.message}`);
  });
  return keeper;
}

freePort(METRO_PORT);

const ip = lanIp();
const advertisedUrl = useLocalhost ? `http://127.0.0.1:${METRO_PORT}` : `http://${ip}:${METRO_PORT}`;

if (useLocalhost) {
  console.log('\nUSB localhost mode: adb reverse is watched for the life of Metro.');
  console.log('   If the phone still red-screens after unplug, use npm start (LAN) instead.\n');
} else {
  console.log(`\nLAN mode: phone should load ${advertisedUrl}`);
  console.log('   adb reverse is still watched so leftover 127.0.0.1 sessions recover on USB.\n');
}

printConnectHelp(METRO_PORT);

const expoArgs = [
  'expo',
  'start',
  '--dev-client',
  '--port',
  String(METRO_PORT),
  useLocalhost ? '--localhost' : '--lan',
];
if (process.platform === 'win32') {
  expoArgs.push('--max-workers', '2');
}
if (clearCache) {
  expoArgs.push('-c');
}

const preload = path.join(projectRoot, 'scripts', 'preload-graceful-fs.js').replace(/\\/g, '/');
const nodeOptions = [process.env.NODE_OPTIONS, `-r ${preload}`].filter(Boolean).join(' ');

const keeper = startReverseKeeper(advertisedUrl);

const child = spawn('npx', expoArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    REACT_NATIVE_PACKAGER_HOSTNAME: useLocalhost ? '127.0.0.1' : ip,
  },
});

function shutdown(code) {
  try {
    keeper.kill();
  } catch {
    // ignore
  }
  process.exit(code ?? 0);
}

child.on('exit', (code) => shutdown(code));
child.on('error', (err) => {
  console.error(err);
  shutdown(1);
});
process.on('SIGINT', () => {
  try {
    child.kill();
  } catch {
    // ignore
  }
  shutdown(0);
});
process.on('SIGTERM', () => {
  try {
    child.kill();
  } catch {
    // ignore
  }
  shutdown(0);
});
