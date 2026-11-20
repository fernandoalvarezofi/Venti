const TZ = 'America/Argentina/Buenos_Aires';

export function formatMoney(cents: number, currency = 'ARS'): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function dateParts(iso: string) {
  const d = new Date(iso);
  const get = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...o }).format(d);
  // Sólo la primera letra en mayúscula ("Domingo, 29 de noviembre"): en español los meses van en minúscula.
  const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return {
    day: get({ day: '2-digit' }),
    month: get({ month: 'short' }).replace('.', '').toUpperCase(),
    weekday: sentence(get({ weekday: 'long' })),
    weekdayShort: get({ weekday: 'short' }).replace('.', ''),
    time: get({ hour: '2-digit', minute: '2-digit', hour12: false }),
    long: sentence(get({ weekday: 'long', day: 'numeric', month: 'long' })),
    year: get({ year: 'numeric' }),
  };
}

export const CATEGORY_LABELS: Record<string, string> = {
  music: 'Música',
  festival: 'Festivales',
  party: 'Fiestas',
  theater: 'Teatro',
  standup: 'Stand-up',
  sports: 'Deportes',
  family: 'Familia',
  conference: 'Charlas',
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
}

/** Paleta de afiches: se elige de forma determinista por id para que cada evento tenga siempre el mismo. */
const POSTERS = [
  { bg: '#1f3a2c', fg: '#e8efd6' },
  { bg: '#4a1420', fg: '#f6d9cf' },
  { bg: '#13285e', fg: '#dfe6ff' },
  { bg: '#e2ae3a', fg: '#1d1405' },
  { bg: '#c45f37', fg: '#fff0e4' },
  { bg: '#1a1816', fg: '#f1ebe1' },
] as const;

export function posterColors(id: string) {
  // FNV-1a: reparte mejor que un hash multiplicativo simple (evita afiches iguales seguidos).
  let h = 0x811c9dc5;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return POSTERS[h % POSTERS.length]!;
}

/** URL de una imagen servida por la API a través del mismo dominio. Para borradores, la productora pasa su id. */
export function mediaSrc(url: string, orgId?: string): string {
  return `/api${url}${orgId ? `?org=${orgId}` : ''}`;
}

export const AMENITY_LABELS: Record<string, string> = {
  bar: 'Barra',
  food: 'Comida',
  food_trucks: 'Food trucks',
  cloakroom: 'Guardarropa',
  lockers: 'Lockers',
  parking: 'Estacionamiento',
  bike_parking: 'Bicicletero',
  vip_area: 'Zona VIP',
  smoking_area: 'Zona de fumadores',
  chill_zone: 'Zona chill',
  free_water: 'Agua gratis',
  atm: 'Cajero automático',
  card_payments: 'Pago con tarjeta',
  cashless: 'Pulsera cashless',
  merch: 'Merch oficial',
  camping: 'Camping',
  showers: 'Duchas',
  accessible: 'Accesible',
  first_aid: 'Primeros auxilios',
  security: 'Seguridad',
  transport: 'Transporte',
};

export const LINEUP_ROLE_LABELS: Record<string, string> = {
  headliner: 'Principal',
  guest: 'Artista invitado',
  support: 'Soporte',
  resident: 'DJ residente',
  dj: 'DJ',
  host: 'Conducción',
};

/** Plurales explícitos para los títulos del line-up. */
export const LINEUP_ROLE_PLURALS: Record<string, string> = {
  headliner: 'Principales',
  guest: 'Artistas invitados',
  support: 'Soporte',
  resident: 'DJs residentes',
  dj: 'DJs',
  host: 'Conducción',
};

/** Número de entrada legible (primeros 8 caracteres del identificador): "A1B2-C3D4". */
export function ticketCode(id: string): string {
  const h = id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4)}`;
}
