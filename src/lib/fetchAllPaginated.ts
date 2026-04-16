const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllPaginated<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const allRows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const page = data ?? [];
    allRows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return allRows;
}