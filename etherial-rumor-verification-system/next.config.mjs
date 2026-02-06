/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Gun/SEA must not be bundled server-side — their dynamic require() breaks webpack
  serverExternalPackages: ['gun'],
  webpack: (config, { isServer }) => {
    // Suppress dynamic require warnings from Gun
    config.module.exprContextCritical = false;
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
      };
    }
    return config;
  },
}

export default nextConfig
