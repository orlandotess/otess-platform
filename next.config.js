const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n/request.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a second `next dev` (e.g. an agent's preview server) run against this
  // same checkout without corrupting the webpack cache of the primary one —
  // set CLAUDE_DIST_DIR to give it its own .next-* build output.
  distDir: process.env.CLAUDE_DIST_DIR || '.next',
  experimental: {
    missingSuspenseWithCSRBailout: false,
    staleTimes: {
      dynamic: 0,
    },
  },
}
module.exports = withNextIntl(nextConfig)
