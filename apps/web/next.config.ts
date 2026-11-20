import type { NextConfig } from 'next';
import { API_URL } from './lib/config';

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // El navegador habla siempre con este mismo dominio: /api/* se reenvía a la API de LinTICK.
  // Así la cookie de sesión es de primera parte y no hace falta CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
