/**
 * One-time interactive setup for iOS internal (ad hoc) signing.
 * GitHub / dashboard builds stay non-interactive and will fail until this succeeds.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

const major = Number(process.versions.node.split('.')[0]);
if (Number.isFinite(major) && major < 22) {
  console.error(
    `Node.js 22+ required (this shell is ${process.version} at ${process.execPath}).`
  );
  process.exit(1);
}

const profile = process.argv[2] || 'preview';
const easCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args) {
  const result = spawnSync(easCmd, ['--yes', 'eas-cli', ...args], {
    stdio: 'inherit',
    shell: false,
    cwd: projectRoot,
    env: process.env,
  });
  return result.status ?? 1;
}

console.log(`
iOS internal distribution needs Apple ad-hoc credentials on the Expo project.
Dashboard / GitHub builds cannot create them (non-interactive).

1) Log in as an Expo account that can manage this app (owner is "yttfuy"):
     npx eas-cli login
2) This script will configure build credentials for profile "${profile}".
3) Register the iPhone if prompted (or run: npx eas-cli device:create).
`);

const who = spawnSync(easCmd, ['--yes', 'eas-cli', 'whoami'], {
  encoding: 'utf8',
  shell: false,
  cwd: projectRoot,
  env: process.env,
});
process.stdout.write(who.stdout || '');
process.stderr.write(who.stderr || '');

const info = spawnSync(easCmd, ['--yes', 'eas-cli', 'project:info'], {
  encoding: 'utf8',
  shell: false,
  cwd: projectRoot,
  env: process.env,
});
if ((info.status ?? 1) !== 0) {
  process.stdout.write(info.stdout || '');
  process.stderr.write(info.stderr || '');
  console.error(
    `\nCannot read this EAS project. You are logged into the wrong Expo account.\n` +
      `Run: npx eas-cli logout && npx eas-cli login\n` +
      `Use an account with access to owner "yttfuy" / project seznik-label-studio, then re-run:\n` +
      `  npm run credentials:ios\n`
  );
  process.exit(1);
}
process.stdout.write(info.stdout || '');

const code = run([
  'credentials:configure-build',
  '--platform',
  'ios',
  '--profile',
  profile,
]);
if (code !== 0) {
  process.exit(code);
}

console.log(`
Credentials configured for profile "${profile}".
Next:
  npm run build:ios          # internal IPA (preview)
  # or trigger the GitHub/dashboard build again
`);
process.exit(0);
