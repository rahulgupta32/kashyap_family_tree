/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kashyap/contracts', '@kashyap/localization', '@kashyap/design-tokens'],
}

module.exports = nextConfig
