export interface DataTableEmptyProps {
  colSpan: number;
  message?: string;
}

export function DataTableEmpty({ colSpan, message = "No results found." }: DataTableEmptyProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-24 px-4 text-center text-sm text-muted-foreground">
        {message}
      </td>
    </tr>
  );
}
