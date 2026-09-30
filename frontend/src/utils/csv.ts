/**
 * Exports an array of flat objects as a downloaded CSV file, entirely client-side (no
 * backend round trip needed - the data is already loaded in the page). Handles the two
 * CSV-breaking cases people actually hit: a value containing a comma, and a value
 * containing a double-quote (escaped by doubling it, the standard CSV rule) or a newline.
 */
export function exportToCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])

  function escapeCell(value: unknown): string {
    if (value === null || value === undefined) return ''
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(',')),
  ]
  // BOM so Excel opens UTF-8 accented characters (ç, ã, é...) correctly instead of
  // mangling them - a very common papercut with plain UTF-8 CSVs opened in Excel.
  const csvContent = '\uFEFF' + lines.join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
