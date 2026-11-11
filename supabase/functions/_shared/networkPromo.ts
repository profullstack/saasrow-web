/**
 * "Keep going" block for emails to people who list software on SaaSRow: the
 * sister directories and maker tools, from the shared Profullstack catalog
 * (@profullstack/cross-promo). The catalog is read live from jsDelivr, so a
 * property added there shows up here with no redeploy; the copy bundled in the
 * package is the fallback, so a send never waits on or fails because of it.
 * SaaSRow never promotes itself.
 *
 * Used by the submission email (send-management-link), the approval email
 * (approvalNotify) and the newsletter welcome.
 */
import { promoBlock } from 'npm:@profullstack/cross-promo@^0.1.0'

/** Matches the dark SaaSRow templates. */
export const DARK_THEME = {
  accent: '#4FFFE3',
  heading: '#E0FF04',
  text: '#cccccc',
  muted: '#888888',
  bg: 'rgba(79, 255, 227, 0.06)',
  border: 'rgba(79, 255, 227, 0.2)',
}

export const PROMO_SITE = 'saasrow.com'

/** { items, title, text, markdown, html }. `seed` (the recipient) rotates the list per person. */
export function networkPromo(seed?: string) {
  return promoBlock({ site: PROMO_SITE, audience: 'makers', seed, theme: DARK_THEME })
}
