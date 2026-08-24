import { normalizeKey, normalizeSlip, normalizeSto } from './normalization.js';
import { page1GroupKey, page2GroupKey, raipurKey } from './keys.js';
import type { MappingRule, PlanningRecord, StatusRecord, GateRecord, RaipurRecord } from '../types/models.js';

export interface DomainIndexes {
  stoToGates: Map<string, GateRecord[]>;
  slipToGates: Map<string, GateRecord[]>;
  page1Groups: Map<string, PlanningRecord[]>;
  page2Groups: Map<string, StatusRecord[]>;
  raipurGroups: Map<string, RaipurRecord[]>;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  if (!key) return;
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

export function buildIndexes(planning: PlanningRecord[], status: StatusRecord[], gates: GateRecord[], raipur: RaipurRecord[], mappings: MappingRule[]): DomainIndexes {
  const out: DomainIndexes = {
    stoToGates: new Map(), slipToGates: new Map(), page1Groups: new Map(), page2Groups: new Map(), raipurGroups: new Map()
  };
  for (const gate of gates) {
    push(out.stoToGates, normalizeSto(gate.sto), gate);
    push(out.slipToGates, normalizeSlip(gate.gateSlip), gate);
  }
  for (const r of planning) push(out.page1Groups, page1GroupKey(r, mappings), r);
  for (const r of status) push(out.page2Groups, page2GroupKey(r, mappings), r);
  for (const r of raipur) push(out.raipurGroups, raipurKey(r.date, r.cfa, r.loadingPoint, mappings), r);
  return out;
}

export function countUniqueNormalized(values: string[]): number {
  return new Set(values.map(normalizeKey).filter(Boolean)).size;
}
