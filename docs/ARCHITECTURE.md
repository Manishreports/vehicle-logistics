# Vehicle Logistics Control System — Architecture

## Layers
1. Raw Input: planningRecords, statusRecords, raipurRecords, gateRecords.
2. Normalization: deterministic text, STO/slip, date parsing and user mappings.
3. Match/Index: STO→gate records, Slip→gate records, Page 1 groups, Page 2 groups, Raipur Date+CFA+Loading Point.
4. Business Engine: enrichment views, status engine, cross-page categories, analytics.
5. Presentation: React pages, KPI filters, tables and export services.

## Page 1
Primary identity: Date + CFA + Loading Point for visible groups. STO is independently matched to combined gate workbook. Gate Slip is an operational key, but never an STO identity.

## Page 2
Primary group identity: Demand Date + Location + Loading Point. It matches Page 1 Date + CFA + Loading Point. Page 2 remains independent and is never auto-created from Page 1.

## Raipur
Isolated fallback lookup on Date + CFA + Loading Point. It never appends Page 1/Page 2 source rows.

## Persistence
The frontend hydrates from server `/api/state`; localStorage is a fallback. Save effects are disabled until hydration completes. The server persists `data/db.json` atomically.

## Determinism
No fuzzy STO match, no Vehicle Number fallback, no automatic dates, no source mutation for derived reports, and conflicting matches remain unresolved with source values intact.
