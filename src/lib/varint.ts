// Unsigned varints (LEB128), as protobuf and PMTiles store whole numbers: seven
// bits a byte, low bits first. Exact up to 2^53, as JavaScript numbers are.

/** Appends n to out. */
export function writeVarint(out: number[], n: number): void {
  let v = n;
  while (v >= 128) {
    out.push((v % 128) | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

/** The varint at at.pos, moving at.pos past it. */
export function readVarint(b: Uint8Array, at: { pos: number }): number {
  let n = 0;
  let scale = 1;
  for (;;) {
    const byte = b[at.pos++];
    if (byte === undefined) throw new Error("A number runs past the end of the data.");
    n += (byte & 127) * scale;
    if (byte < 128) return n;
    scale *= 128;
  }
}
