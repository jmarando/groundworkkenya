// Checking a photo the Website editor sends for the campaign's site. The
// browser has already shrunk it to a JPEG; the server still trusts nothing:
// it must decode, be under 2 MB, and start like a JPEG.

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export class PhotoError extends Error {}

/** The photo's bytes from base64, or a PhotoError saying what is wrong. */
export function decodeSitePhoto(b64: string): Uint8Array {
  if (typeof b64 !== "string" || !b64) throw new PhotoError("Choose a picture.");
  // Base64 is four characters for every three bytes.
  if (b64.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 4) {
    throw new PhotoError("That picture is too big. Choose one under 2 MB.");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new PhotoError("That picture could not be read.");
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new PhotoError("That picture could not be read.");
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length > MAX_PHOTO_BYTES)
    throw new PhotoError("That picture is too big. Choose one under 2 MB.");
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new PhotoError("Send the picture as a JPEG.");
  }
  return bytes;
}

/** Base64 of a blob, in chunks so large photos don't overflow the call stack. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
