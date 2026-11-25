import type { Metadata } from 'next'
import AdultCategory from '@/views/AdultCategory'
import { ADULT_LABEL } from '@/lib/adultShared'

// The Adult (18+) category. The page itself holds no listings: the view asks
// the member API for them, so an anonymous visitor (or a crawler) gets a
// sign-in prompt and nothing else. Never indexed.
export const metadata: Metadata = {
  title: ADULT_LABEL,
  description: 'Members-only category. Sign in to view.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <AdultCategory />
}
