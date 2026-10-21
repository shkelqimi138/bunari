// The photo picker's shape, shared by the iPhone picker (photo-picker.ios.tsx) and the system picker
// used elsewhere (photo-picker.tsx), so type checking catches either one drifting from the other
export type PickedPhoto = { mimeType: string; uri: string };
export type PickOptions = { max?: number; title?: string };
export type PickPhotos = (options?: PickOptions) => Promise<PickedPhoto[]>;
