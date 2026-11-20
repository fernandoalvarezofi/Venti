/** Convierte un texto en un slug URL-safe: "Fiesta Nacional del Sol 2027" → "fiesta-nacional-del-sol-2027". */
export function slugify(input: string, maxLength = 80): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
