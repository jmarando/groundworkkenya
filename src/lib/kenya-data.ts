// The 2022 result by county and the regions, read once from data/kenya. Kept
// apart from src/lib/kenya.ts because Vite's `?raw` is not understood by the
// tests, which read the same files with `fs`.

import counties from "../../data/kenya/counties.csv?raw";
import regions from "../../data/kenya/regions.csv?raw";
import { parseKenya } from "@/lib/kenya";

export const kenya = parseKenya(regions, counties);
