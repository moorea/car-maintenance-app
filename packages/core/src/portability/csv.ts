const BOM = String.fromCharCode(0xfeff)

/** Quotes a field when it holds a comma, quote or line break, doubling any quotes (RFC 4180). */
const field = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/**
 * Turns rows into CSV text with CRLF line endings, as RFC 4180 and Excel expect. Starts with a
 * byte order mark so Excel reads it as UTF-8 rather than mangling accented names.
 */
export const csv = (rows: readonly (readonly string[])[]): string =>
  `${BOM}${rows.map((row) => row.map(field).join(',')).join('\r\n')}\r\n`
