export function formatISODate(value: string): string {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
}

function fromParts(day: number, month: number, year: number): string | null {
  const fullYear = year < 100 ? 2000 + year : year;
  const dt = new Date(Date.UTC(fullYear, month - 1, day));
  if (dt.getUTCFullYear() !== fullYear || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${fullYear.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function parseHumanDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  if (!text) return '';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split('-').map(Number);
    return fromParts(d, m, y) ?? '';
  }
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) return fromParts(Number(match[1]), Number(match[2]), Number(match[3])) ?? '';
  const monthMatch = text.match(/^(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{2,4})$/);
  if (monthMatch) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const month = months.indexOf(monthMatch[2].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return fromParts(Number(monthMatch[1]), month, Number(monthMatch[3])) ?? '';
  }
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 100000) {
    const epoch = Date.UTC(1899, 11, 30);
    const dt = new Date(epoch + numeric * 86400000);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
  return '';
}

export function compareISODate(a: string, b: string): number {
  return a.localeCompare(b);
}

export function daysBetween(todayISO: string, requiredISO: string): number | null {
  if (!todayISO || !requiredISO) return null;
  const a = Date.parse(`${todayISO}T00:00:00Z`);
  const b = Date.parse(`${requiredISO}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}
