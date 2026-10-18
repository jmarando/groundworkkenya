// The notes and the registration drive, read once from data/kenya. Kept apart
// from src/lib/outlook-notes.ts because Vite's `?raw` is not understood by the
// tests, which read the same files with `fs`.

import notes from "../../data/kenya/outlook-notes.csv?raw";
import registered from "../../data/kenya/registered-2026.csv?raw";
import { kenya } from "@/lib/kenya-data";
import { parseNotes, parseRegistered } from "@/lib/outlook-notes";

export const outlookNotes = parseNotes(notes);
export const registered2026 = parseRegistered(registered, kenya.counties);
