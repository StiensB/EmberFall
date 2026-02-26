const KEY = 'emberfall-save-v1';

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function loadState() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
