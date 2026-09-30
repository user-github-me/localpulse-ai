/**
 * Spreadsheet apps run a cell that starts with = + - or @ as a formula, and the text comes from an
 * AI answer about a web page. Such cells get a leading apostrophe, except plain numbers like -5.
 */
function neutralizeFormula(value: string): string {
  if (!/^[=+\-@\t\r]/.test(value) || /^[+-]?\d[\d,.]*%?$/.test(value)) return value;
  return `'${value}`;
}

/** Turns table rows into CSV (RFC 4180 quoting), for "Download CSV" on tables in answers. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const cell = (raw: string) => {
    const value = neutralizeFormula(raw);
    return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

/** Reads the cells of a rendered HTML table. */
export function tableRows(table: HTMLTableElement): string[][] {
  return [...table.rows].map((row) =>
    [...row.cells].map((cell) => (cell.textContent ?? '').trim()),
  );
}
