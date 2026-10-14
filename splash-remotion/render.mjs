// Renders the Remotion splash to ../assets/images/splash-animation.webp
// Usage: npm run render   (from splash-remotion/)
import { execSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'sez-splash-'));
const tmp = join(root, 'frames'); // Remotion wants to create the sequence folder itself
const out = new URL('../assets/images/splash-animation.webp', import.meta.url).pathname;
// ffmpeg -y truncates the destination immediately; Metro watches assets/ and will crash on a 0-byte file.
const tmpOut = join(dirname(out), `.splash-animation.${process.pid}.webp.tmp`);
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

try {
  run(`npx remotion render src/index.ts Splash "${tmp}" --sequence --image-format=png --scale=0.8`);
  run(
    `ffmpeg -y -loglevel error -framerate 60 -pattern_type glob -i "${tmp}/element-*.png" ` +
      `-c:v libwebp_anim -quality 68 -compression_level 6 -loop 0 -f webp "${tmpOut}"`,
  );
  renameSync(tmpOut, out);
  console.log(`Wrote ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
