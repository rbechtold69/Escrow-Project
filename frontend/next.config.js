/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['avatars.githubusercontent.com'],
  },
  webpack: (config) => {
    // Handle modules that wagmi connectors try to import but don't exist in browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
      '@react-native-async-storage/async-storage': false,
    };
    
    // Ignore these optional peer dependencies
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    
    return config;
  },
};

module.exports = nextConfig;
