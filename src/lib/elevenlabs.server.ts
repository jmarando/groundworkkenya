// ElevenLabs: the candidate's voice, cloned from recordings they gave with their consent, and
// scripts spoken in it for auto-calls. The key is ELEVENLABS_API_KEY (never sent to the browser).
// ELEVENLABS_MODEL picks the speech model; Kiswahili scripts use eleven_v3, which speaks it.

const BASE = "https://api.elevenlabs.io/v1";

export const elevenConfigured = () => Boolean(process.env["ELEVENLABS_API_KEY"]);

const key = () => {
  const k = process.env["ELEVENLABS_API_KEY"];
  if (!k) throw new Error("The voice service isn't connected yet (ElevenLabs key).");
  return k;
};

async function failure(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text) as { detail?: { message?: string } | string };
    const m = typeof j.detail === "string" ? j.detail : j.detail?.message;
    if (m) return m.slice(0, 200);
  } catch {
    /* not json */
  }
  return `ElevenLabs answered ${res.status}.`;
}

/** A new cloned voice from the recordings; its id. */
export async function cloneVoice(
  name: string,
  files: { name: string; type: string; bytes: Uint8Array }[],
): Promise<string> {
  const form = new FormData();
  form.append("name", name.slice(0, 100));
  form.append("description", "Cloned for the campaign's own recorded calls, with consent.");
  form.append("remove_background_noise", "true");
  for (const f of files)
    form.append("files", new Blob([f.bytes as BlobPart], { type: f.type }), f.name);
  const res = await fetch(`${BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": key() },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`The voice couldn't be made: ${await failure(res)}`);
  const id = ((await res.json()) as { voice_id?: string }).voice_id;
  if (!id || !/^[A-Za-z0-9]{8,64}$/.test(id)) throw new Error("ElevenLabs gave no voice id.");
  return id;
}

/** The voice removed from ElevenLabs (when the campaign deletes it). */
export async function deleteVoice(voiceId: string): Promise<void> {
  await fetch(`${BASE}/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { "xi-api-key": key() },
    signal: AbortSignal.timeout(30_000),
  }).catch(() => undefined);
}

/** The script spoken in the voice, as MP3. */
export async function speak(
  voiceId: string,
  text: string,
  language: "en" | "sw",
): Promise<Uint8Array> {
  const model =
    language === "sw" ? "eleven_v3" : (process.env["ELEVENLABS_MODEL"] ?? "eleven_multilingual_v2");
  const res = await fetch(
    `${BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.2 },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );
  if (!res.ok) throw new Error(`The audio couldn't be made: ${await failure(res)}`);
  return new Uint8Array(await res.arrayBuffer());
}
