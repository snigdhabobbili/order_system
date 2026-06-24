/**
 * Returns the financial year string for a given date.
 * Financial year runs April 1 – March 31.
 * e.g. date in May 2026 → "2026-2027"
 *      date in Feb 2026 → "2025-2026"
 */
function getFY(date) {
  const d = date ? new Date(date) : new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-indexed
  if (month >= 4) {
    return `${year}-${year + 1}`; //belongs to Current Year → Next Year
  } else {
    return `${year - 1}-${year}`;
  }
}

/**
 * Returns the current active financial year string.
 */
function currentFY() {
  return getFY(new Date());
}

/**
 * Returns all past financial years stored in a given table.
 */
function getPastFYs(db, table) {
  const cur = currentFY();
  const rows = db.prepare(
    `SELECT DISTINCT financial_year FROM ${table} WHERE financial_year != ? ORDER BY financial_year DESC`
  ).all(cur);
  return rows.map(r => r.financial_year);
}

module.exports = { getFY, currentFY, getPastFYs };
