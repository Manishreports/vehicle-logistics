import { matchExactSto, applyGateEnrichment } from './matchers.js';
import { raipurKey } from './keys.js';
import { normalizeKey, normalizeCfa } from './normalization.js';
import type { DomainIndexes } from './indexes.js';
import type { MappingRule, PlanningRecord, RaipurRecord } from '../types/models.js';

function enrichFromRaipur(record: PlanningRecord, raipur: RaipurRecord[]): PlanningRecord {
  const candidates = raipur.filter((r) => r.date === record.date && normalizeKey(r.cfa) === normalizeKey(record.cfa) && normalizeKey(r.loadingPoint) === normalizeKey(record.loadingPoint));
  if (!candidates.length) return record;
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
  const slips = unique(candidates.map((r) => r.slipNumber));
  const vins = unique(candidates.map((r) => r.vehicleIn));
  const vnums = unique(candidates.map((r) => r.vehicleNumber));
  const vouts = unique(candidates.map((r) => r.vehicleOut));
  return {
    ...record,
    slipNumber: slips.length === 1 ? slips[0] : record.slipNumber,
    vehicleIn: vins.length === 1 ? vins[0] : record.vehicleIn,
    vehicleNumber: vnums.length === 1 ? vnums[0] : record.vehicleNumber,
    vehicleOut: vouts.length === 1 ? vouts[0] : record.vehicleOut
  };
}

export function derivePlanningView(records: PlanningRecord[], indexes: DomainIndexes, raipur: RaipurRecord[], mappings: MappingRule[]): PlanningRecord[] {
  return records.map((record) => {
    if (normalizeKey(normalizeCfa(record.cfa, mappings)) === 'raipur') return enrichFromRaipur(record, raipur);
    const matched = matchExactSto(record.sto, indexes);
    return matched.ambiguous ? record : applyGateEnrichment(record, matched);
  });
}

export function gateSequenceErrors(records: PlanningRecord[]): { recordId: string; message: string }[] {
  return records.filter((r) => r.vehicleIn && r.vehicleOut && r.vehicleOut < r.vehicleIn).map((r) => ({ recordId: r.id, message: `Gate Out earlier than Gate In for ${r.cfa} / ${r.loadingPoint} / ${r.sto} / ${r.vehicleNumber}` }));
}
