// The house layer of the map's tiles: each house's outline and plus code, at
// zoom 16 only, as Mapbox Vector Tiles
// (https://github.com/mapbox/vector-tile-spec/tree/master/2.1), 1,024 units
// across. The house script writes them; MapLibre draws them, stretching the
// zoom-16 tiles up to 20; and the field app reads the tiles around a phone to
// find the house it is at. A house that crosses a tile edge is written whole
// into each tile it touches, and each tile draws only its own part. Pure.

import { ringAreaM2, ringCentre, type Box, type Building, type LngLat, type Ring } from "@/lib/geo";
import { readVarint, writeVarint } from "@/lib/varint";

export const HOUSE_ZOOM = 16;
export const EXTENT = 1024;
export const LAYER = "buildings";

const WORLD = 2 ** HOUSE_ZOOM;
const RAD = Math.PI / 180;
const POLYGON = 3;
const MOVE_TO = 1;
const LINE_TO = 2;
const CLOSE_PATH = 7;
const UTF8_OUT = new TextEncoder();
const UTF8_IN = new TextDecoder();

/** A point on the zoom-16 grid, in tiles: 0 to 65,536 across, y down. */
export type TilePoint = [number, number];

export function toTileSpace([lng, lat]: LngLat): TilePoint {
  const s = Math.sin(lat * RAD);
  return [((lng + 180) / 360) * WORLD, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD];
}

export function fromTileSpace([x, y]: TilePoint): LngLat {
  const n = Math.PI - (2 * Math.PI * y) / WORLD;
  return [(x / WORLD) * 360 - 180, Math.atan(Math.sinh(n)) / RAD];
}

/** A house as the tiles keep it: whole grid units (EXTENT to a tile), rings not closed. */
export type TileHouse = { pc: string; rings: [number, number][][] };

/** Twice the signed area: positive when the ring turns clockwise on screen (y down). */
function area2(r: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += r[j]![0] * r[i]![1] - r[i]![0] * r[j]![1];
  return a;
}

/** A house's GeoJSON rings on the tile grid; null when nothing of its outline is left at this scale. */
export function toTileHouse(pc: string, rings: Ring[]): TileHouse | null {
  const out: [number, number][][] = [];
  for (const [i, ring] of rings.entries()) {
    const pts: [number, number][] = [];
    for (const p of ring) {
      const [x, y] = toTileSpace(p);
      const q: [number, number] = [Math.round(x * EXTENT), Math.round(y * EXTENT)];
      const last = pts[pts.length - 1];
      if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
    }
    // GeoJSON repeats the first point at the end; the tile format closes rings itself.
    const first = pts[0];
    const end = pts[pts.length - 1];
    if (pts.length > 1 && first && end && first[0] === end[0] && first[1] === end[1]) pts.pop();
    if (pts.length >= 3 && area2(pts) !== 0) out.push(pts);
    else if (i === 0) return null;
  }
  return out.length ? { pc, rings: out } : null;
}

/** The zoom-16 tiles a house touches. */
export function tilesOf(h: TileHouse): { x: number; y: number }[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of h.rings[0] ?? []) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const out: { x: number; y: number }[] = [];
  for (let x = Math.floor(minX / EXTENT); x <= Math.floor(maxX / EXTENT); x++)
    for (let y = Math.floor(minY / EXTENT); y <= Math.floor(maxY / EXTENT); y++) out.push({ x, y });
  return out;
}

/** Just enough protobuf to write a vector tile. */
class Writer {
  private bytes: number[] = [];

  varint(field: number, n: number): this {
    writeVarint(this.bytes, field * 8);
    writeVarint(this.bytes, n);
    return this;
  }

  message(field: number, body: Uint8Array): this {
    writeVarint(this.bytes, field * 8 + 2);
    writeVarint(this.bytes, body.length);
    for (const b of body) this.bytes.push(b);
    return this;
  }

  text(field: number, s: string): this {
    return this.message(field, UTF8_OUT.encode(s));
  }

  packed(field: number, ns: number[]): this {
    const body: number[] = [];
    for (const n of ns) writeVarint(body, n);
    return this.message(field, Uint8Array.from(body));
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

const command = (id: number, count: number) => (id & 7) | (count << 3);
const zigzag = (n: number) => (n << 1) ^ (n >> 31);
const unzigzag = (n: number) => (n >>> 1) ^ -(n & 1);

/** Drawing commands for a house in the tile whose corner is (ox, oy) on the grid. */
function geometry(h: TileHouse, ox: number, oy: number): number[] {
  const out: number[] = [];
  let cx = 0;
  let cy = 0;
  h.rings.forEach((ring, i) => {
    // The outline turns clockwise on screen, its holes the other way.
    const pts = area2(ring) > 0 === (i === 0) ? ring : [...ring].reverse();
    pts.forEach(([gx, gy], k) => {
      if (k === 0) out.push(command(MOVE_TO, 1));
      if (k === 1) out.push(command(LINE_TO, pts.length - 1));
      out.push(zigzag(gx - ox - cx), zigzag(gy - oy - cy));
      cx = gx - ox;
      cy = gy - oy;
    });
    out.push(command(CLOSE_PATH, 1));
  });
  return out;
}

/** One tile of houses, as a vector tile with one layer, "buildings". */
export function encodeTile(x: number, y: number, houses: TileHouse[]): Uint8Array {
  const layer = new Writer().varint(15, 2).text(1, LAYER);
  houses.forEach((h, i) => {
    layer.message(
      2,
      new Writer()
        .packed(2, [0, i])
        .varint(3, POLYGON)
        .packed(4, geometry(h, x * EXTENT, y * EXTENT))
        .finish(),
    );
  });
  layer.text(3, "pc");
  for (const h of houses) layer.message(4, new Writer().text(1, h.pc).finish());
  layer.varint(5, EXTENT);
  return new Writer().message(3, layer.finish()).finish();
}

/** Just enough protobuf to read one back. */
class Reader {
  private readonly b: Uint8Array;
  private readonly at = { pos: 0 };

  constructor(b: Uint8Array) {
    this.b = b;
  }

  get more(): boolean {
    return this.at.pos < this.b.length;
  }

  varint(): number {
    return readVarint(this.b, this.at);
  }

  key(): { field: number; wire: number } {
    const k = this.varint();
    return { field: Math.floor(k / 8), wire: k % 8 };
  }

  bytes(): Uint8Array {
    const n = this.varint();
    const s = this.b.subarray(this.at.pos, this.at.pos + n);
    this.at.pos += n;
    return s;
  }

  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 2) {
      const n = this.varint();
      this.at.pos += n;
    } else if (wire === 1) this.at.pos += 8;
    else if (wire === 5) this.at.pos += 4;
    else throw new Error(`Not a vector tile (wire type ${wire}).`);
  }
}

function packed(b: Uint8Array): number[] {
  const r = new Reader(b);
  const out: number[] = [];
  while (r.more) out.push(r.varint());
  return out;
}

type RawFeature = { tags: number[]; type: number; geometry: number[] };
type RawLayer = {
  name: string;
  extent: number;
  keys: string[];
  values: (string | null)[];
  features: RawFeature[];
};

function readFeature(b: Uint8Array): RawFeature {
  const r = new Reader(b);
  const f: RawFeature = { tags: [], type: 0, geometry: [] };
  while (r.more) {
    const { field, wire } = r.key();
    if (field === 2 && wire === 2) f.tags = packed(r.bytes());
    else if (field === 3 && wire === 0) f.type = r.varint();
    else if (field === 4 && wire === 2) f.geometry = packed(r.bytes());
    else r.skip(wire);
  }
  return f;
}

/** A Value's string; null for numbers and the rest. */
function readText(b: Uint8Array): string | null {
  const r = new Reader(b);
  let s: string | null = null;
  while (r.more) {
    const { field, wire } = r.key();
    if (field === 1 && wire === 2) s = UTF8_IN.decode(r.bytes());
    else r.skip(wire);
  }
  return s;
}

function readLayer(b: Uint8Array): RawLayer {
  const r = new Reader(b);
  const layer: RawLayer = { name: "", extent: 4096, keys: [], values: [], features: [] };
  while (r.more) {
    const { field, wire } = r.key();
    if (field === 1 && wire === 2) layer.name = UTF8_IN.decode(r.bytes());
    else if (field === 2 && wire === 2) layer.features.push(readFeature(r.bytes()));
    else if (field === 3 && wire === 2) layer.keys.push(UTF8_IN.decode(r.bytes()));
    else if (field === 4 && wire === 2) layer.values.push(readText(r.bytes()));
    else if (field === 5 && wire === 0) layer.extent = r.varint();
    else r.skip(wire);
  }
  return layer;
}

/** Drawing commands back to rings, in the tile's own units. */
function ringsOf(g: number[]): [number, number][][] {
  const rings: [number, number][][] = [];
  let ring: [number, number][] = [];
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < g.length) {
    const c = g[i++]!;
    const id = c & 7;
    if (id === CLOSE_PATH) {
      if (ring.length >= 3) rings.push(ring);
      ring = [];
      continue;
    }
    for (let k = 0; k < c >> 3; k++) {
      if (i + 1 >= g.length) return rings;
      x += unzigzag(g[i++]!);
      y += unzigzag(g[i++]!);
      if (id === MOVE_TO) ring = [[x, y]];
      else ring.push([x, y]);
    }
  }
  return rings;
}

const closed = (r: LngLat[]): LngLat[] => (r.length ? [...r, r[0]!] : r);

function layerHouses(layer: RawLayer, x: number, y: number): Building[] {
  const pcKey = layer.keys.indexOf("pc");
  const out: Building[] = [];
  for (const f of layer.features) {
    if (f.type !== POLYGON) continue;
    let pc: string | null = null;
    for (let i = 0; i + 1 < f.tags.length; i += 2)
      if (f.tags[i] === pcKey) pc = layer.values[f.tags[i + 1]!] ?? null;
    const local = ringsOf(f.geometry);
    const first = local[0];
    if (!pc || !first) continue;
    // The first ring's turn marks an outline; rings turning the other way are its holes.
    const outward = area2(first) > 0;
    const rings = [first];
    for (const r of local.slice(1)) {
      if (area2(r) > 0 === outward) break; // a second outline: a house here is one outline
      rings.push(r);
    }
    const geo = rings.map((r) =>
      closed(r.map(([lx, ly]) => fromTileSpace([x + lx / layer.extent, y + ly / layer.extent]))),
    );
    const outline = geo[0]!;
    const holes = geo.slice(1).reduce((s, h) => s + ringAreaM2(h), 0);
    out.push({
      id: pc,
      rings: geo,
      centre: ringCentre(outline),
      area: Math.round(ringAreaM2(outline) - holes),
    });
  }
  return out;
}

/** The houses in one zoom-16 tile, as outlines with their plus codes. */
export function decodeTile(x: number, y: number, bytes: Uint8Array): Building[] {
  const tile = new Reader(bytes);
  while (tile.more) {
    const { field, wire } = tile.key();
    if (field === 3 && wire === 2) {
      const layer = readLayer(tile.bytes());
      if (layer.name === LAYER) return layerHouses(layer, x, y);
    } else tile.skip(wire);
  }
  return [];
}

/** The zoom-16 tiles that cover a box, west to east, each from north to south. */
export function tilesCovering(box: Box): { x: number; y: number }[] {
  const [x0, y0] = toTileSpace([box.west, box.north]);
  const [x1, y1] = toTileSpace([box.east, box.south]);
  const out: { x: number; y: number }[] = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++)
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++) out.push({ x, y });
  return out;
}

/** The zoom-16 tiles within radiusM of a point. */
export function tilesAround(p: LngLat, radiusM: number): { x: number; y: number }[] {
  const dLat = radiusM / 111_320;
  const dLng = dLat / Math.max(Math.cos(p[1] * RAD), 0.01);
  return tilesCovering({
    west: p[0] - dLng,
    south: p[1] - dLat,
    east: p[0] + dLng,
    north: p[1] + dLat,
  });
}

/** Houses from several tiles, each once: a house on a tile edge is in both. */
export function mergeHouses(lists: Building[][]): Building[] {
  const seen = new Map<string, Building>();
  for (const list of lists) for (const b of list) if (!seen.has(b.id)) seen.set(b.id, b);
  return [...seen.values()];
}
