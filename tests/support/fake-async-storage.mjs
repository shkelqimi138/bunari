// In-memory AsyncStorage double for tests
const store = new Map();

export default {
  async getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async removeItem(key) {
    store.delete(key);
  },
  async setItem(key, value) {
    store.set(key, value);
  },
};
