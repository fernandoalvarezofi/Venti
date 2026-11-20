# VENTI — web pública

App Next.js (App Router) con el marketplace: catálogo, detalle de evento, reserva, ingreso y "Mis entradas".

## Cómo habla con la API
- **Navegador → web:** todo pasa por el mismo dominio. `/api/*` se reenvía a la API (ver `next.config.ts`), así la cookie de sesión es de primera parte y no hace falta CORS.
- **Servidor de la web → API:** `lib/api.ts` llama a `API_URL` y reenvía la sesión como `Bearer`.
- `API_URL` tiene un valor por defecto: la API publicada. En desarrollo: `API_URL=http://localhost:4000`.

## Desarrollo
```bash
npm run db:start          # en la raíz
npm run dev:api           # API en :4000
API_URL=http://localhost:4000 npm run dev:web   # web en :3000
```

## Vercel
Proyecto `venti-web`, Root Directory `apps/web`. `vercel.json` instala desde la raíz del monorepo.
Requiere que la API **no** tenga Vercel Authentication activada, porque la web la consulta desde el servidor.
