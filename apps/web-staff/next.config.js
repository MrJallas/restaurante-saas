/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@restaurant/shared-types'],

  // A05: conjunto seguro de headers de segurança em toda resposta (só os que
  // NÃO alteram render: anti-MIME-sniff, anti-clickjacking, referrer, HSTS).
  // CSP/Permissions-Policy ficam de follow-up (precisam de teste por-página).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
