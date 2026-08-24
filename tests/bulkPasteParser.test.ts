import { describe, expect, it } from 'vitest';
import { parseBulkPaste } from '../src/services/bulkPasteParser';
import type { MappingRule, PlanningRecord, StatusRecord } from '../src/types/models';

const mappings: MappingRule[] = [];
const ridFactory = () => { let i = 0; return () => `bulk-${++i}`; };
const now = () => '2026-08-24T00:00:00.000Z';
const emptyP: PlanningRecord[] = [];
const emptyS: StatusRecord[] = [];

describe('bulk paste parser', () => {
  it('parses Page 1 with headers in a different order', () => {
    const nextId = ridFactory();
    const text = [
      'Vehicle Number\tDate\tCFA\tWeight\tSTO Number\tLoading Point\tPlant\tVehicle In\tVehicle Out\tLocation\tSlip',
      'CG04AB1234\t20-Aug-2026\tGhaziabad\t17.3\t123456\tBAKAL\tPlant 1\t20-Aug-2026\t20-Aug-2026\tMAIN\tSLIP001'
    ].join('\n');
    const result = parseBulkPaste('planning', text, emptyP, emptyS, mappings, nextId, now);
    expect(result.validRows).toBe(1);
    expect(result.rows[0].record).toMatchObject({ date: '2026-08-20', sto: '123456', vehicleIn: '2026-08-20', vehicleOut: '2026-08-20', vehicleNumber: 'CG04AB1234' });
  });

  it('supports weight in tons and kilograms', () => {
    const nextId = ridFactory();
    const text = [
      'Date\tCFA\tLoading Point\tSTO\tWeight',
      '20-Aug-2026\tA\tBAKAL\t1\t17 Ton 300 Kg',
      '20-Aug-2026\tB\tBAKAL\t2\t300 Kg'
    ].join('\n');
    const result = parseBulkPaste('planning', text, emptyP, emptyS, mappings, nextId, now);
    expect(result.validRows).toBe(2);
    expect((result.rows[0].record as PlanningRecord).weight).toBe(17.3);
    expect((result.rows[1].record as PlanningRecord).weight).toBe(0.3);
  });

  it('flags invalid and duplicate Page 1 rows without rejecting valid rows', () => {
    const nextId = ridFactory();
    const existing: PlanningRecord = {
      id: 'existing', date: '2026-08-20', location: 'MAIN', plant: 'Plant 1', cfa: 'A', weight: 1, sto: '1', loadingPoint: 'BAKAL', vehicleIn: '', vehicleNumber: '', vehicleOut: '', slipNumber: '', status: 'Pending', source: 'manual', createdAt: '', updatedAt: ''
    };
    const text = [
      'Date\tCFA\tLoading Point\tSTO',
      '20-Aug-2026\tA\tBAKAL\t1',
      'bad-date\tA\tBAKAL\t2',
      '20-Aug-2026\tA\tBAKAL\t1',
      '20-Aug-2026\tB\tBAKAL\t3'
    ].join('\n');
    const result = parseBulkPaste('planning', text, [existing], emptyS, mappings, nextId, now);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.duplicateRows).toBe(2);
  });

  it('parses Page 2 in different column order and applies direct-party validation', () => {
    const nextId = ridFactory();
    const text = [
      'Location\tVehicle Number\tLoading Point\tDemand Date\tRemark\tRequired Date\tVehicle In\tVehicle Out\tWeight',
      'Ghaziabad\tCG04AB1234\tBAKAL\t20-Aug-2026\t\t21-Aug-2026\t20-Aug-2026\t\t17.3',
      'A\t\tBAKAL\t20-Aug-2026\tDispatched to party\t20-Aug-2026\t20-Aug-2026\t\t10'
    ].join('\n');
    const result = parseBulkPaste('status', text, emptyP, emptyS, mappings, nextId, now);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.rows[1].reasons).toContain('Dispatched to party requires both Vehicle In and Vehicle Out');
  });

  it('handles 1000+ rows in one parse', () => {
    const nextId = ridFactory();
    const rows = ['Date\tCFA\tLoading Point\tSTO'];
    for (let i = 0; i < 1200; i++) rows.push(`20-Aug-2026\tCFA ${i}\tBAKAL\tSTO${i}`);
    const result = parseBulkPaste('planning', rows.join('\n'), emptyP, emptyS, mappings, nextId, now);
    expect(result.validRows).toBe(1200);
  });
});
