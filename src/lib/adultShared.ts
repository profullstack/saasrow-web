// The Adult (18+) category: names and the one test for "is this category the
// adult one". Pure, so pages, routes and tests share it. Mirrors
// is_adult_category() in the database (migration 20261125160000).
//
// A listing in this category is live under status 'adult', not 'approved', so
// no public reader returns it. Signed-in members reach it through
// src/lib/adult.ts.

export const ADULT_CATEGORY = 'Adult'
export const ADULT_LABEL = 'Adult (18+)'
export const ADULT_STATUS = 'adult'
export const ADULT_PATH = '/category/adult'

const ADULT_NAMES = new Set(['adult', 'adult (18+)', 'adult 18+', 'nsfw', 'porn', 'xxx'])

export function isAdultCategory(category: unknown): boolean {
  return typeof category === 'string' && ADULT_NAMES.has(category.trim().toLowerCase())
}

export const ADULT_SIGN_IN_MESSAGE =
  'The Adult (18+) category is for signed-in members. Sign in with your email, or send an API key (Authorization: Bearer sr_…).'

export const ADULT_NOTICE = 'Adult content. You must be 18 or older.'
