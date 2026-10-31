/**
 * One-time interactive setup for iOS signing credentials.
 * GitHub / dashboard builds stay non-interactive and fail until this succeeds
 * AND the Expo account has Release Manager (or Owner) on the org.
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
iOS EAS builds need:
  A) Expo account with Release Manager or Owner on the project org
     (VIEW/RUN/PUBLISH alone cannot read Apple credentials when
      "credentials protection" is on)
  B) Interactive Apple login once to validate the distribution certificate

1) Log in as Owner / Release Manager (project owner in app.json is "yttfuy"):
     npx eas-cli logout && npx eas-cli login
2) This script configures credentials for profile "${profile}".
3) Sign in to Apple when asked.
4) For internal/ad-hoc profiles, register the iPhone (npx eas-cli device:create).

If you see "Release Manager role or higher", an Owner must grant that role at:
  https://expo.dev/accounts/[account]/settings/members
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
    `\nCannot read this EAS project. Wrong Expo account or insufficient role.\n` +
      `Run: npx eas-cli logout && npx eas-cli login\n` +
      `Use Owner/Release Manager for owner "yttfuy" / seznik-label-studio, then:\n` +
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
  console.error(`
If the error mentions Release Manager / credentials protection:
  Ask the Expo org Owner to set your member role to Release Manager (or Owner),
  then re-run this command. Code/git cannot grant that permission.
`);
  process.exit(code);
}

console.log(`
Credentials configured for profile "${profile}".
Next — ONE interactive build from this terminal (not the Expo website):
  npx eas-cli build -p ios --profile ${profile}

After that succeeds once, GitHub/dashboard non-interactive builds will work.
`);
process.exit(0);
