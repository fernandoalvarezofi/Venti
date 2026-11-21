'use client';

/**
 * Prepara una foto para subir: corrige la orientación, la achica a 2000 px como máximo y la re-codifica.
 * Re-codificar en un canvas elimina TODOS los metadatos (EXIF: ubicación GPS, cámara, fecha).
 */
export async function prepareImage(file: File, maxSide = 2000, minSide = 400): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|avif)$/i.test(file.name)) {
    throw new Error('Elegí una imagen JPG, PNG o WebP.');
  }
  if (file.size > 25 * 1024 * 1024) throw new Error('La foto pesa más de 25 MB. Elegí otra.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No pudimos abrir esa imagen. Probá con otra o exportala como JPG.');
  }
  const { width, height } = bitmap;
  if (Math.min(width, height) < minSide) {
    bitmap.close();
    throw new Error(`La imagen es muy chica: el lado menor tiene que medir al menos ${minSide} px.`);
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
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
