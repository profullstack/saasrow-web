import { describe, it, expect } from 'vitest'
import {
  filterByCategory,
  filterByTag,
  categoryCountsFrom,
  tagCountsFrom,
  type Submission,
} from '../../src/lib/submissions'

const sample = (overrides: Partial<Submission>): Submission => ({
  id: overrides.id ?? 'id',
  title: 'Title',
  url: 'https://example.com',
  description: 'desc',
  category: 'Tools',
  status: 'approved',
  created_at: '2025-01-01T00:00:00Z',
  ...overrides,
})

describe('lib/submissions pure helpers', () => {
  const subs: Submission[] = [
    sample({ id: '1', category: 'Tools', tags: ['cli', 'open-source'] }),
    sample({ id: '2', category: 'tools', tags: ['cli'] }),
    sample({ id: '3', category: 'AI', tags: ['llm', 'open-source'] }),
    sample({ id: '4', category: '', tags: undefined }),
  ]

  describe('filterByCategory', () => {
    it('matches case-insensitively', () => {
      const out = filterByCategory(subs, 'TOOLS')
      expect(out.map((s) => s.id).sort()).toEqual(['1', '2'])
    })

    it('returns empty for unknown category', () => {
      expect(filterByCategory(subs, 'nope')).toEqual([])
    })
  })

  describe('filterByTag', () => {
    it('matches case-insensitively across submissions', () => {
      const out = filterByTag(subs, 'OPEN-SOURCE')
      expect(out.map((s) => s.id).sort()).toEqual(['1', '3'])
    })

    it('skips submissions without tag arrays', () => {
      expect(filterByTag(subs, 'cli').map((s) => s.id).sort()).toEqual(['1', '2'])
    })

    it('returns empty for unknown tag', () => {
      expect(filterByTag(subs, 'missing')).toEqual([])
    })
  })

  describe('categoryCountsFrom', () => {
    it('counts by exact category name and sorts desc', () => {
      const counts = categoryCountsFrom(subs)
      expect(counts).toEqual([
        { name: 'Tools', count: 1 },
        { name: 'tools', count: 1 },
        { name: 'AI', count: 1 },
      ])
    })

    it('skips submissions with empty category', () => {
      const counts = categoryCountsFrom(subs)
      expect(counts.find((c) => c.name === '')).toBeUndefined()
    })
  })

  describe('tagCountsFrom', () => {
    it('aggregates tags across submissions and sorts desc', () => {
      const counts = tagCountsFrom(subs)
      expect(counts[0]).toEqual({ name: 'cli', count: 2 })
      expect(counts).toContainEqual({ name: 'open-source', count: 2 })
      expect(counts).toContainEqual({ name: 'llm', count: 1 })
    })

    it('handles submissions without tags', () => {
      const counts = tagCountsFrom([sample({ id: 'x' }), sample({ id: 'y', tags: ['a'] })])
      expect(counts).toEqual([{ name: 'a', count: 1 }])
    })
  })
})
