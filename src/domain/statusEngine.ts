import type { Page1Group, Page1PlanStatus, Page2Group, Page2Status, PlanningRecord, StatusRecord, DerivedOperationalStatus } from '../types/models.js';

export function operationalStatus(vehicleIn: string, vehicleOut: string): 'Pending' | 'On Loading' | 'Dispatched' {
  if (vehicleIn && vehicleOut) return 'Dispatched';
  if (vehicleIn) return 'On Loading';
  return 'Pending';
}

export function recordStatus(record: PlanningRecord): DerivedOperationalStatus {
  if (record.status === 'Ignore') return 'Ignore';
  if (record.cancelled || record.status === 'Cancel') return 'Cancelled';
  return operationalStatus(record.vehicleIn, record.vehicleOut);
}

export function page2RecordStatus(record: StatusRecord): Page2Status {
  if (record.status === 'Ignore' || record.ignored) return 'Ignore';
  if (record.cancelled || record.status === 'Cancelled') return 'Cancelled';
  if (record.remark === 'Dispatched to party') return operationalStatus(record.vehicleIn, record.vehicleOut);
  return operationalStatus(record.vehicleIn, record.vehicleOut);
}

function uniqueNonBlank(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function derivePage1Status(records: PlanningRecord[]): Page1PlanStatus {
  if (records.length === 0) return 'Pending';
  if (records.every((r) => r.cancelled || r.status === 'Cancel')) return 'Cancelled';
  const active = records.filter((r) => !r.cancelled && r.status !== 'Cancel');
  if (active.length === 0) return 'Cancelled';
  const statuses = active.map(recordStatus);
  if (statuses.every((s) => s === 'Ignore')) return 'Ignore';
  const effective = statuses.filter((s) => s !== 'Ignore');
  if (effective.length && effective.every((s) => s === 'Dispatched')) return 'Dispatched';
  if (effective.some((s) => s === 'On Loading')) return 'On Loading';
  return 'Pending';
}

export function derivePage2Status(records: StatusRecord[]): Page2Status {
  if (records.length === 0) return 'Pending';
  if (records.every((r) => r.cancelled)) return 'Cancelled';
  if (records.some((r) => r.ignored)) return 'Ignore';
  const statuses = records.filter((r) => !r.cancelled && !r.ignored).map(page2RecordStatus);
  if (statuses.length && statuses.every((s) => s === 'Dispatched')) return 'Dispatched';
  if (statuses.some((s) => s === 'On Loading')) return 'On Loading';
  return 'Pending';
}

export function multipleArrivalDates(records: PlanningRecord[]): { date: string; stoNumbers: string[] }[] {
  const map = new Map<string, string[]>();
  for (const r of records) {
    if (!r.vehicleIn) continue;
    const list = map.get(r.vehicleIn) ?? [];
    if (r.sto && !list.includes(r.sto)) list.push(r.sto);
    map.set(r.vehicleIn, list);
  }
  return [...map.entries()].map(([date, stoNumbers]) => ({ date, stoNumbers }));
}

export function buildPage1Group(key: string, records: PlanningRecord[]): Page1Group {
  const first = records[0];
  return {
    key,
    date: first.date,
    cfa: first.cfa,
    loadingPoint: first.loadingPoint,
    locations: uniqueNonBlank(records.map((r) => r.location)),
    plants: uniqueNonBlank(records.map((r) => r.plant)),
    weights: records.reduce((sum, r) => sum + (r.weight ?? 0), 0),
    records,
    vehicleIn: uniqueNonBlank(records.map((r) => r.vehicleIn))[0] ?? '',
    vehicleOut: uniqueNonBlank(records.map((r) => r.vehicleOut))[0] ?? '',
    vehicleNumber: uniqueNonBlank(records.map((r) => r.vehicleNumber))[0] ?? '',
    slips: uniqueNonBlank(records.map((r) => r.slipNumber)),
    statuses: uniqueNonBlank(records.map(recordStatus)) as DerivedOperationalStatus[],
    status: derivePage1Status(records),
    multipleArrivalDates: multipleArrivalDates(records)
  };
}

export function buildPage2Group(key: string, records: StatusRecord[], page1Match: Page1Group | null): Page2Group {
  const first = records[0];
  return {
    key,
    demandDate: first.demandDate,
    location: first.location,
    loadingPoint: first.loadingPoint,
    records,
    status: derivePage2Status(records),
    page1Match,
    vehicleIn: page1Match?.vehicleIn || first.vehicleIn,
    vehicleOut: page1Match?.vehicleOut || first.vehicleOut,
    vehicleNumber: page1Match?.vehicleNumber || first.vehicleNumber,
    slipNumbers: page1Match?.slips ?? []
  };
}
