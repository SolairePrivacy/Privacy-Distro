import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: ({
    serverActions: {
      bodySizeLimit: '2mb'
    },
    // Ensure these heavy/native deps are treated as external for server bundling
    serverComponentsExternalPackages: ['privacycash', '@lightprotocol/hasher.rs'],
    // Ensure required circuit assets from privacycash are included in the server output for all API routes
    outputFileTracingIncludes: {
      '/api/**': [
        'node_modules/privacycash/circuit2/transaction2.wasm',
        'node_modules/privacycash/circuit2/transaction2.zkey'
      ]
    }
  } as any)
};

export default nextConfig;


