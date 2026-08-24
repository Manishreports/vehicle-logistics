import { normalizeText, normalizeKey, normalizeSto, normalizeSlip } from '../domain/normalization.js';
import { parseHumanDate } from '../domain/date.js';
import { page1GroupKey, page2GroupKey } from '../domain/keys.js';
import type { MappingRule, PlanningRecord, StatusRecord } from '../types/models.js';

export type BulkKind = 'planning' | 'status';
export type BulkValidationState = 'valid' | 'invalid' | 'duplicate';

export interface BulkPreviewRow {
  rowNumber: number;
  values: string[];
  mapped: Record<string, string>;
  status: BulkValidationState;
  reasons: string[];
  record?: PlanningRecord | StatusRecord;
  duplicateKey?: string;
}

export interface BulkParseResult {
  headers: string[];
  rows: BulkPreviewRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
}

const PAGE1_HEADERS = {
  date: ['date', 'plandate'],
  location: ['location', 'internalbusinesslocation'],
  plant: ['plant', 'plantname', 'company', 'firm'],
  cfa: ['cfa', 'cfaname', 'city', 'destinationcfa'],
  weight: ['weight', 'qty', 'quantity', 'weightmt', 'weightinmt'],
  sto: ['sto', 'stonumber', 'stonumbers', 'stonumbers', 'stocktransferorder', 'transferorder'],
  loadingPoint: ['loadingpoint', 'loadingpt', 'loadingpointname'],
  vehicleIn: ['vehiclein', 'vehicleindate', 'gatein', 'gateindate', 'arrivaldate'],
  vehicleNumber: ['vehiclenumber', 'vehicleno', 'vehicleno', 'vehicle', 'registrationnumber', 'regno'],
  vehicleOut: ['vehicleout', 'vehicleoutdate', 'gateout', 'gateoutdate', 'dispatchdate'],
  slipNumber: ['slip', 'slipnumber', 'gateslip', 'gateslipnumber', 'gate_slip', 'gate_slip_number']
};

const PAGE2_HEADERS = {
  demandDate: ['demanddate', 'demandeddate', 'date', 'calldate'],
  requiredDate: ['requireddate', 'requiredby', 'requiredbydate', 'requirementdate'],
  location: ['location', 'cfaname', 'cfa', 'city', 'destination'],
  loadingPoint: ['loadingpoint', 'loadingpt', 'loadingpointname'],
  weight: ['weight', 'qty', 'quantity', 'weightmt', 'weightinmt'],
  remark: ['remark', 'remarks', 'statusremark'],
  vehicleIn: ['vehiclein', 'vehicleindate', 'gatein', 'gateindate', 'arrivaldate'],
  vehicleNumber: ['vehiclenumber', 'vehicleno', 'vehicleno', 'vehicle', 'registrationnumber', 'regno'],
  vehicleOut: ['vehicleout', 'vehicleoutdate', 'gateout', 'gateoutdate', 'dispatchdate']
};

function normalizeHeader(value: unknown): string {
  return normalizeKey(value).replace(/[^a-z0-9]/g, '');
}

function findHeader(headers: string[], aliases: string[]): number {
  const aliasSet = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((h) => aliasSet.has(normalizeHeader(h)));
}

function mapRow(headers: string[], cells: string[], schema: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(schema)) {
    const index = findHeader(headers, aliases);
    out[field] = index >= 0 ? normalizeText(cells[index] ?? '') : '';
  }
  return out;
}

function parseBulkWeight(value: string): number | null {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  const tonMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:ton|tons|tonne|tonnes|mt)\b/);
  const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilogram|kilograms)\b/);
  if (!tonMatch && !kgMatch) return null;
  const tons = tonMatch ? Number(tonMatch[1]) : 0;
  const kg = kgMatch ? Number(kgMatch[1]) : 0;
  const total = tons + kg / 1000;
  return Number.isFinite(total) && total >= 0 ? Number(total.toFixed(3)) : null;
}

function validateCommonDates(mapped: Record<string, string>, fields: string[], reasons: string[]): Record<string, string> {
  const parsed: Record<string, string> = { ...mapped };
  for (const field of fields) {
    const raw = mapped[field];
    parsed[field] = parseHumanDate(raw);
    if (raw && !parsed[field]) reasons.push(field === 'demandDate' || field === 'date' ? 'Invalid date format' : `Invalid ${field}`);
  }
  return parsed;
}

function duplicateKeyForPlanning(record: PlanningRecord, mappings: MappingRule[]): string {
  return `${page1GroupKey(record, mappings)}|STO:${normalizeSto(record.sto)}`;
}

function duplicateKeyForStatus(record: StatusRecord, mappings: MappingRule[]): string {
  return `${page2GroupKey(record, mappings)}|REQUIRED:${record.requiredDate}|VEHICLE:${normalizeKey(record.vehicleNumber)}|REMARK:${normalizeKey(record.remark)}`;
}

function requiredHeadersPresent(headers: string[], required: string[][]): boolean {
  return required.every((aliases) => findHeader(headers, aliases) >= 0);
}

function parseRows(kind: BulkKind, text: string, existingPlanning: PlanningRecord[], existingStatus: StatusRecord[], mappings: MappingRule[], rid: () => string, now: () => string): BulkParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], totalRows: 0, validRows: 0, invalidRows: 0, duplicateRows: 0 };

  const headers = lines[0].split('\t').map((h) => normalizeText(h));
  const schema = kind === 'planning' ? PAGE1_HEADERS : PAGE2_HEADERS;
  const required = kind === 'planning'
    ? [PAGE1_HEADERS.date, PAGE1_HEADERS.cfa, PAGE1_HEADERS.loadingPoint, PAGE1_HEADERS.sto]
    : [PAGE2_HEADERS.demandDate, PAGE2_HEADERS.location, PAGE2_HEADERS.loadingPoint];

  const headerError = requiredHeadersPresent(headers, required) ? '' : 'Required header(s) are missing';
  const seen = new Set<string>();
  for (const record of existingPlanning) if (kind === 'planning') seen.add(duplicateKeyForPlanning(record, mappings));
  for (const record of existingStatus) if (kind === 'status') seen.add(duplicateKeyForStatus(record, mappings));

  const rows: BulkPreviewRow[] = lines.slice(1).map((line, index) => {
    const rowNumber = index + 2;
    const cells = line.split('\t');
    const mapped = mapRow(headers, cells, schema);
    const reasons: string[] = [];
    if (headerError) reasons.push(headerError);

    if (kind === 'planning') {
      const parsed = validateCommonDates(mapped, ['date', 'vehicleIn', 'vehicleOut'], reasons);
      if (!parsed.date) reasons.push('Missing Date');
      if (!mapped.cfa) reasons.push('Missing CFA');
      if (!mapped.loadingPoint) reasons.push('Missing Loading Point');
      if (!normalizeSto(mapped.sto)) reasons.push('Missing STO');
      const weight = parseBulkWeight(mapped.weight);
      if (mapped.weight && weight === null) reasons.push('Invalid Weight');
      if (parsed.vehicleIn && parsed.vehicleOut && parsed.vehicleOut < parsed.vehicleIn) reasons.push('Vehicle Out cannot be earlier than Vehicle In');
      const record: PlanningRecord = {
        id: rid(),
        date: parsed.date,
        location: normalizeText(mapped.location),
        plant: normalizeText(mapped.plant),
        cfa: normalizeText(mapped.cfa),
        weight,
        sto: normalizeSto(mapped.sto),
        loadingPoint: normalizeText(mapped.loadingPoint),
        vehicleIn: parsed.vehicleIn,
        vehicleNumber: normalizeText(mapped.vehicleNumber),
        vehicleOut: parsed.vehicleOut,
        slipNumber: normalizeSlip(mapped.slipNumber),
        status: 'Pending',
        source: 'import',
        createdAt: now(),
        updatedAt: now()
      };
      const duplicateKey = duplicateKeyForPlanning(record, mappings);
      const duplicate = seen.has(duplicateKey);
      if (duplicate) reasons.push('Duplicate record');
      else if (!reasons.length) seen.add(duplicateKey);
      return { rowNumber, values: cells, mapped, status: reasons.length ? (duplicate ? 'duplicate' : 'invalid') : 'valid', reasons, record, duplicateKey };
    }

    const parsed = validateCommonDates(mapped, ['demandDate', 'requiredDate', 'vehicleIn', 'vehicleOut'], reasons);
    if (!parsed.demandDate) reasons.push('Missing Demand Date');
    if (!mapped.location) reasons.push('Missing Location');
    if (!mapped.loadingPoint) reasons.push('Missing Loading Point');
    const weight = parseBulkWeight(mapped.weight);
    if (mapped.weight && weight === null) reasons.push('Invalid Weight');
    if (parsed.vehicleIn && parsed.vehicleOut && parsed.vehicleOut < parsed.vehicleIn) reasons.push('Vehicle Out cannot be earlier than Vehicle In');
    if (normalizeText(mapped.remark) === 'Dispatched to party' && (!parsed.vehicleIn || !parsed.vehicleOut)) reasons.push('Dispatched to party requires both Vehicle In and Vehicle Out');
    const record: StatusRecord = {
      id: rid(),
      demandDate: parsed.demandDate,
      requiredDate: parsed.requiredDate,
      location: normalizeText(mapped.location),
      loadingPoint: normalizeText(mapped.loadingPoint),
      weight,
      vehicleNumber: normalizeText(mapped.vehicleNumber),
      vehicleIn: parsed.vehicleIn,
      vehicleOut: parsed.vehicleOut,
      remark: normalizeText(mapped.remark),
      status: 'Pending',
      createdAt: now(),
      updatedAt: now()
    };
    const duplicateKey = duplicateKeyForStatus(record, mappings);
    const duplicate = seen.has(duplicateKey);
    if (duplicate) reasons.push('Duplicate record');
    else if (!reasons.length) seen.add(duplicateKey);
    return { rowNumber, values: cells, mapped, status: reasons.length ? (duplicate ? 'duplicate' : 'invalid') : 'valid', reasons, record, duplicateKey };
  });

  return {
    headers,
    rows,
    totalRows: rows.length,
    validRows: rows.filter((r) => r.status === 'valid').length,
    invalidRows: rows.filter((r) => r.status === 'invalid').length,
    duplicateRows: rows.filter((r) => r.status === 'duplicate').length
  };
}

export function parseBulkPaste(kind: BulkKind, text: string, existingPlanning: PlanningRecord[], existingStatus: StatusRecord[], mappings: MappingRule[], rid: () => string, now: () => string): BulkParseResult {
  return parseRows(kind, text, existingPlanning, existingStatus, mappings, rid, now);
}
