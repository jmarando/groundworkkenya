// The map's static JSON files in public (ward shapes, house counts). They
// don't change while the app is open, so callers keep them (staleTime: Infinity).

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return (await res.json()) as T;
}
