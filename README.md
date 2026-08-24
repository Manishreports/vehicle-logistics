# Vehicle Planning, Vehicle Call, Gate In/Out & Logistics Control System

Offline-capable React + TypeScript + Express application built from the supplied business specification.

## Development
1. `npm install`
2. `npm run dev`
3. Open the Vite URL shown in the terminal.

## Production local run
1. `npm run build`
2. `npm start`
3. Open `http://localhost:4173`

## Verification
`npm run check`

## Data
Runtime persistent state is stored in `data/db.json` by the local server and mirrored in browser `localStorage` as a fallback. The server creates `data/db.json` automatically when it is missing, so runtime data is intentionally excluded from Git tracking.

## Important design guarantees
- Page 1 and Page 2 source datasets remain independent.
- Exact STO matching only for non-Raipur.
- Multiple STOs can share a Gate Slip without overwriting.
- Gate Slip is used for downstream vehicle fields; Vehicle Number is not a fallback key.
- Raipur matching is isolated to Raipur.
- Blank dates stay blank.
- Derived reports are virtual and do not create source rows.
