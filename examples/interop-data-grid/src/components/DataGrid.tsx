/** @jsxImportSource react */
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
} from '@tanstack/react-table';

export interface Person {
  id: string;
  name: string;
  team: string;
  score: number;
}

export interface DataGridProps {
  rows: Person[];
  sorting: SortingState;
  filter: string;
  onSortingChange?: OnChangeFn<SortingState>;
  onGlobalFilterChange?: OnChangeFn<string>;
}

const COLUMNS: ColumnDef<Person>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'team', header: 'Team' },
  { accessorKey: 'score', header: 'Score' },
];

/**
 * A plain TanStack Table — no Janux in this file. Its state is fully controlled
 * from the outside, which is the ordinary way to use the library and happens to
 * be exactly what makes the island the single owner of the truth.
 */
export function DataGrid({ rows, sorting, filter, onSortingChange, onGlobalFilterChange }: DataGridProps) {
  const table = useReactTable({
    data: rows,
    columns: COLUMNS,
    // `sorting` and `rows` arrive as the island's own arrays, so their identity
    // only changes when the data does. Rebuilding either as a literal here
    // (`[{ id, desc }]`) would make TanStack's auto-reset see a change on every
    // render and re-render forever.
    state: { sorting, globalFilter: filter },
    onSortingChange,
    onGlobalFilterChange,
    // Two-state headers: with removal on, a third click clears the sort and the
    // island would have to model "sorted by nothing" for no gain.
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="grid">
      <input
        className="grid-filter"
        value={filter}
        placeholder="Filter rows…"
        aria-label="Filter rows"
        onChange={(event) => table.setGlobalFilter(event.target.value)}
      />
      <table className="grid-table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id}>
                  <button
                    className="grid-sort"
                    data-column={header.column.id}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'desc' ? ' ↓' : header.column.getIsSorted() ? ' ↑' : ''}
                  </button>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="grid-row">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
