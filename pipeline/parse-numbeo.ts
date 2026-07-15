// Parses a manually saved Numbeo rankings table (CSV from the "Download
// table" link / browser extraction, or a "Save Page As" HTML file).
import { parse as parseHtml } from 'node-html-parser';

export type NumbeoRow = {
  rawName: string; // "New York, NY, United States"
  city: string;
  adminHint?: string;
  country: string;
  col: number;
  rent: number;
  colRent: number;
  groceries: number;
  restaurant: number;
  purchasingPower: number;
};

const HEADER_TO_FIELD: Record<string, keyof Omit<NumbeoRow, 'rawName' | 'city' | 'adminHint' | 'country'> | 'city'> = {
  'City': 'city',
  'Cost of Living Index': 'col',
  'Rent Index': 'rent',
  'Cost of Living Plus Rent Index': 'colRent',
  'Groceries Index': 'groceries',
  'Restaurant Price Index': 'restaurant',
  'Local Purchasing Power Index': 'purchasingPower',
};

export function parseNumbeo(fileText: string): NumbeoRow[] {
  const trimmed = fileText.trimStart();
  const table = trimmed.startsWith('<') ? parseHtmlTable(fileText) : parseCsv(fileText);
  return tableToRows(table);
}

// --- shared: header-mapped table → NumbeoRows ---

function tableToRows(table: string[][]): NumbeoRow[] {
  if (table.length < 2) throw new Error('Numbeo table has no data rows');
  const headers = table[0];
  const colIdx: Partial<Record<string, number>> = {};
  for (const [header, field] of Object.entries(HEADER_TO_FIELD)) {
    const i = headers.findIndex((h) => h.trim() === header);
    if (i === -1) throw new Error(`Numbeo table missing expected column "${header}" (got: ${headers.join(' | ')})`);
    colIdx[field] = i;
  }
  const rows: NumbeoRow[] = [];
  for (const cells of table.slice(1)) {
    if (cells.length !== headers.length) continue;
    const rawName = cells[colIdx.city!].trim();
    const { city, adminHint, country } = splitRawName(rawName);
    const num = (field: string) => {
      const v = Number.parseFloat(cells[colIdx[field]!]);
      if (!Number.isFinite(v)) throw new Error(`Non-numeric ${field} for "${rawName}": "${cells[colIdx[field]!]}"`);
      return v;
    };
    rows.push({
      rawName,
      city,
      adminHint,
      country,
      col: num('col'),
      rent: num('rent'),
      colRent: num('colRent'),
      groceries: num('groceries'),
      restaurant: num('restaurant'),
      purchasingPower: num('purchasingPower'),
    });
  }
  return rows;
}

// "Honolulu, HI, United States" → city + state hint + country;
// "St. John's, Newfoundland and Labrador, Canada" keeps multi-word hints.
export function splitRawName(rawName: string): { city: string; adminHint?: string; country: string } {
  const parts = rawName.split(', ');
  if (parts.length < 2) return { city: rawName, country: '' };
  const country = parts[parts.length - 1];
  const city = parts[0];
  const adminHint = parts.length > 2 ? parts.slice(1, -1).join(', ') : undefined;
  return { city, adminHint, country };
}

// --- CSV path (quoted fields, commas inside quotes) ---

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

// --- HTML path (Save Page As) ---

function parseHtmlTable(html: string): string[][] {
  const root = parseHtml(html);
  const tables = root.querySelectorAll('table');
  if (tables.length === 0) throw new Error('No <table> found in HTML');
  const biggest = tables.reduce((a, b) =>
    a.querySelectorAll('tr').length >= b.querySelectorAll('tr').length ? a : b,
  );
  const out: string[][] = [];
  const headerCells = biggest.querySelectorAll('thead th');
  if (headerCells.length > 0) out.push(headerCells.map((c) => c.text.trim()));
  for (const tr of biggest.querySelectorAll('tbody tr')) {
    const cells = tr.querySelectorAll('td,th').map((c) => c.text.trim());
    if (cells.length > 0) {
      if (out.length === 0) out.push(cells); // header row was in tbody
      else out.push(cells);
    }
  }
  return out;
}
