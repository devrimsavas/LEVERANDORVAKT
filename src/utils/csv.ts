// Writes CSV files that open correctly in Excel and Power BI.
//
// Norwegian Excel expects semicolons between the columns (the comma is its
// decimal sign), English Excel expects commas, so the separator follows
// the user's language. The file starts with a byte order mark, so Excel
// reads it as UTF-8 and æ, ø and å come out right.

export type CsvValue = string | number | null;

const BOM = "﻿";

// Text that starts with one of these is run as a formula by spreadsheet
// programs; a company name or a note like "=HYPERLINK(...)" must stay text
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvValue, separator: string): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return text.includes(separator) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function toCsv(
  header: string[],
  rows: CsvValue[][],
  separator: ";" | ",",
): string {
  const line = (values: CsvValue[]) =>
    values.map((value) => cell(value, separator)).join(separator);
  return BOM + [line(header), ...rows.map(line)].join("\r\n") + "\r\n";
}
