/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    missingSuspenseWithCSRBailout: false,
    staleTimes: {
      dynamic: 0,
    },
  },
}
module.exports = nextConfig
