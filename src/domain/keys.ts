import { normalizeCfa, normalizeKey, normalizeLoadingPoint, normalizeLocation, normalizeSlip, normalizeSto } from './normalization.js';
import type { MappingRule, PlanningRecord, StatusRecord } from '../types/models.js';

export function page1GroupKey(record: Pick<PlanningRecord, 'date' | 'cfa' | 'loadingPoint'>, mappings: MappingRule[]): string {
  return [record.date, normalizeKey(normalizeCfa(record.cfa, mappings)), normalizeKey(normalizeLoadingPoint(record.loadingPoint, mappings))].join('|');
}

export function page2GroupKey(record: Pick<StatusRecord, 'demandDate' | 'location' | 'loadingPoint'>, mappings: MappingRule[]): string {
  return [record.demandDate, normalizeKey(normalizeLocation(record.location, mappings)), normalizeKey(normalizeLoadingPoint(record.loadingPoint, mappings))].join('|');
}

export function raipurKey(date: string, cfa: string, loadingPoint: string, mappings: MappingRule[]): string {
  return [date, normalizeKey(normalizeCfa(cfa, mappings)), normalizeKey(normalizeLoadingPoint(loadingPoint, mappings))].join('|');
}

export function stoSlipKey(sto: string, slip: string): string {
  const s = normalizeSto(sto);
  const p = normalizeSlip(slip);
  if (p && s) return `SLIP:${p}|STO:${s}`;
  if (p) return `SLIP:${p}`;
  if (s) return `STO:${s}`;
  return '';
}
