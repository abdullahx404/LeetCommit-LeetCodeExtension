/**
 * Utility functions for GitLeet.
 */

export function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\.\.+/g, '.')
    .trim();
}

export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binString);
}
