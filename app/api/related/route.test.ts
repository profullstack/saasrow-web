import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: vi.fn(),
}))

describe('GET /api/related', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to the category when no tag matches exist', async () => {
    const primaryQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      overlaps: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }

    const categoryResult = [
      {
        id: 'category-match',
        title: 'Category Match',
        description: 'A fallback result',
        logo: null,
        category: 'Productivity',
        tier: 'free',
        upvotes: 3,
      },
    ]
    const categoryQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      not: vi.fn(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: categoryResult, error: null }),
    }
    categoryQuery.not.mockImplementation((_column, _operator, value) => {
      if (value === '()') {
        throw new Error('invalid empty in filter')
      }
      return categoryQuery
    })

    const from = vi.fn()
      .mockReturnValueOnce(primaryQuery)
      .mockReturnValueOnce(categoryQuery)
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never)

    const response = await GET(
      new Request(
        'http://localhost/api/related?id=current&category=Productivity&tags=missing',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: categoryResult })
    expect(categoryQuery.not).not.toHaveBeenCalled()
  })
})
