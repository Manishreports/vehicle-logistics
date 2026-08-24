import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppState } from '../src/types/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Production build:
// dist-server/server/index.js
// Project root is two levels above this directory.
const projectRoot = path.resolve(__dirname, '../..');

const dataFile = path.join(projectRoot, 'data', 'db.json');
const distDir = path.join(projectRoot, 'dist');

const emptyState = (): AppState => ({
  planningRecords: [],
  statusRecords: [],
  raipurRecords: [],
  gateRecords: [],
  mappings: [],
  settings: {
    loadingPoints: [],
  },
  version: 1,
});

async function readState(): Promise<AppState> {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw) as AppState;

    return {
      ...emptyState(),
      ...parsed,
    };
  } catch {
    const state = emptyState();

    await fs.mkdir(path.dirname(dataFile), {
      recursive: true,
    });

    await fs.writeFile(
      dataFile,
      JSON.stringify(state, null, 2),
      'utf8'
    );

    return state;
  }
}

async function writeState(state: AppState) {
  const temp = `${dataFile}.tmp`;

  await fs.writeFile(
    temp,
    JSON.stringify(state, null, 2),
    'utf8'
  );

  await fs.rename(temp, dataFile);
}

const app = express();

app.use(
  express.json({
    limit: '25mb',
  })
);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    offline: true,
  });
});

// Get application state
app.get('/api/state', async (_req, res) => {
  try {
    const state = await readState();
    res.json(state);
  } catch (error) {
    console.error('Failed to read state:', error);
    res.status(500).json({
      error: 'Failed to read application state',
    });
  }
});

// Save application state
app.put('/api/state', async (req, res) => {
  try {
    const next = req.body as AppState;

    if (!next || typeof next !== 'object') {
      return res.status(400).json({
        error: 'Invalid state',
      });
    }

    await writeState({
      ...emptyState(),
      ...next,
    });

    return res.json({
      ok: true,
    });
  } catch (error) {
    console.error('Failed to write state:', error);

    return res.status(500).json({
      error: 'Failed to save application state',
    });
  }
});

// Reset application
app.post('/api/reset', async (_req, res) => {
  try {
    await writeState(emptyState());

    return res.json({
      ok: true,
    });
  } catch (error) {
    console.error('Failed to reset state:', error);

    return res.status(500).json({
      error: 'Failed to reset application state',
    });
  }
});

// Serve production frontend
try {
  await fs.access(distDir);

  console.log(`Serving frontend from: ${distDir}`);

  app.use(express.static(distDir));

  // SPA fallback for React/Vite routes
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} catch (error) {
  console.error(
    `Frontend dist directory not found: ${distDir}`,
    error
  );

  // Development mode:
  // Vite serves the frontend separately.
}

// Render provides PORT automatically.
const port = Number(process.env.PORT || 4173);

app.listen(port, '0.0.0.0', () => {
  console.log(
    `Vehicle Logistics server listening on port ${port}`
  );
});
