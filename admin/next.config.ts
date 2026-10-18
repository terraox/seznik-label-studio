import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ['swagger-ui-react'],
};

export default nextConfig;
