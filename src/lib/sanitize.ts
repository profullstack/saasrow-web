// Conservative HTML sanitizer: escapes HTML so no tags are interpreted.
// Replace with a vetted HTML sanitizer (DOMPurify/sanitize-html) in a follow-up step
// for richer safe HTML rendering.
export function sanitizeHtml(input: string | undefined | null): string {
  const s = (input ?? '').toString();
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
