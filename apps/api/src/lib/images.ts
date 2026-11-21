import { createHash } from 'node:crypto';
import { AppError } from './errors.ts';

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageInfo {
  contentType: ImageType;
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
}

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MIN_SIDE = 400;
const MAX_SIDE = 6000;

/** Tipo real según los primeros bytes (no se confía en el content-type que manda el cliente). */
function sniff(b: Buffer): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function pngSize(b: Buffer) {
  if (b.length < 24 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** Recorre los segmentos JPEG: devuelve tamaño (SOFn) y si hay un bloque EXIF (APP1 "Exif"). */
function jpegScan(b: Buffer) {
  let i = 2;
  let size: { width: number; height: number } | null = null;
  let exif = false;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return { size: null, exif };
    const marker = b[i + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // fin o inicio de datos comprimidos
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) return { size: null, exif };
    if (marker === 0xe1 && b.toString('ascii', i + 4, i + 8) === 'Exif') exif = true;
    // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      size = { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { size, exif };
}

function webpScan(b: Buffer) {
  const chunk = b.toString('ascii', 12, 16);
  let size: { width: number; height: number } | null = null;
  if (chunk === 'VP8 ' && b.length >= 30) size = { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  else if (chunk === 'VP8L' && b.length >= 25) {
    const bits = b.readUInt32LE(21);
    size = { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  } else if (chunk === 'VP8X' && b.length >= 30) {
    size = { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  // En VP8X el bit 3 del byte de banderas indica metadatos EXIF.
  const exif = chunk === 'VP8X' && b.length > 20 && (b[20]! & 0x08) !== 0;
  return { size, exif };
}

/**
 * Quita los metadatos (EXIF/XMP: ubicación, cámara, fecha) sin tocar la imagen.
 * Algunos navegadores (Safari) agregan un bloque EXIF aunque la foto ya se haya re-codificado en el teléfono;
 * en vez de rechazarla, se limpia acá. JPEG: se descartan los segmentos APP1 (EXIF/XMP). WebP: los bloques EXIF y XMP.
 */
export function stripImageMetadata(buf: Buffer): Buffer {
  const type = sniff(buf);
  if (type === 'image/jpeg') {
    const parts: Buffer[] = [buf.subarray(0, 2)];
    let i = 2;
    while (i + 4 <= buf.length) {
      if (buf[i] !== 0xff) return buf; // estructura inesperada: se deja como está (la validación decide)
      const marker = buf[i + 1]!;
      if (marker === 0xda) {
        parts.push(buf.subarray(i)); // datos de la imagen hasta el final
        return Buffer.concat(parts);
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        parts.push(buf.subarray(i, i + 2));
        i += 2;
        continue;
      }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2 || i + 2 + len > buf.length) return buf;
      if (marker !== 0xe1) parts.push(buf.subarray(i, i + 2 + len)); // APP1 = EXIF/XMP: afuera
      i += 2 + len;
    }
    return buf;
  }
  if (type === 'image/webp' && buf.toString('ascii', 12, 16) === 'VP8X') {
    const chunks: Buffer[] = [];
    let i = 12;
    while (i + 8 <= buf.length) {
      const id = buf.toString('ascii', i, i + 4);
      const size = buf.readUInt32LE(i + 4);
      const total = 8 + size + (size % 2);
      if (i + 8 + size > buf.length) return buf;
      if (id !== 'EXIF' && id !== 'XMP ') chunks.push(buf.subarray(i, Math.min(i + total, buf.length)));
      i += total;
    }
    const body = Buffer.concat(chunks);
    body[8] = body[8]! & ~0x0c; // banderas VP8X: sin EXIF (0x08) ni XMP (0x04)
    const header = Buffer.alloc(12);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(body.length + 4, 4);
    header.write('WEBP', 8, 'ascii');
    return Buffer.concat([header, body]);
  }
  return buf;
}

/** Valida una imagen subida y devuelve sus datos. Lanza un 4xx explicativo si no sirve. */
/** `minSide`: logos y fotos de artistas pueden ser más chicos (120 px); portada y galería, 400 px. */
export function inspectImage(buf: Buffer, minSide = MIN_SIDE): ImageInfo {
  if (buf.length === 0) throw new AppError(400, 'image_empty', 'El archivo está vacío.');
  if (buf.length > MAX_IMAGE_BYTES) throw new AppError(413, 'image_too_large', 'La imagen supera 3 MB.');
  const type = sniff(buf);
  if (!type) throw new AppError(415, 'image_unsupported', 'Sólo se aceptan imágenes JPG, PNG o WebP.');
  let size: { width: number; height: number } | null;
  let exif = false;
  if (type === 'image/png') size = pngSize(buf);
  else if (type === 'image/jpeg') ({ size, exif } = jpegScan(buf));
  else ({ size, exif } = webpScan(buf));
  if (!size || size.width === 0 || size.height === 0) throw new AppError(400, 'image_corrupt', 'No pudimos leer la imagen. Probá exportarla de nuevo.');
  if (exif) {
    // La web siempre re-codifica antes de subir; si llega EXIF es que vino sin pasar por ahí.
    throw new AppError(422, 'image_has_metadata', 'La imagen trae metadatos (ubicación, cámara). Subila desde Lintick para que los quitemos.');
  }
  if (Math.min(size.width, size.height) < minSide) throw new AppError(422, 'image_too_small', `La imagen es muy chica: el lado menor tiene que medir al menos ${minSide} px.`);
  if (Math.max(size.width, size.height) > MAX_SIDE) throw new AppError(422, 'image_too_big', `La imagen es muy grande: máximo ${MAX_SIDE} px por lado.`);
  return { contentType: type, width: size.width, height: size.height, sizeBytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}
