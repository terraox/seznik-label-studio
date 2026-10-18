import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Lets a second dev server (the private test server) run without fighting over .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ['swagger-ui-react'],
  // Native addon: loaded by Node as is, not bundled.
  serverExternalPackages: ['@resvg/resvg-js'],
  // The catalogue validates uploads with the mobile app's own SVG reader (../src/lib/clipart/parse-svg.ts).
  experimental: { externalDir: true },
};

export default nextConfig;
