/**
 * Verifies that the SoftwareListings client component honors the SSR-provided
 * `initialListings` prop and skips its client-side fetch — the contract that
 * makes server-rendered SaaSRow pages display real data on the first paint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock supabase to avoid real network / env reads from card subcomponents.
vi.mock('../../src/lib/supabase', () => {
  const fakeAuth = { getSession: async () => ({ data: { session: null } }) }
  const fromChain = {
    select: () => fromChain,
    eq: () => fromChain,
    maybeSingle: async () => ({ data: null, error: null }),
  }
  const storage = {
    from: () => ({
      getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/img.png' } }),
    }),
  }
  return {
    supabase: { auth: fakeAuth, from: () => fromChain, storage },
    getBrowserSupabase: () => ({ auth: fakeAuth, from: () => fromChain, storage }),
  }
})

// next/link in jsdom: render an anchor.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { SoftwareListings } from '../../src/components/SoftwareListings'

describe('<SoftwareListings>', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('fetch should not be called when initialListings is provided')
    })
  })

  const initial = [
    {
      id: '1',
      title: 'Alpha App',
      url: 'https://alpha.example.com',
      description: 'A cool tool',
      category: 'Tools',
      tier: 'free',
      tags: ['cli'],
    },
    {
      id: '2',
      title: 'Beta App',
      url: 'https://beta.example.com',
      description: 'Another cool tool',
      category: 'AI',
      tier: 'featured',
    },
  ]

  it('renders cards from initialListings without calling fetch', () => {
    render(
      <SoftwareListings
        searchQuery=""
        selectedFilter="all"
        activeCategories={[]}
        activeTags={[]}
        selectedSort="Most Popular"
        initialListings={initial as any}
      />,
    )

    expect(screen.getByText('Alpha App')).toBeInTheDocument()
    expect(screen.getByText('Beta App')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('respects category filter without re-fetching', () => {
    render(
      <SoftwareListings
        searchQuery=""
        selectedFilter="all"
        activeCategories={['Tools']}
        activeTags={[]}
        selectedSort="Most Popular"
        initialListings={initial as any}
      />,
    )
    expect(screen.getByText('Alpha App')).toBeInTheDocument()
    expect(screen.queryByText('Beta App')).not.toBeInTheDocument()
  })
})
