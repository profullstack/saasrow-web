/**
 * PostgREST caps every response at db-max-rows (1000 on saasrow), and a capped
 * read looks exactly like a complete one. Any read that is meant to cover a whole
 * table goes through here. `page(from, to)` must apply `.range(from, to)` to a
 * query with a stable order, or pages can overlap and skip rows.
 */
export const PAGE_SIZE = 1000

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  maxRows = 100_000,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}
