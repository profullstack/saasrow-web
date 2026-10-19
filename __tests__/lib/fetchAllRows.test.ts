import { describe, it, expect } from 'vitest'
import { fetchAllRows, PAGE_SIZE } from '../../src/lib/fetchAllRows'

// A table of `total` rows served the way PostgREST does: at most PAGE_SIZE per call.
function table(total: number) {
  const calls: Array<[number, number]> = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    const end = Math.min(to + 1, total, from + PAGE_SIZE)
    return { data: Array.from({ length: Math.max(0, end - from) }, (_, i) => from + i), error: null }
  }
  return { page, calls }
}

describe('fetchAllRows', () => {
  it('reads past the 1000-row cap', async () => {
    const { page, calls } = table(1409)
    const rows = await fetchAllRows<number>(page)
    expect(rows).toHaveLength(1409)
    expect(new Set(rows).size).toBe(1409)
    expect(calls).toEqual([[0, 999], [1000, 1999]])
  })

  it('makes one extra call when the total is an exact multiple of the page size', async () => {
    const { page, calls } = table(2000)
    expect(await fetchAllRows(page)).toHaveLength(2000)
    expect(calls).toHaveLength(3)
  })

  it('handles an empty table', async () => {
    const { page } = table(0)
    expect(await fetchAllRows(page)).toEqual([])
  })

  it('throws on a query error instead of returning a partial list', async () => {
    let n = 0
    const page = async () =>
      n++ === 0
        ? { data: Array(PAGE_SIZE).fill(0), error: null }
        : { data: null, error: { message: 'boom' } }
    await expect(fetchAllRows(page)).rejects.toThrow('boom')
  })
})
