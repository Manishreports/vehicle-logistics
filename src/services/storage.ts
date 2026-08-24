import type { AppState } from '../types/models.js';

const STORAGE_KEY = 'vehicle-logistics-state-v1';

export async function loadServerState(): Promise<AppState | null> {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) return null;
    return await response.json() as AppState;
  } catch {
    return null;
  }
}

export async function saveServerState(state: AppState): Promise<boolean> {
  try {
    const response = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
    return response.ok;
  } catch {
    return false;
  }
}

export function loadLocalState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as AppState : null;
  } catch {
    return null;
  }
}

export function saveLocalState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearLocalState() {
  localStorage.removeItem(STORAGE_KEY);
}
