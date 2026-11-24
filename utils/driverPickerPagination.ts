/** Stable groups for the horizontally swipeable driver picker. */
export const DRIVERS_PER_PAGE = 4;

export function paginateDriverItems<T>(items: readonly T[], perPage: number = DRIVERS_PER_PAGE): T[][] {
  if (!Number.isInteger(perPage) || perPage < 1) throw new Error('perPage must be a positive integer');
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += perPage) {
    pages.push(items.slice(index, index + perPage));
  }
  return pages;
}
