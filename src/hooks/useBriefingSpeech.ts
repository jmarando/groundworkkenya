import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { chunkText } from "@/lib/speech/chunk-text";
import { streamSpeech } from "@/lib/speech/stream";

export function useBriefingSpeech() {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const stop = () => {
    controller.current?.abort();
    controller.current = null;
    setState("idle");
  };
  const play = async (text: string) => {
    controller.current?.abort();
    const run = new AbortController();
    controller.current = run;
    setError("");
    setState("loading");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in to listen to your briefing.");
      for (const chunk of chunkText(text, 3500)) {
        run.signal.throwIfAborted();
        await streamSpeech("/api/speech", chunk, data.session.access_token, run.signal, () => {
          if (controller.current === run) setState("playing");
        });
      }
    } catch (e) {
      if (!run.signal.aborted && controller.current === run)
        setError(e instanceof Error ? e.message : "Could not play the briefing.");
    } finally {
      if (controller.current === run) {
        controller.current = null;
        setState("idle");
      }
    }
  };
  return { state, error, play, stop };
}