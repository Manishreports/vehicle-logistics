import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppState } from '../src/types/models.js';

const projectRoot = process.cwd();
const dataFile = path.join(projectRoot, 'data', 'db.json');
const distDir = path.join(projectRoot, 'dist');

const emptyState = (): AppState => ({ planningRecords: [], statusRecords: [], raipurRecords: [], gateRecords: [], mappings: [], settings: { loadingPoints: [] }, version: 1 });

async function readState(): Promise<AppState> {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw) as AppState;
    return { ...emptyState(), ...parsed };
  } catch {
    const state = emptyState();
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    await fs.writeFile(dataFile, JSON.stringify(state, null, 2));
    return state;
  }
}

async function writeState(state: AppState) {
  const temp = `${dataFile}.tmp`;
  await fs.writeFile(temp, JSON.stringify(state, null, 2));
  await fs.rename(temp, dataFile);
}

const app = express();
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, offline: true }));
app.get('/api/state', async (_req, res) => res.json(await readState()));
app.put('/api/state', async (req, res) => {
  const next = req.body as AppState;
  if (!next || typeof next !== 'object') return res.status(400).json({ error: 'Invalid state' });
  await writeState({ ...emptyState(), ...next });
  return res.json({ ok: true });
});
app.post('/api/reset', async (_req, res) => {
  await writeState(emptyState());
  return res.json({ ok: true });
});

try {
  await fs.access(distDir);
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} catch {
  // In development Vite serves the frontend separately.
}

const port = Number(process.env.PORT || 4173);
app.listen(port, () => console.log(`Vehicle Logistics server listening on http://localhost:${port}`));
