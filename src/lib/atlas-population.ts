// WorldPop's age-and-sex pyramid for a ward turned into the atlas's three
// numbers, and a ward's outline shrunk enough to send to WorldPop. Pure.

export type PyramidBand = { age: string; male: number; female: number };

/** The first age in a band's label: "15 to 19", "15-19", "80+" and "0" all work. */
export function bandStart(age: string): number | null {
  const m = String(age).match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Total, adults (18+) and young adults (18–34), each band's people spread evenly over its ages. */
export function fromPyramid(bands: PyramidBand[]): {
  total: number;
  adults: number;
  young_adults: number;
} {
  const rows = bands
    .map((b) => ({
      start: bandStart(b.age),
      people: (Number(b.male) || 0) + (Number(b.female) || 0),
    }))
    .filter((b): b is { start: number; people: number } => b.start !== null)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let adults = 0;
  let young = 0;
  rows.forEach((b, i) => {
    const end = rows[i + 1]?.start ?? Infinity;
    // The share of this band's ages that fall in [lo, hi); the oldest band is open-ended.
    const within = (lo: number, hi: number) =>
      end === Infinity
        ? b.start >= lo && b.start < hi
          ? 1
          : 0
        : Math.max(0, Math.min(end, hi) - Math.max(b.start, lo)) / (end - b.start);
    total += b.people;
    adults += b.people * within(18, Infinity);
    young += b.people * within(18, 35);
  });
  return { total: Math.round(total), adults: Math.round(adults), young_adults: Math.round(young) };
}

type Pt = [number, number];

function distance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker on a closed ring, keeping its ends; never fewer than four points. */
export function simplifyRing(ring: Pt[], tolerance: number): Pt[] {
  if (ring.length <= 4) return ring;
  const keep = ring.map((_, i) => i === 0 || i === ring.length - 1);
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let most = 0;
    for (let i = a + 1; i < b; i++) {
      const d = distance(ring[i]!, ring[a]!, ring[b]!);
      if (d > most) {
        most = d;
        far = i;
      }
    }
    if (far !== -1 && most > tolerance) {
      keep[far] = true;
      stack.push([a, far], [far, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

export type Outline =
  { type: "Polygon"; coordinates: Pt[][] } | { type: "MultiPolygon"; coordinates: Pt[][][] };

const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

/** A ward's outline with every ring simplified and its coordinates rounded to about a metre. */
export function compactGeometry(g: Outline, tolerance: number): Outline {
  const ring = (r: Pt[]): Pt[] =>
    simplifyRing(r, tolerance).map(([x, y]) => [round5(x), round5(y)]);
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: g.coordinates.map(ring) }
    : { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map(ring)) };
}
