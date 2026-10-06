export interface DataTableState {
  query: string;
  filters: Record<string, string>;
  sort: { key: string; dir: "asc" | "desc" } | null;
}

export interface TableColumnValue<T> {
  key: string;
  sortValue?: (row: T) => string | number;
  filterValue?: (row: T) => string | number;
}

/** The full view before pagination, shared by the table and its batch actions. */
export function getTableRows<T>(
  rows: T[],
  columns: TableColumnValue<T>[],
  state: DataTableState,
  searchKeys?: (row: T) => string,
): T[] {
  const query = state.query.trim().toLowerCase();
  let result =
    query && searchKeys
      ? rows.filter((row) => searchKeys(row).toLowerCase().includes(query))
      : rows;

  for (const column of columns) {
    const filter = state.filters[column.key]?.trim().toLowerCase();
    if (filter && column.filterValue) {
      const value = column.filterValue;
      result = result.filter((row) => String(value(row)).toLowerCase().includes(filter));
    }
  }

  if (state.sort) {
    const value = columns.find((column) => column.key === state.sort?.key)?.sortValue;
    if (value) {
      const direction = state.sort.dir === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        const av = value(a);
        const bv = value(b);
        return (
          direction *
          (typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), undefined, { numeric: true }))
        );
      });
    }
  }
  return result;
}
