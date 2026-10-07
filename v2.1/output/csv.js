/**
 * output/csv.js — serialise rows to CSV (RFC 4180).
 *
 * Shared by the run report and the session log so both escape identically. Pure.
 */

/**
 * Escape one field: quote it when it contains a comma, quote, or line break, doubling any
 * embedded quotes. null and undefined become an empty field.
 * @param {string|number|boolean|null|undefined} value field value
 * @returns {string} the escaped field
 */
function field(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Build a CSV document.
 * @param {string[]} header column names, in order
 * @param {Array<Array<string|number|boolean|null|undefined>>} rows one array of fields
 *   per row, in header order
 * @returns {string} CSV text with CRLF line endings (as RFC 4180 specifies) and a
 *   trailing line break
 * @determinism Pure function of its arguments.
 */
export function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(field).join(',')).join('\r\n') + '\r\n';
}
