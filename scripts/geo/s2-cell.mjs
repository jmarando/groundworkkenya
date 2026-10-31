// Which Google Open Buildings v3 S2 level-4 cell holds a point? Usage: node s2token.mjs lat lng [level]
// Checked against the repo's README: Nairobi and Nyeri are cell 183.
const POS_TO_IJ = [
  [0, 1, 3, 2],
  [0, 2, 3, 1],
  [3, 2, 0, 1],
  [3, 1, 0, 2],
];
const POS_TO_ORIENT = [1, 0, 0, 3];

export function s2Token(latDeg, lngDeg, level = 4) {
  const lat = (latDeg * Math.PI) / 180;
  const lng = (lngDeg * Math.PI) / 180;
  const x = Math.cos(lat) * Math.cos(lng);
  const y = Math.cos(lat) * Math.sin(lng);
  const z = Math.sin(lat);
  const ax = Math.abs(x),
    ay = Math.abs(y),
    az = Math.abs(z);
  const face = ax >= ay && ax >= az ? (x > 0 ? 0 : 3) : ay >= az ? (y > 0 ? 1 : 4) : z > 0 ? 2 : 5;
  let u, v;
  switch (face) {
    case 0:
      u = y / x;
      v = z / x;
      break;
    case 1:
      u = -x / y;
      v = z / y;
      break;
    case 2:
      u = -x / z;
      v = -y / z;
      break;
    case 3:
      u = z / x;
      v = y / x;
      break;
    case 4:
      u = z / y;
      v = -x / y;
      break;
    default:
      u = -y / z;
      v = -x / z;
      break;
  }
  const st = (a) => (a >= 0 ? 0.5 * Math.sqrt(1 + 3 * a) : 1 - 0.5 * Math.sqrt(1 - 3 * a));
  const MAX = 2 ** 30;
  const i = Math.min(MAX - 1, Math.max(0, Math.floor(st(u) * MAX)));
  const j = Math.min(MAX - 1, Math.max(0, Math.floor(st(v) * MAX)));
  let orient = face & 1;
  let pos = 0n;
  for (let k = 1; k <= level; k++) {
    const ij = (((i >> (30 - k)) & 1) << 1) | ((j >> (30 - k)) & 1);
    const p = POS_TO_IJ[orient].indexOf(ij);
    pos = (pos << 2n) | BigInt(p);
    orient ^= POS_TO_ORIENT[p];
  }
  const id =
    (BigInt(face) << 61n) | (pos << BigInt(61 - 2 * level)) | (1n << BigInt(60 - 2 * level));
  return id.toString(16).padStart(16, "0").replace(/0+$/, "");
}

if (process.argv[1] && process.argv[1].endsWith("s2token.mjs")) {
  const [lat, lng, level] = process.argv.slice(2).map(Number);
  console.log(s2Token(lat, lng, level || 4));
}
