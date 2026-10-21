// In-memory media cache double for tests

// Local photo files a test has removed from the "device".
export const missingFiles = new Set();

export const mediaCache = {
  hasLocalCopy(uri) {
    return !missingFiles.has(uri);
  },
  async cacheRemote(_userId, storagePath) {
    return `cached://${storagePath}`;
  },
  async read(uri) {
    return new TextEncoder().encode(`bytes:${uri}`);
  },
};
