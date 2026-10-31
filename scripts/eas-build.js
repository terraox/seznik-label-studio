/**
 * EAS build helper: uploads the current working tree (including uncommitted files)
 * while excluding paths listed in .easignore.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const major = Number(process.versions.node.split('.')[0]);
if (Number.isFinite(major) && major < 22) {
  console.error(
    `EAS CLI needs Node.js 22+ (this shell is running ${process.version} at ${process.execPath}).\n` +
      `Use the Node 22+ install (e.g. "C:\\Program Files\\nodejs\\node.exe"), then re-run.`
  );
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);
process.env.EAS_NO_VCS = '1';
process.env.EAS_PROJECT_ROOT = projectRoot;

const platform = process.argv[2] || 'android';
const profile = process.argv[3] || 'preview';

const easCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

if (platform === 'ios') {
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
      `\nWrong Expo account for this project (app.json owner is "yttfuy").\n` +
        `Run: npx eas-cli logout && npx eas-cli login\n` +
        `Then once: npm run credentials:ios\n` +
        `GitHub/dashboard iOS builds stay non-interactive and need those credentials first.\n`
    );
    process.exit(1);
  }
}

const args = [
  'build',
  '--platform',
  platform,
  '--profile',
  profile,
  '--clear-cache',
];

// iOS internal/ad-hoc signing needs interactive prompts the first time
// (create cert / register devices). Android can stay fully non-interactive.
// Never force --non-interactive for iOS — dashboard/GitHub already is non-interactive
// and will fail until `npm run credentials:ios` has been completed once.
if (platform !== 'ios') {
  args.push('--non-interactive');
}

const fullArgs = ['--yes', 'eas-cli', ...args];

const result = spawnSync(easCmd, fullArgs, {
  stdio: 'inherit',
  shell: false,
  cwd: projectRoot,
  env: process.env,
});

process.exit(result.status ?? 1);
