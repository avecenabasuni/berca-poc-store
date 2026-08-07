const checkEnvVariables = require("./check-env-variables")

checkEnvVariables()

/**
 * Medusa Cloud-related environment variables
 */
const S3_HOSTNAME = process.env.MEDUSA_CLOUD_S3_HOSTNAME
const S3_PATHNAME = process.env.MEDUSA_CLOUD_S3_PATHNAME
const MEDUSA_BACKEND_URL = (
  process.env.MEDUSA_BACKEND_URL_INTERNAL ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9000"
).replace(/\/$/, "")

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  serverExternalPackages: ["dd-trace"],
  reactStrictMode: true,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "*.s3.*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...(S3_HOSTNAME && S3_PATHNAME
        ? [
            {
              protocol: "https",
              hostname: S3_HOSTNAME,
              pathname: S3_PATHNAME,
            },
          ]
        : []),
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/medusa/store/:path*",
        destination: `${MEDUSA_BACKEND_URL}/store/:path*`,
      },
      {
        source: "/api/medusa/auth/:path*",
        destination: `${MEDUSA_BACKEND_URL}/auth/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
