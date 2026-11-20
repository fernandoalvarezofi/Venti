/** URL base de la API de Lintick (sin barra final). En desarrollo: la API local. */
export const API_URL = (process.env.API_URL ?? 'https://venti-fernandoalvarezofi-4479s-projects.vercel.app').replace(/\/+$/, '');

/**
 * Cobros con Mercado Pago ya disponibles. Mientras sea false, la página de inicio muestra
 * "Muy pronto" en todo lo que depende de cobrar online (nada se promete antes de existir).
 */
export const PAYMENTS_LIVE = true;
