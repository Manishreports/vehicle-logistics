import * as XLSX from 'xlsx';
import { parseHumanDate } from '../domain/date.js';
import { normalizeKey, normalizeSlip, normalizeSto, normalizeText } from '../domain/normalization.js';
import type { GateRecord, ParsedWorkbook, ParseWarning } from '../types/models.js';

function headerKey(value: unknown): string {
  return normalizeKey(value).replace(/[^a-z0-9]/g, '');
}

function headerMap(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[headerKey(key)] = value;
  return out;
}

function get(row: Record<string, unknown>, keys: string[]): unknown {
  const normalized = headerMap(row);
  for (const k of keys) if (normalized[k] !== undefined) return normalized[k];
  return undefined;
}

const IN_HEADERS = ['vehiclein', 'gatein', 'gateindate', 'vehicleindate', 'arrivaldate', 'gateindatetime'];
const OUT_HEADERS = ['vehicleout', 'gateout', 'gateoutdate', 'gateoutdatedate', 'dispatchdate', 'vehicleoutdate'];
const SLIP_HEADERS = ['gateslip', 'slip', 'slipnumber', 'gatenumber'];
const STO_HEADERS = ['sto', 'stonumber', 'stocktransferorder', 'transferorder'];
const VEHICLE_HEADERS = ['vehiclenumber', 'vehicleno', 'vehicle', 'registrationnumber', 'regno'];
const CFA_HEADERS = ['cfa', 'cfaname', 'location'];

export function parseWorkbook(buffer: ArrayBuffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
  const gateRecords: GateRecord[] = [];
  const warnings: ParseWarning[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    rows.forEach((raw, index) => {
      const row = headerMap(raw);
      const slip = normalizeSlip(get(row, SLIP_HEADERS));
      const sto = normalizeSto(get(row, STO_HEADERS));
      const vehicleNumber = normalizeText(get(row, VEHICLE_HEADERS));
      const vehicleIn = parseHumanDate(get(row, IN_HEADERS));
      const vehicleOut = parseHumanDate(get(row, OUT_HEADERS));
      const cfa = normalizeText(get(row, CFA_HEADERS));
      const hasAny = Boolean(slip || sto || vehicleNumber || vehicleIn || vehicleOut || cfa);
      if (!hasAny) return;
      if (!slip && !sto) {
        warnings.push({ level: 'warning', message: 'Row has vehicle/event data but no STO or Gate Slip; row retained only as warning.', sheet: sheetName, row: index + 2 });
      }
      if (vehicleIn && vehicleOut && vehicleOut < vehicleIn) {
        warnings.push({ level: 'error', message: 'Gate Out is earlier than Gate In.', sheet: sheetName, row: index + 2 });
      }
      gateRecords.push({
        id: `${sheetName}:${index + 2}`,
        gateSlip: slip,
        sto,
        vehicleNumber,
        gateInDate: vehicleIn,
        gateOutDate: vehicleOut,
        cfa,
        rawSheet: sheetName,
        sourceRow: index + 2
      });
    });
  });

  // Stable de-duplication only when the complete identity and event values are identical.
  const seen = new Set<string>();
  const deduped = gateRecords.filter((r) => {
    const key = [normalizeKey(r.gateSlip), normalizeKey(r.sto), r.gateInDate, r.gateOutDate, normalizeKey(r.vehicleNumber)].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { gateRecords: deduped, warnings };
}

export function exportRowsToWorkbook(rows: unknown[][], sheetName: string): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
