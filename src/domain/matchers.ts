import { normalizeKey, normalizeSto } from './normalization.js';
import { page1GroupKey, page2GroupKey } from './keys.js';
import type { DomainIndexes } from './indexes.js';
import type { MappingRule, Page1Group, Page2Group, PlanningRecord, StatusRecord } from '../types/models.js';
import { buildPage1Group, buildPage2Group } from './statusEngine.js';

export interface MatchResult<T> { matched: boolean; value: T | null; ambiguous: boolean; candidates: T[]; reason?: string; }

export function matchExactSto(sto: string, indexes: DomainIndexes): MatchResult<import('../types/models.js').GateRecord> {
  const candidates = indexes.stoToGates.get(normalizeSto(sto)) ?? [];
  const slips = [...new Set(candidates.map((g) => normalizeKey(g.gateSlip)).filter(Boolean))];
  if (candidates.length === 0) return { matched: false, value: null, ambiguous: false, candidates, reason: 'No exact STO match' };
  if (slips.length > 1) return { matched: false, value: null, ambiguous: true, candidates, reason: 'Multiple gate slips matched the same STO' };
  return { matched: true, value: candidates[0], ambiguous: false, candidates };
}

export function matchSlipExact(slip: string, indexes: DomainIndexes): MatchResult<import('../types/models.js').GateRecord> {
  const candidates = indexes.slipToGates.get(normalizeKey(slip)) ?? [];
  if (!candidates.length) return { matched: false, value: null, ambiguous: false, candidates, reason: 'No exact slip match' };
  return { matched: true, value: candidates[0], ambiguous: false, candidates };
}

export function applyGateEnrichment(record: PlanningRecord, result: ReturnType<typeof matchExactSto>, allGateCandidates = result.candidates): PlanningRecord {
  if (!result.matched || !result.value || result.ambiguous) return record;
  const slip = result.value.gateSlip;
  const sameSlip = allGateCandidates.filter((g) => normalizeKey(g.gateSlip) === normalizeKey(slip));
  const vehicleNumbers = [...new Set(sameSlip.map((g) => g.vehicleNumber).filter(Boolean))];
  const gateIns = [...new Set(sameSlip.map((g) => g.gateInDate).filter(Boolean))];
  const gateOuts = [...new Set(sameSlip.map((g) => g.gateOutDate).filter(Boolean))];
  return {
    ...record,
    slipNumber: slip,
    vehicleIn: gateIns.length === 1 ? gateIns[0] : record.vehicleIn,
    vehicleNumber: vehicleNumbers.length === 1 ? vehicleNumbers[0] : record.vehicleNumber,
    vehicleOut: gateOuts.length === 1 ? gateOuts[0] : record.vehicleOut
  };
}

export function buildPage1Groups(records: PlanningRecord[], mappings: MappingRule[]): Page1Group[] {
  const map = new Map<string, PlanningRecord[]>();
  for (const r of records) {
    const key = page1GroupKey(r, mappings);
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()].map(([key, rows]) => buildPage1Group(key, rows));
}

export function buildPage2Groups(records: StatusRecord[], page1Groups: Page1Group[], mappings: MappingRule[]): Page2Group[] {
  const lookup = new Map(page1Groups.map((g) => [g.key, g]));
  const map = new Map<string, StatusRecord[]>();
  for (const r of records) {
    const key = page2GroupKey(r, mappings);
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()].map(([key, rows]) => buildPage2Group(key, rows, lookup.get(key) ?? null));
}
