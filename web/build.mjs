// Bundles web/src/main.ts (which reuses ../src/lib/label-share) into web/public/app.js, optionally serving it.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');
const port = Number(process.env.PORT || 5173);

// The phone app's native modules are never needed by the pure label code; stub them if a chain reaches one.
const stubNative = {
  name: 'stub-native',
  setup(build) {
    build.onResolve({ filter: /^(react-native|expo|@expo|@react-native|react-native-.*|@shopify)/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = new Proxy({}, { get: () => () => ({}) });', loader: 'js' }));
  },
};

const options = {
  plugins: [stubNative],
  loader: { '.ttf': 'empty', '.png': 'empty', '.jpg': 'empty', '.webp': 'empty' },
  entryPoints: [path.join(here, 'src/main.ts')],
  outfile: path.join(here, 'public/app.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  sourcemap: true,
  logLevel: 'info',
  // The app's own code uses "@/…" for src/… — the web bench reuses the same pure modules.
  alias: { '@': path.join(here, '../src') },
  define: { __DEV__: 'true', 'process.env.NODE_ENV': '"development"' },
  nodePaths: [path.join(here, '../node_modules')],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}

if (serve) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.svg': 'image/svg+xml' };
  createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const file = path.join(here, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(path.join(here, 'public'))) { res.writeHead(403).end(); return; }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404).end('not found');
    }
  }).listen(port, () => console.log(`Sez Print web lab: http://localhost:${port}`));
}
