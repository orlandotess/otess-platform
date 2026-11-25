const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n/request.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sin esto Turbopack sube por el árbol buscando la raíz y encuentra un
  // package-lock.json suelto en ~/, fuera del repo — y avisa que lo ignora.
  turbopack: {
    root: __dirname,
  },
  // Lets a second `next dev` (e.g. an agent's preview server) run against this
  // same checkout without clobbering the build output of the primary one —
  // set CLAUDE_DIST_DIR to give it its own .next-* directory.
  distDir: process.env.CLAUDE_DIST_DIR || '.next',
  // Server-side PDFs (lib/serverPdf.js): keep Chromium out of the bundle and
  // ship its compressed binary with the PDF routes — and only those, it's big.
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  // Keys are glob patterns, so the route's [brackets] must be escaped.
  // The whole package goes in (it's imported dynamically, so not traced).
  outputFileTracingIncludes: Object.fromEntries(
    ['/estimado/[id]/pdf', '/factura/[id]/pdf', '/propuesta/[token]/pdf',
      '/reporte/[id]/pdf', '/reporte-boleto/[id]/pdf', '/reporte-mantenimiento/[id]/pdf']
      .map(route => [route.replace(/[[\]]/g, '\\$&'), ['./node_modules/@sparticuz/chromium/**']])
  ),
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
}
module.exports = withNextIntl(nextConfig)
