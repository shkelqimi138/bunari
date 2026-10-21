// Web preview version of the photo cache
export const mediaCache = {
  async cacheRemote(_userId: string, _storagePath: string, signedUrl: string) {
    return signedUrl;
  },
  async clearUser(_userId: string) {},
  async deleteCopies(_uris: string[]) {},
  hasLocalCopy(_uri: string) {
    return true;
  },
  async localCopies(_userId: string) {
    return [];
  },
  async persistPicked(_userId: string, sourceUri: string, _mediaId: string, mimeType: string) {
    return { mimeType, uri: sourceUri };
  },
  async privateDataUri(sourceUri: string, mimeType: string) {
    const response = await fetch(sourceUri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Private photo could not be read.'));
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : `data:${mimeType};base64,`);
      reader.readAsDataURL(blob);
    });
  },
  async read(sourceUri: string) {
    return (await fetch(sourceUri)).arrayBuffer();
  },
};
