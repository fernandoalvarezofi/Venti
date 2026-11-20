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

/** Valida una imagen subida y devuelve sus datos. Lanza un 4xx explicativo si no sirve. */
export function inspectImage(buf: Buffer): ImageInfo {
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
    throw new AppError(422, 'image_has_metadata', 'La imagen trae metadatos (ubicación, cámara). Subila desde LinTICK para que los quitemos.');
  }
  if (Math.min(size.width, size.height) < MIN_SIDE) throw new AppError(422, 'image_too_small', `La imagen es muy chica: el lado menor tiene que medir al menos ${MIN_SIDE} px.`);
  if (Math.max(size.width, size.height) > MAX_SIDE) throw new AppError(422, 'image_too_big', `La imagen es muy grande: máximo ${MAX_SIDE} px por lado.`);
  return { contentType: type, width: size.width, height: size.height, sizeBytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}
