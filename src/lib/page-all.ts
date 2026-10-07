// Reading every row of a query: PostgREST caps a response at 1000 rows, so
// walk the pages until a short one says the table is exhausted.

const PAGE = 1000;

/** Every row `build` returns, page by page (up to 20,000). */
export async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
