/**
 * Layout matrix: shows every screen at the screen sizes and font sizes real phones come in.
 *
 * The static checks (npm run test:layout) catch missing wrap/shrink rules; they cannot tell whether a
 * screen looks right. This does, on a phone plugged in over USB: for each profile it sets the phone's
 * screen size, density and system font size with adb, opens each route by deep link, saves a
 * screenshot, then puts everything back. Look at the PNGs in .layout-matrix/ (git-ignored).
 *
 *   npm run layout:matrix                          all profiles, default routes
 *   npm run layout:matrix -- --routes /,/shop      chosen routes
 *   npm run layout:matrix -- --profiles narrow-large,small
 *   npm run layout:matrix -- --serial T4I75955Z97HSO8H
 *
 * Needs the app installed (dev build is fine, Metro running) and USB debugging on. The phone is
 * restored even on Ctrl+C. If a profile leaves the phone odd, run: npm run layout:matrix -- --reset
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PACKAGE = 'com.seznik.labelstudio';
const SCHEME = 'sezprint';
const OUT = path.resolve(__dirname, '..', '.layout-matrix');
/** Density 420 = the usual modern phone. px = dp * 420 / 160. */
const DENSITY = 420;
const px = (dp) => Math.round((dp * DENSITY) / 160);

/** Screen width (dp), height (dp), system font scale. Widths are the range the app supports. */
const PROFILES = {
  'narrow-large': { w: 320, h: 640, font: '1.3' },
  'narrow': { w: 320, h: 640, font: '1.0' },
  'small-large': { w: 360, h: 760, font: '1.3' },
  'small': { w: 360, h: 760, font: '1.0' },
  'standard': { w: 393, h: 852, font: '1.0' },
  'standard-large': { w: 393, h: 852, font: '1.3' },
  'wide': { w: 412, h: 915, font: '1.0' },
  'wide-large': { w: 412, h: 915, font: '1.3' },
  'tiny-text': { w: 393, h: 852, font: '0.85' },
};

const DEFAULT_ROUTES = [
  '/',
  '/template',
  '/shop',
  '/help',
  '/setting',
  '/new-label',
  '/pdf',
  '/ocr',
  '/printer-connect',
];

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const serial = opt('serial');
const routes = (opt('routes') ?? DEFAULT_ROUTES.join(',')).split(',').map((r) => r.trim());
const wanted = opt('profiles') ? opt('profiles').split(',') : Object.keys(PROFILES);

function adb(...a) {
  const full = serial ? ['-s', serial, ...a] : a;
  const r = spawnSync('adb', full, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}
const sh = (cmd) => adb('shell', cmd).stdout.trim();

function reset() {
  adb('shell', 'wm size reset');
  adb('shell', 'wm density reset');
  adb('shell', 'settings put system font_scale 1.0');
}

if (args.includes('--reset')) {
  reset();
  console.log('Phone screen size, density and font size restored.');
  process.exit(0);
}

const devices = spawnSync('adb', ['devices'], { encoding: 'utf8' }).stdout.split('\n').slice(1).filter((l) => /\tdevice$/.test(l));
if (devices.length === 0) {
  console.error('No phone found. Plug it in, allow USB debugging, check `adb devices`.');
  process.exit(1);
}
if (devices.length > 1 && !serial) {
  console.error('More than one device; pass --serial <id>.');
  process.exit(1);
}

const physical = sh('wm size').match(/Physical size: (\d+)x(\d+)/);
const maxW = physical ? Number(physical[1]) : Infinity;
let restored = false;
const restore = () => {
  if (restored) return;
  restored = true;
  reset();
  console.log('\nPhone restored to its normal size and font.');
};
process.on('exit', restore);
process.on('SIGINT', () => process.exit(130));

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

for (const name of wanted) {
  const p = PROFILES[name];
  if (!p) {
    console.error(`Unknown profile ${name}. Known: ${Object.keys(PROFILES).join(', ')}`);
    continue;
  }
  if (px(p.w) > maxW) {
    console.warn(`skip ${name}: ${p.w}dp needs ${px(p.w)}px, phone is ${maxW}px wide`);
    continue;
  }
  adb('shell', `wm size ${px(p.w)}x${px(p.h)}`);
  adb('shell', `wm density ${DENSITY}`);
  adb('shell', `settings put system font_scale ${p.font}`);
  sleep(1500);
  for (const route of routes) {
    const url = `${SCHEME}://${route.replace(/^\//, '')}`;
    adb('shell', `am start -a android.intent.action.VIEW -d "${url}" ${PACKAGE}`);
    sleep(2500);
    const safe = route === '/' ? 'home' : route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
    const file = path.join(OUT, `${name}__${safe}.png`);
    const shot = spawnSync('adb', [...(serial ? ['-s', serial] : []), 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(file, shot.stdout);
    console.log(`${name} (${p.w}dp, font ${p.font})  ${route}  →  ${path.relative(process.cwd(), file)}`);
  }
}
