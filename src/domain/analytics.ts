import { daysBetween } from './date.js';
import { normalizeKey, normalizeText } from './normalization.js';
import { buildPage1Groups, buildPage2Groups } from './matchers.js';
import type { MappingRule, OnloadingVehicleRow, Page1Group, Page2Group, PendingSTORow, PlanningRecord, StatusRecord, VehiclePendingRow } from '../types/models.js';
import { page1GroupKey } from './keys.js';

export function vehicleCallPending(page1: Page1Group[], page2: Page2Group[]): Page1Group[] {
  const page2Keys = new Set(page2.map((g) => g.key));
  return page1.filter((g) => g.status !== 'Cancelled' && !page2Keys.has(g.key));
}

export function vehicleCalledPlanPending(page2: Page2Group[]): Page2Group[] {
  return page2.filter((g) => !g.page1Match && g.records.some((r) => !r.cancelled && !r.ignored && r.remark !== 'Dispatched to party'));
}

export function pendingSTOWorking(planning: PlanningRecord[], mappings: MappingRule[]): PendingSTORow[] {
  const groups = buildPage1Groups(planning, mappings);
  const out: PendingSTORow[] = [];
  for (const group of groups) {
    const states = group.records.map((r) => {
      if (r.status === 'Ignore' || r.status === 'Cancel' || r.cancelled) return 'Ignore';
      if (r.vehicleIn && r.vehicleOut) return 'Dispatched';
      return 'Pending';
    });
    const dispatchedCount = states.filter((s) => s === 'Dispatched').length;
    const pendingRecords = group.records.filter((r) => !r.cancelled && r.status !== 'Cancel' && r.status !== 'Ignore' && !(r.vehicleIn && r.vehicleOut));
    if (dispatchedCount > 0 && pendingRecords.length > 0) {
      for (const r of pendingRecords) out.push({ sto: r.sto, category: 'Vehicle dispatched, STO pending', page1GroupKey: group.key });
    } else if (dispatchedCount === 0 && pendingRecords.length > 0) {
      for (const r of pendingRecords) out.push({ sto: r.sto, category: 'Core Pending', page1GroupKey: group.key });
    }
  }
  return out;
}

function displayNumbered(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const seen = new Map<string, number>();
  return values.map((v) => {
    if ((counts.get(v) ?? 0) === 1) return v;
    const n = (seen.get(v) ?? 0) + 1;
    seen.set(v, n);
    return `${v} ${n}`;
  });
}

export function onloadingVehicles(page1: Page1Group[]): OnloadingVehicleRow[] {
  const rows = page1.filter((g) => !!g.vehicleIn && !g.vehicleOut).map((g) => ({ loadingPoint: g.loadingPoint, cfaName: normalizeText(g.cfa), vehicleNo: g.vehicleNumber, vehicleInDate: g.vehicleIn }));
  rows.sort((a, b) => a.cfaName.localeCompare(b.cfaName, undefined, { sensitivity: 'base' }));
  const numbered = displayNumbered(rows.map((r) => r.cfaName));
  return rows.map((r, index) => ({ srNo: index + 1, loadingPoint: r.loadingPoint, cfaName: numbered[index], vehicleNo: r.vehicleNo, vehicleInDate: r.vehicleInDate }));
}

export function vehiclePending(status: StatusRecord[], todayISO: string, mappings: MappingRule[]): VehiclePendingRow[] {
  const eligible = status.filter((r) => !r.vehicleIn && !r.cancelled && !r.ignored && r.remark !== 'Dispatched to party');
  const groups = new Map<string, StatusRecord[]>();
  for (const r of eligible) {
    const key = `${r.demandDate}|${normalizeKey(r.location)}|${normalizeKey(r.loadingPoint)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const raw = [...groups.values()].map((records) => {
    const first = records[0];
    const cleanLocation = normalizeText(first.location);
    return {
      demandedDate: first.demandDate,
      requiredDate: first.requiredDate,
      loadingPoint: first.loadingPoint,
      location: cleanLocation,
      weight: records.reduce((s, r) => s + (r.weight ?? 0), 0),
      pendingBy: daysBetween(todayISO, first.requiredDate)
    };
  });
  raw.sort((a, b) => a.demandedDate.localeCompare(b.demandedDate) || a.location.localeCompare(b.location, undefined, { sensitivity: 'base' }));
  const numbered = displayNumbered(raw.map((r) => r.location));
  return raw.map((r, i) => ({ sNo: i + 1, demandedDate: r.demandedDate, requiredDate: r.requiredDate, loadingPoint: r.loadingPoint, location: numbered[i], weight: r.weight || null, pendingBy: r.pendingBy === null ? '-' : `${r.pendingBy} Days` }));
}

export function plantWiseCfaDistribution(page1: Page1Group[]): { cfa: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const g of page1) counts.set(normalizeText(g.cfa), (counts.get(normalizeText(g.cfa)) ?? 0) + 1);
  return [...counts.entries()].map(([cfa, count]) => ({ cfa, count })).sort((a, b) => a.cfa.localeCompare(b.cfa));
}

export function page1Kpis(groups: Page1Group[]) {
  return {
    totalPlanned: groups.length,
    pendingVehicles: groups.filter((g) => g.status === 'Pending').length,
    onLoading: groups.filter((g) => g.status === 'On Loading').length,
    cancelled: groups.filter((g) => g.status === 'Cancelled').length
  };
}

export function page2Kpis(groups: Page2Group[], callPending: Page1Group[], planPending: Page2Group[]) {
  return {
    totalPlanned: groups.length,
    pendingVehicles: groups.filter((g) => g.status === 'Pending').length,
    vehicleCallPending: callPending.length,
    vehicleCalledPlanPending: planPending.length,
    onLoading: groups.filter((g) => g.status === 'On Loading').length,
    cancelled: groups.filter((g) => g.status === 'Cancelled').length
  };
}
