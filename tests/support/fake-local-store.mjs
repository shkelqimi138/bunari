// In-memory local JSON store double for tests
const store = new Map();

export async function readLocalJson(key) {
  return store.has(key) ? structuredClone(store.get(key)) : null;
}

export async function writeLocalJson(key, value) {
  store.set(key, structuredClone(value));
}
