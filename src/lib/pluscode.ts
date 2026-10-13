// Plus codes (Open Location Code, https://github.com/google/open-location-code):
// each house in the house files is named by the plus code of its centre, which
// also says where it is, to about 3 metres. Pure.

import type { LngLat } from "@/lib/geo";

const DIGITS = "23456789CFGHJMPQRVWX";

/** A full plus code as Open Buildings gives each house: 8 digits, "+", then 2 to 7. */
export const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,7}$/;

/** The centre of the area a full plus code names; null if it isn't one. */
export function plusCodeCentre(code: string): LngLat | null {
  const c = code.trim().toUpperCase();
  if (!PLUS_CODE.test(c)) return null;
  const d = c.replace("+", "");
  // Five pairs of latitude and longitude digits, each 20 times finer than the last.
  let lat = -90;
  let lng = -180;
  let res = 20;
  for (let i = 0; i < 10; i += 2) {
    lat += DIGITS.indexOf(d[i]!) * res;
    lng += DIGITS.indexOf(d[i + 1]!) * res;
    if (i < 8) res /= 20;
  }
  // Then a 5-row, 4-column grid per digit.
  let latRes = res;
  let lngRes = res;
  for (const ch of d.slice(10)) {
    latRes /= 5;
    lngRes /= 4;
    const v = DIGITS.indexOf(ch);
    lat += Math.floor(v / 4) * latRes;
    lng += (v % 4) * lngRes;
  }
  return [lng + lngRes / 2, lat + latRes / 2];
}
