import type { MappingRule } from '../types/models.js';

export function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ');
}

export function normalizeKey(value: unknown): string {
  return normalizeText(value).toLocaleLowerCase();
}

export function normalizeSto(value: unknown): string {
  const text = normalizeText(value);
  return text.replace(/\.0+$/, '');
}

export function normalizeSlip(value: unknown): string {
  const text = normalizeText(value);
  return text.replace(/\.0+$/, '');
}

export function applyMapping(value: string, field: MappingRule['field'], mappings: MappingRule[]): string {
  const normalized = normalizeKey(value);
  const rule = mappings.find((m) => m.field === field && normalizeKey(m.source) === normalized);
  return rule ? rule.target : value;
}

export function normalizeLocation(value: string, mappings: MappingRule[]): string {
  return applyMapping(normalizeText(value), 'location', mappings);
}

export function normalizeLoadingPoint(value: string, mappings: MappingRule[]): string {
  return applyMapping(normalizeText(value), 'loadingPoint', mappings);
}

export function normalizeCfa(value: string, mappings: MappingRule[]): string {
  return applyMapping(normalizeText(value), 'cfa', mappings);
}
