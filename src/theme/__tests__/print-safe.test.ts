import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { PRINT_SAFE_DIRS, PRINT_SAFE_FILES } from './theme-files';

const ROOT = join(__dirname, '..', '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const ALL_PRINT_SAFE = [
  ...PRINT_SAFE_FILES.map((f) => join(ROOT, f)),
  ...PRINT_SAFE_DIRS.flatMap((d) => walk(join(ROOT, d))),
];

/** Anything that would let the app theme reach the label or the print output. */
const THEME_IMPORT =
  /from\s+['"]@\/theme(?:\/[^'"]*)?['"]|from\s+['"]@\/hooks\/use-(?:theme|color-scheme)['"]|\buseColorScheme\b|\bAppearance\b|\buseColors\b|\bmakeStyles\b/;

test('print-safe files never read the app theme', () => {
  const failures = ALL_PRINT_SAFE.filter((file) => THEME_IMPORT.test(readFileSync(file, 'utf8')));
  assert.deepEqual(failures.map((f) => relative(ROOT, f)), []);
});

/** Text of each `<Text ...>` / `<TextInput ...>` opening tag (braces balanced). */
function openingTags(source: string): { tag: string; line: number }[] {
  const out: { tag: string; line: number }[] = [];
  const re = /<(Text|TextInput)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 0;
    let i = m.index + 1;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0 && source[i - 1] !== '=') break;
    }
    out.push({ tag: source.slice(m.index, i + 1), line: source.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** `styles.name` blocks in a StyleSheet that set a colour. */
function coloredStyleNames(source: string): Set<string> {
  const names = new Set<string>();
  const re = /^\s+(\w+):\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) break;
    }
    if (/\bcolor\s*:/.test(source.slice(m.index + m[0].length, i))) names.add(m[1]);
  }
  return names;
}

/** Local variables built by a helper that is itself checked to return a colour. */
function coloredHelperVars(source: string): Set<string> {
  const vars = new Set<string>();
  const helper = /function\s+(\w+)\([\s\S]*?\n\}/g;
  const coloredHelpers = new Set<string>();
  let h: RegExpExecArray | null;
  while ((h = helper.exec(source))) {
    if (/return\s*\{[\s\S]*\bcolor\s*:/.test(h[0])) coloredHelpers.add(h[1]);
  }
  const decl = /const\s+(\w+)\s*=\s*([\s\S]{0,40}?)(\w+)\(/g;
  let d: RegExpExecArray | null;
  while ((d = decl.exec(source))) {
    if (coloredHelpers.has(d[3])) vars.add(d[1]);
  }
  return vars;
}

function hasExplicitColor(tag: string, styleNames: Set<string>, helperVars: Set<string>): boolean {
  // Skia <Text color={...}> and inline style objects.
  if (/\bcolor\b/.test(tag)) return true;
  for (const m of tag.matchAll(/styles\.(\w+)/g)) if (styleNames.has(m[1])) return true;
  const styleExpr = /style=\{\[?\s*(\w+)/.exec(tag);
  return !!styleExpr && helperVars.has(styleExpr[1]);
}

test('every <Text> in a print-safe file sets an explicit colour', () => {
  const failures: string[] = [];
  for (const file of ALL_PRINT_SAFE.filter((f) => f.endsWith('.tsx'))) {
    const source = readFileSync(file, 'utf8');
    const styleNames = coloredStyleNames(source);
    const helperVars = coloredHelperVars(source);
    for (const { tag, line } of openingTags(source)) {
      if (!hasExplicitColor(tag, styleNames, helperVars)) {
        failures.push(`${relative(ROOT, file)}:${line} ${tag.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(failures, [], `Android paints colourless text white in dark mode:\n${failures.join('\n')}`);
});

/** Resolve an import specifier to a file under src (aliases and relative paths only). */
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const specs = [...src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/g)]
    // type-only imports are erased at build time
    .filter((m) => !/^(?:import|export)\s+type\s/.test(m[0]))
    .map((m) => m[1] ?? m[2]);
  return specs.map((s) => resolveImport(file, s)).filter((p): p is string => !!p);
}

test('print-safe files never reach the app theme through their imports', () => {
  const themeDir = join(ROOT, 'src', 'theme');
  const failures: string[] = [];
  for (const start of ALL_PRINT_SAFE) {
    const seen = new Map<string, string | null>([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const file = queue.shift()!;
      for (const dep of importsOf(file)) {
        if (seen.has(dep)) continue;
        seen.set(dep, file);
        if (dep.startsWith(themeDir) && !dep.endsWith('tokens.ts')) {
          const chain: string[] = [];
          for (let f: string | null = dep; f; f = seen.get(f) ?? null) chain.unshift(relative(ROOT, f));
          failures.push(chain.join(' -> '));
        } else {
          queue.push(dep);
        }
      }
    }
  }
  assert.deepEqual([...new Set(failures)], []);
});
