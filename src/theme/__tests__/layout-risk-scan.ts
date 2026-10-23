/**
 * Static scan for layout patterns that break on narrow phones (320–360 dp) or with a large system
 * font. Used by layout-risks.test.ts (ratchet against a baseline) and scripts/layout-risks.ts
 * (report). Node only: reads files and uses the TypeScript parser. Never imported by the app.
 *
 * It reads styles from `StyleSheet.create`, `makeStyles`, `themedStyles` and inline style objects,
 * then estimates text heights at FONT_SCALE_CAP. It is a heuristic: it finds likely problems, it
 * cannot see the rendered screen. Mark a checked false positive with `layout-ok: <reason>` on the
 * flagged line or the line above.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';

import { FONT_SCALE_CAP } from '../font-scale';
import { PRINT_SAFE_DIRS, PRINT_SAFE_FILES } from './theme-files';

export { FONT_SCALE_CAP };

export const ROOT = join(__dirname, '..', '..', '..');

export type RuleId =
  | 'stale-dimensions'
  | 'fixed-height-text'
  | 'wide-fixed-width'
  | 'row-text-no-shrink'
  | 'row-map-no-wrap';

export const RULES: Record<RuleId, string> = {
  'stale-dimensions': 'Dimensions.get() is read once and goes stale; use useWindowDimensions()',
  'fixed-height-text': 'Fixed height is shorter than its text at a large system font; use minHeight',
  'wide-fixed-width': 'Fixed width wider than a 320 dp phone allows (288 dp after side padding)',
  'row-text-no-shrink': 'Text in a row with no flexShrink/flex pushes siblings off narrow screens',
  'row-map-no-wrap': 'Row renders a list with no flexWrap; overflows when items do not fit',
};

export type Risk = { rule: RuleId; line: number; text: string };

/** Line height as a multiple of fontSize when a style sets none (Roboto / SF ≈ 1.17–1.2). */
const LINE_HEIGHT_RATIO = 1.2;
const DEFAULT_FONT_SIZE = 14;
/** Text this much taller than its box is not visible as a problem. */
const OVERSHOOT_OK = 2;
/** Narrowest supported phone (320 dp) minus 16 dp padding each side. */
export const NARROW_CONTENT_WIDTH = 288;

/** Dev and test screens: not shipped to users, not scanned. */
const DEV_SCREEN =
  /^src\/app\/(phase\d|stage-a-gates|dev-skia-test|ground-truth-parity|dot-buffer-1k|canvas-skia-prototype|calibration-|[\w-]*diagnostics)/;

const SVG_TAGS = new Set(['Svg', 'G', 'Canvas', 'Group', 'Defs', 'ClipPath', 'Mask']);
const TEXT_TAG = /^(Animated\.)?Text$|^ThemedText$/;
const INPUT_TAG = /^(Animated\.)?TextInput$|^BottomSheetTextInput$/;

type Value = number | string;
type Style = Record<string, Value>;
type Env = { nums: Map<string, number>; styles: Map<string, Style> };

/** Every user-facing .tsx under src/app and src/components, repo-relative. */
export function scannedFiles(): string[] {
  const printSafe = new Set(PRINT_SAFE_FILES);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full);
      return name.endsWith('.tsx') && !name.endsWith('.web.tsx') ? [full] : [];
    });
  return ['src/app', 'src/components']
    .flatMap((d) => walk(join(ROOT, d)))
    .map((f) => relative(ROOT, f).split('\\').join('/'))
    .filter((f) => !printSafe.has(f) && !PRINT_SAFE_DIRS.some((d) => f.startsWith(d + '/')))
    .filter((f) => !DEV_SCREEN.test(f))
    .sort();
}

// ---------------------------------------------------------------------------------------------
// Constants: Spacing, HomeLayout, Type and MaxContentWidth from the shared files, plus each
// file's own top-level `const X = 12` / `const X = { ... }`.

function unwrap(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}

function propName(p: ts.ObjectLiteralElementLike): string | null {
  if (!p.name) return null;
  if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) return p.name.text;
  return null;
}

function evalNum(e: ts.Expression, env: Env): number | null {
  e = unwrap(e);
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken) {
    const v = evalNum(e.operand, env);
    return v == null ? null : -v;
  }
  if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) {
    const key = e.getText();
    if (key === 'StyleSheet.hairlineWidth') return 0.5;
    return env.nums.get(key) ?? null;
  }
  if (ts.isBinaryExpression(e)) {
    const a = evalNum(e.left, env);
    const b = evalNum(e.right, env);
    if (a == null || b == null) return null;
    switch (e.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken: return a + b;
      case ts.SyntaxKind.MinusToken: return a - b;
      case ts.SyntaxKind.AsteriskToken: return a * b;
      case ts.SyntaxKind.SlashToken: return b === 0 ? null : a / b;
    }
  }
  return null;
}

/** Style object literal → flat style. Unknown values are kept as '?' so the key still counts. */
function parseStyle(obj: ts.ObjectLiteralExpression, env: Env): Style {
  const out: Style = {};
  for (const p of obj.properties) {
    if (ts.isSpreadAssignment(p)) {
      Object.assign(out, env.styles.get(unwrap(p.expression).getText()) ?? {});
      continue;
    }
    const name = propName(p);
    if (!name) continue;
    if (ts.isShorthandPropertyAssignment(p)) {
      out[name] = env.nums.get(name) ?? '?';
      continue;
    }
    if (!ts.isPropertyAssignment(p)) continue;
    const init = unwrap(p.initializer);
    const n = evalNum(init, env);
    if (n != null) out[name] = n;
    else if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) out[name] = init.text;
    else out[name] = '?';
  }
  return out;
}

/** Top-level `const X = number | { ... }` (nested one level) into the env. */
function collectConsts(sf: ts.SourceFile, env: Env) {
  const addObject = (prefix: string, obj: ts.ObjectLiteralExpression) => {
    env.styles.set(prefix, parseStyle(obj, env));
    for (const p of obj.properties) {
      const name = propName(p);
      if (!name || !ts.isPropertyAssignment(p)) continue;
      const init = unwrap(p.initializer);
      if (ts.isObjectLiteralExpression(init)) addObject(`${prefix}.${name}`, init);
      else {
        const n = evalNum(init, env);
        if (n != null) env.nums.set(`${prefix}.${name}`, n);
      }
    }
  };
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const init = unwrap(d.initializer);
      if (ts.isObjectLiteralExpression(init)) addObject(d.name.text, init);
      else {
        const n = evalNum(init, env);
        if (n != null) env.nums.set(d.name.text, n);
      }
    }
  }
}

function parse(fileName: string, source: string) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

let sharedEnv: Env | null = null;
function baseEnv(): Env {
  if (!sharedEnv) {
    sharedEnv = { nums: new Map(), styles: new Map() };
    for (const f of ['src/constants/theme.ts', 'src/constants/ui.ts']) {
      collectConsts(parse(f, readFileSync(join(ROOT, f), 'utf8')), sharedEnv);
    }
  }
  return { nums: new Map(sharedEnv.nums), styles: new Map(sharedEnv.styles) };
}

// ---------------------------------------------------------------------------------------------
// Scan

/** The object a `StyleSheet.create` / `makeStyles` / `themedStyles` call builds, if it is a literal. */
function styleSheetObject(call: ts.CallExpression): ts.ObjectLiteralExpression | null {
  const callee = call.expression.getText();
  const arg = call.arguments[0];
  if (!arg) return null;
  if (callee === 'StyleSheet.create') {
    const a = unwrap(arg);
    return ts.isObjectLiteralExpression(a) ? a : null;
  }
  if ((callee === 'makeStyles' || callee === 'themedStyles') && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
    const body = arg.body;
    if (ts.isBlock(body)) {
      const ret = body.statements.find(ts.isReturnStatement);
      const e = ret?.expression && unwrap(ret.expression);
      return e && ts.isObjectLiteralExpression(e) ? e : null;
    }
    const e = unwrap(body);
    return ts.isObjectLiteralExpression(e) ? e : null;
  }
  return null;
}

type El = ts.JsxElement | ts.JsxSelfClosingElement;
type Child =
  | { kind: 'el'; el: El }
  | { kind: 'map'; el: El | null }
  /** `c ? <A/> : <B/>`: only one of them renders. */
  | { kind: 'alt'; els: El[] }
  | { kind: 'text'; dynamic: boolean; length: number };

function opening(el: El) {
  return ts.isJsxElement(el) ? el.openingElement : el;
}
function tagOf(el: El) {
  return opening(el).tagName.getText();
}
function attr(el: El, name: string): ts.Expression | ts.StringLiteral | true | null {
  for (const a of opening(el).attributes.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== name) continue;
    if (!a.initializer) return true;
    if (ts.isStringLiteral(a.initializer)) return a.initializer;
    return ts.isJsxExpression(a.initializer) ? (a.initializer.expression ?? null) : null;
  }
  return null;
}

/** JSX reachable from an expression: `a && <X/>`, `c ? <A/> : <B/>`, `list.map(i => <X/>)`. */
function jsxIn(e: ts.Expression | undefined, out: Child[]) {
  if (!e) return;
  e = unwrap(e);
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e)) out.push({ kind: 'el', el: e });
  else if (ts.isJsxFragment(e)) out.push(...childrenOf(e.children));
  else if (ts.isBinaryExpression(e)) jsxIn(e.right, out);
  else if (ts.isConditionalExpression(e)) {
    const branches: Child[] = [];
    jsxIn(e.whenTrue, branches);
    jsxIn(e.whenFalse, branches);
    const els = branches.flatMap((c) => (c.kind === 'el' ? [c.el] : c.kind === 'alt' ? c.els : []));
    if (els.length && els.length === branches.filter((c) => c.kind !== 'text').length) out.push({ kind: 'alt', els });
    else out.push(...branches);
  } else if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'map') {
    const cb = e.arguments[0];
    const inner: Child[] = [];
    if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
      if (ts.isBlock(cb.body)) {
        cb.body.forEachChild(function find(n) {
          if (ts.isReturnStatement(n)) jsxIn(n.expression, inner);
          else if (!ts.isFunctionLike(n)) n.forEachChild(find);
        });
      } else jsxIn(cb.body, inner);
    }
    const first = inner.find((c) => c.kind === 'el');
    out.push({ kind: 'map', el: first && first.kind === 'el' ? first.el : null });
  } else if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
    out.push({ kind: 'text', dynamic: false, length: e.text.length });
  } else out.push({ kind: 'text', dynamic: true, length: 0 });
}

function childrenOf(nodes: ts.NodeArray<ts.JsxChild>): Child[] {
  const out: Child[] = [];
  for (const c of nodes) {
    if (ts.isJsxText(c)) {
      const t = c.text.trim();
      if (t) out.push({ kind: 'text', dynamic: false, length: t.length });
    } else if (ts.isJsxExpression(c)) jsxIn(c.expression, out);
    else if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) out.push({ kind: 'el', el: c });
    else if (ts.isJsxFragment(c)) out.push(...childrenOf(c.children));
  }
  return out;
}

export function scanSource(fileName: string, source: string, env: Env = baseEnv()): Risk[] {
  const sf = parse(fileName, source);
  collectConsts(sf, env);
  const risks: Risk[] = [];
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const add = (rule: RuleId, n: ts.Node, text: string) => risks.push({ rule, line: lineOf(n), text });

  const checkWidths = (obj: ts.ObjectLiteralExpression) => {
    const style = parseStyle(obj, env);
    for (const key of ['width', 'minWidth'] as const) {
      const v = style[key];
      if (typeof v !== 'number' || v <= NARROW_CONTENT_WIDTH) continue;
      const prop = obj.properties.find((p) => propName(p) === key) ?? obj;
      add('wide-fixed-width', prop, `${key}: ${v}`);
    }
  };

  // Named styles first, so JSX can resolve `styles.x`.
  const named = new Map<string, Style>();
  sf.forEachChild(function find(n) {
    if (ts.isCallExpression(n)) {
      const obj = styleSheetObject(n);
      if (obj) {
        for (const p of obj.properties) {
          const name = propName(p);
          if (!name || !ts.isPropertyAssignment(p)) continue;
          const v = unwrap(p.initializer);
          if (!ts.isObjectLiteralExpression(v)) continue;
          named.set(name, { ...named.get(name), ...parseStyle(v, env) });
          checkWidths(v);
        }
      }
    }
    n.forEachChild(find);
  });

  const resolve = (e: ts.Expression | ts.StringLiteral | true | null): Style => {
    if (!e || e === true || ts.isStringLiteral(e)) return {};
    e = unwrap(e);
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) return named.get(e.name.text) ?? {};
    if (ts.isObjectLiteralExpression(e)) return parseStyle(e, env);
    if (ts.isArrayLiteralExpression(e)) return Object.assign({}, ...e.elements.map((x) => resolve(x)));
    if (ts.isBinaryExpression(e)) return resolve(e.right);
    if (ts.isConditionalExpression(e)) return { ...resolve(e.whenFalse), ...resolve(e.whenTrue) };
    // Pressable: style={({ pressed }) => [...]}
    if (ts.isArrowFunction(e) && !ts.isBlock(e.body)) return resolve(e.body);
    return {};
  };
  const numAttr = (el: El, name: string): number | null => {
    const a = attr(el, name);
    if (!a || a === true || ts.isStringLiteral(a)) return null;
    return evalNum(a, env);
  };
  const num = (s: Style, ...keys: string[]) => {
    for (const k of keys) if (typeof s[k] === 'number') return s[k] as number;
    return 0;
  };
  const padV = (s: Style) =>
    (num(s, 'paddingTop', 'paddingVertical', 'padding') + num(s, 'paddingBottom', 'paddingVertical', 'padding')) +
    (num(s, 'borderTopWidth', 'borderWidth') + num(s, 'borderBottomWidth', 'borderWidth'));
  const marginV = (s: Style) =>
    num(s, 'marginTop', 'marginVertical', 'margin') + num(s, 'marginBottom', 'marginVertical', 'margin');
  const isRow = (s: Style) => s.flexDirection === 'row' || s.flexDirection === 'row-reverse';

  const textHeight = (el: El, style: Style) => {
    const fontSize = num(style, 'fontSize') || DEFAULT_FONT_SIZE;
    const lineHeight = num(style, 'lineHeight') || fontSize * LINE_HEIGHT_RATIO;
    const allow = attr(el, 'allowFontScaling');
    const off = allow && allow !== true && !ts.isStringLiteral(allow) && allow.kind === ts.SyntaxKind.FalseKeyword;
    const max = numAttr(el, 'maxFontSizeMultiplier');
    // An explicit multiplier replaces the app cap (patches/react-native+0.81.5.patch). 0 lifts the
    // cap entirely; that is still checked at the app cap.
    const scale = off ? 1 : max != null && max >= 1 ? max : FONT_SCALE_CAP;
    const multiline = INPUT_TAG.test(tagOf(el)) ? 1 : (numAttr(el, 'numberOfLines') ?? 1);
    return lineHeight * scale * multiline;
  };

  /** Height an element needs, ignoring its own fixed height; `text` is set when Text was reached. */
  const contentNeed = (el: El, style: Style): { h: number; text: boolean } => {
    if (TEXT_TAG.test(tagOf(el)) || INPUT_TAG.test(tagOf(el))) return { h: textHeight(el, style) + padV(style), text: true };
    if (!ts.isJsxElement(el)) {
      const size = numAttr(el, 'size');
      return { h: (size ?? 0) + padV(style), text: false };
    }
    const need = (c: El) => {
      const s = resolve(attr(c, 'style'));
      if (s.position === 'absolute') return { h: 0, text: false };
      if (typeof s.height === 'number') return { h: s.height + marginV(s), text: false };
      const n = contentNeed(c, s);
      return { h: n.h + marginV(s), text: n.text };
    };
    const kids = childrenOf(el.children).flatMap((c) => {
      if (c.kind === 'el' || (c.kind === 'map' && c.el)) return [need(c.el!)];
      if (c.kind !== 'alt') return [];
      const opts = c.els.map(need);
      return [{ h: Math.max(...opts.map((o) => o.h)), text: opts.some((o) => o.text) }];
    });
    const gap = num(style, 'rowGap', 'gap');
    const h = isRow(style) || attr(el, 'horizontal') != null
      ? Math.max(0, ...kids.map((k) => k.h))
      : kids.reduce((sum, k) => sum + k.h, 0) + gap * Math.max(0, kids.length - 1);
    return { h: h + padV(style), text: kids.some((k) => k.text) };
  };

  const parentEl = (n: ts.Node): El | null => {
    for (let p = n.parent; p; p = p.parent) if (ts.isJsxElement(p)) return p;
    return null;
  };
  const insideSvg = (n: ts.Node) => {
    for (let p = n.parent; p; p = p.parent) if (ts.isJsxElement(p) && SVG_TAGS.has(tagOf(p))) return true;
    return false;
  };

  const visitEl = (el: El) => {
    if (insideSvg(el) || SVG_TAGS.has(tagOf(el))) return;
    const styleExpr = attr(el, 'style');
    if (styleExpr && styleExpr !== true && !ts.isStringLiteral(styleExpr)) {
      const visitObj = (e: ts.Expression) => {
        e = unwrap(e);
        if (ts.isObjectLiteralExpression(e)) checkWidths(e);
        else if (ts.isArrayLiteralExpression(e)) e.elements.forEach(visitObj);
        else if (ts.isBinaryExpression(e)) visitObj(e.right);
        else if (ts.isConditionalExpression(e)) [e.whenTrue, e.whenFalse].forEach(visitObj);
      };
      visitObj(styleExpr);
    }
    const style = resolve(styleExpr);
    const tag = tagOf(el);

    if (typeof style.height === 'number') {
      const need = contentNeed(el, style);
      if (need.text && need.h > style.height + OVERSHOOT_OK) {
        add('fixed-height-text', el, `<${tag}> height ${style.height}, text needs ~${Math.ceil(need.h)} at font ×${FONT_SCALE_CAP}`);
      }
    }

    if (!ts.isJsxElement(el) || !isRow(style) || style.flexWrap === 'wrap') return;
    const kids = childrenOf(el.children);
    const parent = parentEl(el);
    const horizontal = (e: El | null) => e != null && attr(e, 'horizontal') != null;
    // Items that flex or take a % width share the row (segmented controls) and cannot overflow it.
    const sharesRow = (s: Style) =>
      ['flex', 'flexShrink', 'flexBasis', 'maxWidth'].some((key) => key in s) || typeof s.width === 'string';
    const fixedItems = kids.some((k) => k.kind === 'map' && !(k.el && sharesRow(resolve(attr(k.el, 'style')))));
    // A row with a fixed width (an icon, a swatch) is sized for its items on every screen.
    if (fixedItems && typeof style.width !== 'number' && !horizontal(el) && !horizontal(parent)) {
      add('row-map-no-wrap', el, `<${tag}> row maps a list without flexWrap`);
    }
    if (kids.filter((k) => k.kind !== 'text').length < 2) return;
    const texts = kids.flatMap((k) => (k.kind === 'el' ? [k.el] : k.kind === 'alt' ? k.els : []));
    for (const t of texts) {
      if (!TEXT_TAG.test(tagOf(t)) || !ts.isJsxElement(t)) continue;
      const s = resolve(attr(t, 'style'));
      if (['flex', 'flexShrink', 'flexGrow', 'flexBasis', 'width', 'maxWidth'].some((key) => key in s)) continue;
      const content = childrenOf(t.children);
      const long = content.some((c) => c.kind === 'map' || (c.kind === 'text' && (c.dynamic || c.length > 12)));
      if (long) add('row-text-no-shrink', t, `<${tagOf(t)}> in a row without flexShrink`);
    }
  };

  sf.forEachChild(function visit(n) {
    if (ts.isCallExpression(n) && n.expression.getText() === 'Dimensions.get') {
      add('stale-dimensions', n, n.getText());
    }
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) visitEl(n);
    n.forEachChild(visit);
  });

  // `layout-ok: <reason>` on the flagged line or the line above marks a checked false positive.
  const lines = source.split('\n');
  const ok = (line: number) => /layout-ok:/.test(lines[line - 1] ?? '') || /layout-ok:/.test(lines[line - 2] ?? '');
  return risks.filter((r) => !ok(r.line)).sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

export function scanFile(file: string): Risk[] {
  return scanSource(file, readFileSync(join(ROOT, file), 'utf8'));
}

export type Counts = Record<string, Partial<Record<RuleId, number>>>;

export function countRisks(byFile: Record<string, Risk[]>): Counts {
  const out: Counts = {};
  for (const [file, risks] of Object.entries(byFile)) {
    if (!risks.length) continue;
    const c: Partial<Record<RuleId, number>> = {};
    for (const r of risks) c[r.rule] = (c[r.rule] ?? 0) + 1;
    out[file] = c;
  }
  return out;
}

export function scanAll(): Record<string, Risk[]> {
  return Object.fromEntries(scannedFiles().map((f) => [f, scanFile(f)]));
}

export const BASELINE_PATH = join(__dirname, 'layout-risks.baseline.json');
