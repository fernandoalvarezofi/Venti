'use client';

/**
 * Prepara una foto para subir: corrige la orientación, la achica a 2000 px como máximo y la re-codifica.
 * Re-codificar en un canvas elimina TODOS los metadatos (EXIF: ubicación GPS, cámara, fecha).
 */
const isHeic = (f: File) => /heic|heif/i.test(f.type) || /.(heic|heif)$/i.test(f.name);

/** Abre cualquier foto que el navegador sepa leer; HEIC/HEIF (iPhone y algunos Android) se convierte a JPG si hace falta. */
async function decode(file: Blob & { name?: string; type: string }): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    /* algunos navegadores no abren ciertos formatos con createImageBitmap: se intenta con <img> */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImage(file: File, maxSide = 2000, minSide = 400): Promise<Blob> {
  // Como en las redes sociales: se acepta cualquier foto (JPG, PNG, WebP, HEIC/HEIF, AVIF, GIF…) y se convierte sola.
  if (file.type && !file.type.startsWith('image/') && !isHeic(file)) throw new Error('Ese archivo no es una foto. Elegí una imagen.');
  if (file.size > 40 * 1024 * 1024) throw new Error('La foto pesa más de 40 MB. Elegí otra.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    if (!isHeic(file)) throw new Error('No pudimos abrir esa imagen. Probá con otra foto.');
    try {
      // Chrome (Android y computadora) no lee HEIC: se convierte a JPG en el teléfono, sin subir el original.
      const { default: heic2any } = await import('heic2any');
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      bitmap = await decode(Array.isArray(out) ? out[0]! : out);
    } catch {
      throw new Error('No pudimos convertir esa foto HEIC. Probá con otra o compartila como JPG.');
    }
  }
  const { width, height } = bitmap;
  // Como en las redes: una foto chica se agranda sola hasta el mínimo (sólo se rechazan las diminutas, tipo ícono).
  if (Math.min(width, height) < 100) {
    bitmap.close();
    throw new Error('La imagen es demasiado chica (menos de 100 px). Elegí una foto más grande.');
  }
  const scale = Math.min(maxSide / Math.max(width, height), Math.max(1, minSide / Math.min(width, height)));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no pudo procesar la imagen.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  let blob = await toBlob('image/webp', 0.84);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.86);
  if (!blob) throw new Error('No pudimos procesar la imagen.');
  if (blob.size > 3 * 1024 * 1024) {
    blob = await toBlob('image/jpeg', 0.72);
    if (!blob || blob.size > 3 * 1024 * 1024) throw new Error('La imagen sigue pesando más de 3 MB. Probá con otra.');
  }
  return blob;
}

export async function uploadEventImage(orgId: string, eventId: string, blob: Blob, kind: 'cover' | 'gallery' | 'asset') {
  const res = await fetch(`/api/v1/organizations/${orgId}/events/${eventId}/media?kind=${kind}`, {
    method: 'POST',
    headers: { 'content-type': blob.type },
    body: blob,
  }).catch(() => null);
  if (!res) return { ok: false as const, message: 'No pudimos conectarnos. Revisá tu conexión.' };
  const body = (await res.json().catch(() => null)) as { id?: string; error?: { message: string } } | null;
  if (!res.ok || !body?.id) return { ok: false as const, message: body?.error?.message ?? 'No se pudo subir la imagen.' };
  return { ok: true as const, id: body.id };
}
