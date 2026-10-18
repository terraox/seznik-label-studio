#!/usr/bin/env node
// Secret scan. No dependencies, CI-ready (exit 1 when anything is found).
//
//   node scripts/secret-scan.mjs              working tree (tracked + untracked, not ignored)
//   node scripts/secret-scan.mjs --staged     what is staged (used by the pre-commit hook)
//   node scripts/secret-scan.mjs --history    every line ever added on any branch
//   add --json for machine output
//
// Values are never printed in full. Known-leaked values are matched by SHA-256 so this file
// does not re-publish them. A line containing `secret-scan:ignore` is skipped; path prefixes
// listed in .secret-scan-allow (one per line, # comments) are skipped.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';

// Always work from the repository root, so paths and .secret-scan-allow mean the same from any folder.
process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());

const args = new Set(process.argv.slice(2));
const MODE = args.has('--history') ? 'history' : args.has('--staged') ? 'staged' : 'tree';
const AS_JSON = args.has('--json');
const MAX_BYTES = 1_500_000;

const LEAKED_SHA256 = new Set([
  'be789fd6ee7a6a0fd7163305d7774c901fa5f13f6e71a0db804030ff86fed99a',
  '443af5fe03d1d2cf3a2296f9fa6aa7b03d6ffd91a2626edc6522a9c0606374f2',
  '4c525a10308a40f22e91b2934139c79256c4e73818ebd60ee4efba0ff6c260b9',
  'c21efa123039859634ce3d096e556d97ddc2ac4742d84d77fc35e87f9f2e195a',
  'faa5f8c82e3cbaa03042404b983430f1c4ab0d1e3ecb6e21800b4848cc5a8f14',
]);

const SKIP_PATH = [
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)package-lock\.json$/,
  /\.lock$/,
  /^assets\//,
  /^backend\/GD985-SDK\//,
  /\.(png|jpe?g|gif|webp|ico|pdf|docx|zip|aar|jar|so|ttf|otf|woff2?|mp4|numbers)$/i,
];

const allowPrefixes = existsSync('.secret-scan-allow')
  ? readFileSync('.secret-scan-allow', 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  : [];

const sha = (s) => createHash('sha256').update(s).digest('hex');
const mask = (v) => (v.length <= 6 ? '***' : `${v.slice(0, 2)}***(${v.length} chars)`);

const PLACEHOLDER =
  /^(password|passwd|secret|changeme|\*+|<.*>|\$\{?.*|process\.env.*|.*(replace-?with|change-?me|your[-_]|example|placeholder|xxxxxx|\*\*\*\*|user:password|USER:PASSWORD).*)$/i;
const looksLikeCode = /[()[\]{}]|=>|^[a-z]+\.[a-z]/i; // call, index, arrow, member access
const hasVariety = (v) => /\d/.test(v) || /[^A-Za-z]/.test(v);

/** [name, regex, valueGroup|0, extra filter on the value] */
const RULES = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, 0],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 0],
  ['aws-secret-key', /aws_?secret_?access_?key["'\s:=]+([A-Za-z0-9/+=]{40})/i, 1],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, 0],
  [
    'msg91-auth-key',
    /MSG91_AUTH_KEY\s*[:=]\s*['"]?([A-Za-z0-9]{16,})/,
    1,
    (v) => !PLACEHOLDER.test(v),
  ],
  [
    'database-url-remote-credentials',
    /postgres(?:ql)?:\/\/([^:\s/@]+):([^@\s]+)@(?!localhost|127\.0\.0\.1|\[::1\])([^/\s:]+)/i,
    2,
    (v) => !PLACEHOLDER.test(v),
  ],
  [
    'hardcoded-credential',
    /\b[\w.-]*(?:password|passwd|secret|token|api[_-]?key|auth[_-]?key)[\w.-]*['"]?\s*[:=]\s*(?:\w+\()?['"]([^'"\s]{8,})['"]/i,
    1,
    (v) =>
      !PLACEHOLDER.test(v) &&
      !looksLikeCode.test(v) &&
      hasVariety(v) &&
      !/^https?:/.test(v) &&
      !/^[A-Z][A-Z0-9_]+$/.test(v), // an env var name, not a value
  ],
];

function* tokens(line) {
  for (const raw of line.split(/[\s'"`<>(){}[\],;=]+/)) {
    if (raw.length < 6 || raw.length > 80) continue;
    yield raw;
    const trimmed = raw.replace(/[.:;!?)]+$/, '');
    if (trimmed !== raw && trimmed.length >= 6) yield trimmed;
  }
}

function scanLine(line) {
  if (line.includes('secret-scan:ignore') || line.length > 2000) return [];
  const hits = [];
  for (const tok of tokens(line)) {
    if (LEAKED_SHA256.has(sha(tok))) hits.push({ rule: 'known-leaked-value', value: tok });
  }
  for (const [rule, re, group, ok] of RULES) {
    const m = re.exec(line);
    if (!m) continue;
    const value = group === 0 ? m[0] : (m[group] ?? m[0]);
    if (ok && !ok(value)) continue;
    hits.push({ rule, value });
  }
  return hits;
}

const git = (a, opts = {}) =>
  execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'], ...opts });

const skip = (path) => SKIP_PATH.some((re) => re.test(path)) || allowPrefixes.some((p) => path.startsWith(p));

const findings = [];
const add = (where, hit, line, lineNo) =>
  findings.push({ where, rule: hit.rule, line: lineNo, sample: mask(hit.value) });

function scanText(path, text, where = path) {
  if (text.includes('\0')) return;
  text.split('\n').forEach((line, i) => {
    for (const hit of scanLine(line)) add(where, hit, line, i + 1);
  });
}

if (MODE === 'history') {
  const log = git(['log', '--all', '-p', '--no-color', '-U0', '--format=@@commit %h'], { maxBuffer: 1 << 30 });
  let commit = '';
  let file = '';
  const seen = new Set();
  for (const line of log.split('\n')) {
    if (line.startsWith('@@commit ')) commit = line.slice(9);
    else if (line.startsWith('+++ b/')) file = line.slice(6);
    else if (line.startsWith('+') && !line.startsWith('+++') && file && !skip(file)) {
      for (const hit of scanLine(line.slice(1))) {
        const key = `${hit.rule}|${file}|${sha(hit.value)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        add(`${file}@${commit}`, hit, line, 0);
      }
    }
  }
} else if (MODE === 'staged') {
  const names = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean);
  for (const path of names) {
    if (skip(path)) continue;
    let text;
    try {
      text = git(['show', `:${path}`]);
    } catch {
      continue;
    }
    if (text.length <= MAX_BYTES) scanText(path, text);
  }
} else {
  const names = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  for (const path of names) {
    if (skip(path) || !existsSync(path)) continue;
    try {
      if (statSync(path).size > MAX_BYTES) continue;
      scanText(path, readFileSync(path, 'utf8'));
    } catch {
      /* unreadable or a directory entry: ignore */
    }
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ mode: MODE, findings }, null, 2));
} else if (findings.length === 0) {
  console.log(`secret-scan (${MODE}): clean`);
} else {
  console.log(`secret-scan (${MODE}): ${findings.length} finding(s)`);
  for (const f of findings) {
    console.log(`  [${f.rule}] ${f.where}${f.line ? `:${f.line}` : ''}  ${f.sample}`);
  }
}
process.exit(findings.length ? 1 : 0);
