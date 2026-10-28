/**
 * Keep `adb reverse` alive for the Expo bundler.
 *
 * Android drops reverse maps when USB unplugs, the cable flaps, adb restarts,
 * or the phone reconnects. A one-shot reverse at Metro start is why the
 * development build then shows "Unable to load script" against 127.0.0.1:8081.
 *
 * This process lists devices, reapplies tcp:8081 (and 8083) whenever a map is
 * missing, and can reopen the development client on reconnect.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const INTERVAL_MS = 2000;
const PORTS = [8081, 8083];
const PACKAGE_ID = 'com.seznik.labelstudio';
const DEV_SCHEMES = ['exp+sez-print', 'exp+sezprint', 'sezprint', 'exp+zub'];

function parseArgs(argv) {
  const once = argv.includes('--once');
  const open = argv.includes('--open');
  let url = '';
  for (const arg of argv) {
    if (arg.startsWith('--url=')) url = arg.slice('--url='.length);
  }
  return { once, open, url };
}

function adbBin() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const candidates = [
    'adb',
    fromEnv ? path.join(fromEnv, 'platform-tools', 'adb.exe') : null,
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  ].filter(Boolean);
  for (const bin of candidates) {
    if (bin === 'adb') return bin;
    if (fs.existsSync(bin)) return bin;
  }
  return 'adb';
}

const ADB = adbBin();

function adb(args, serial) {
  const full = serial ? ['-s', serial, ...args] : args;
  return spawnSync(ADB, full, {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  });
}

function listDeviceSerials() {
  const result = adb(['devices']);
  if (result.error && result.error.code === 'ENOENT') {
    return { serials: [], unauthorized: [], error: 'adb not found in PATH' };
  }
  if (result.status !== 0) {
    return { serials: [], unauthorized: [], error: (result.stderr || result.stdout || '').trim() };
  }
  const serials = [];
  const unauthorized = [];
  for (const line of (result.stdout || '').split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(device|unauthorized|offline)\s*$/);
    if (!match) continue;
    if (match[2] === 'device') serials.push(match[1]);
    else if (match[2] === 'unauthorized') unauthorized.push(match[1]);
  }
  return { serials, unauthorized, error: null };
}

function reverseList(serial) {
  const result = adb(['reverse', '--list'], serial);
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function hasReverse(serial, port) {
  return reverseList(serial).includes(`tcp:${port}`);
}

function applyReverse(serial, port) {
  const result = adb(['reverse', `tcp:${port}`, `tcp:${port}`], serial);
  const ok = result.status === 0;
  return {
    ok,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  };
}

function ensureReverse(serial, ports) {
  const applied = [];
  const failed = [];
  for (const port of ports) {
    if (hasReverse(serial, port)) continue;
    const { ok, output } = applyReverse(serial, port);
    if (ok) applied.push(port);
    else failed.push({ port, output });
  }
  return { applied, failed };
}

function lanIp() {
  const preferred = [];
  const rest = [];
  for (const [name, nets] of Object.entries(os.networkInterfaces())) {
    if (/virtual|vethernet|vmware|vbox|loopback|docker|wsl|hyper-v|npcap/i.test(name)) continue;
    for (const net of nets ?? []) {
      const family = net.family === 'IPv4' || net.family === 4;
      if (!family || net.internal) continue;
      if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
        preferred.push(net.address);
      } else {
        rest.push(net.address);
      }
    }
  }
  return preferred[0] || rest[0] || '127.0.0.1';
}

function packagerUrls(explicit) {
  if (explicit) return [explicit];
  const ip = lanIp();
  const urls = [`http://127.0.0.1:8081`];
  if (ip && ip !== '127.0.0.1') urls.unshift(`http://${ip}:8081`);
  return urls;
}

function amStart(serial, uri) {
  return adb(
    ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', uri, PACKAGE_ID],
    serial,
  );
}

function openDevClient(serial, urls) {
  for (const url of urls) {
    const encoded = encodeURIComponent(url);
    for (const scheme of DEV_SCHEMES) {
      const uri = `${scheme}://expo-development-client/?url=${encoded}`;
      const result = amStart(serial, uri);
      const text = `${result.stdout || ''}${result.stderr || ''}`;
      if (result.status === 0 && !/Error|unable to resolve|No activity found/i.test(text)) {
        console.log(`USB: opened ${scheme} → ${url}`);
        return true;
      }
    }
  }
  const launch = adb(
    ['shell', 'monkey', '-p', PACKAGE_ID, '-c', 'android.intent.category.LAUNCHER', '1'],
    serial,
  );
  if (launch.status === 0) {
    console.log(`USB: launched ${PACKAGE_ID} (connect from the dev launcher if the red screen remains)`);
    return true;
  }
  return false;
}

function logUnauthorized(serials) {
  if (!serials.length) return;
  console.warn(
    `\n⚠ USB debugging is unauthorized on: ${serials.join(', ')}\n` +
      `   Unlock the phone and tap "Allow USB debugging", then leave this process running.\n`,
  );
}

function restore(serials, { open, urls, seen }) {
  let opened = false;
  for (const serial of serials) {
    const isNew = !seen.has(serial);
    const { applied, failed } = ensureReverse(serial, PORTS);
    if (applied.length) {
      console.log(`USB: reverse restored on ${serial} (${applied.map((p) => `tcp:${p}`).join(', ')})`);
    }
    for (const { port, output } of failed) {
      console.warn(`USB: reverse tcp:${port} failed on ${serial}${output ? `: ${output}` : ''}`);
    }
    if (open && (isNew || applied.length) && !opened) {
      opened = openDevClient(serial, urls);
    }
    seen.add(serial);
  }
  for (const serial of [...seen]) {
    if (!serials.includes(serial)) {
      seen.delete(serial);
      console.log(`USB: ${serial} disconnected — reverse will be reapplied on reconnect`);
    }
  }
}

function tryAllowMetroFirewall() {
  if (process.platform !== 'win32') return;
  const name = 'Expo Metro 8081';
  const check = spawnSync(
    'netsh',
    ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`],
    { encoding: 'utf8', windowsHide: true },
  );
  if (check.status === 0 && /Enabled:\s+Yes/i.test(check.stdout || '')) return;
  const add = spawnSync(
    'netsh',
    [
      'advfirewall',
      'firewall',
      'add',
      'rule',
      `name=${name}`,
      'dir=in',
      'action=allow',
      'protocol=TCP',
      'localport=8081',
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (add.status === 0) {
    console.log('LAN: allowed inbound TCP 8081 through Windows Firewall.');
  }
}

function waitForPort(port, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tryOnce = () => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.end();
        resolve(true);
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

async function main() {
  const { once, open, url } = parseArgs(process.argv.slice(2));
  const urls = packagerUrls(url);
  const seen = new Set();
  tryAllowMetroFirewall();

  const tick = (allowOpen) => {
    const { serials, unauthorized, error } = listDeviceSerials();
    if (error && error !== tick.lastError) {
      console.warn(`USB: adb error: ${error}`);
      tick.lastError = error;
    }
    if (!error) tick.lastError = null;
    if (unauthorized.length && unauthorized.join() !== tick.lastUnauthorized) {
      logUnauthorized(unauthorized);
      tick.lastUnauthorized = unauthorized.join();
    }
    if (!serials.length) {
      if (!tick.loggedWait) {
        console.log(
          'USB: no device yet — plug in the phone with USB debugging on. Reverse will restore automatically.',
        );
        tick.loggedWait = true;
      }
      for (const serial of [...seen]) {
        seen.delete(serial);
      }
      return serials;
    }
    tick.loggedWait = false;
    restore(serials, { open: allowOpen, urls, seen });
    return serials;
  };

  if (once) {
    const serials = tick(open);
    process.exit(serials.length ? 0 : 1);
  }

  // Reverse does not need Metro. Opening the app does.
  tick(false);
  if (open) {
    const ready = await waitForPort(8081, 120000);
    if (!ready) {
      console.warn('USB: Metro did not bind 8081 within 120s — still watching for reverse maps.');
    } else {
      seen.clear();
      tick(true);
    }
  }

  setInterval(() => tick(open), INTERVAL_MS);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  applyReverse,
  ensureReverse,
  lanIp,
  listDeviceSerials,
  openDevClient,
  packagerUrls,
};
