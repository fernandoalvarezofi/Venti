/** Sólo rutas internas: evita redirecciones abiertas a otros sitios después de ingresar. */
export function safeNext(raw: string | undefined): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';
}
