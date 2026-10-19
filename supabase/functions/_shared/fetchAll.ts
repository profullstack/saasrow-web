/**
 * PostgREST caps every response at db-max-rows (1000 on saasrow), and a capped
 * read looks exactly like a complete one. Any read that is meant to cover a whole
 * table goes through here. `page(from, to)` must apply `.range(from, to)` to a
 * query with a stable order, or pages can overlap and skip rows.
 */
const pageSize = 1000

export async function fetchAll<T = any>(
  page: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}
