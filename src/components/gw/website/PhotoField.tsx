// A photo on the campaign's website. The browser shrinks it to at most 1,280
// pixels and saves it as JPEG before sending it, so a 6 MB phone photo becomes
// a few hundred kilobytes: the site has to open over 2G. The server checks
// who is sending it and files it in the campaign's own folder.

import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { mediaUrl } from "@/lib/site/content";
import { blobToBase64 } from "@/lib/site/photo";
import { uploadSitePhoto } from "@/lib/site.functions";

import { siteMediaBase } from "./util";

const MAX_SIDE = 1280;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

async function shrink(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Could not read that picture. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare that picture.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not prepare that picture."))),
      "image/jpeg",
      0.8,
    ),
  );
}

export function PhotoField({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string | null;
  onChange: (path: string | null) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const send = useServerFn(uploadSitePhoto);
  const [busy, setBusy] = useState(false);
  const src = mediaUrl(siteMediaBase(), value);

  async function upload(file: File) {
    if (file.size > MAX_INPUT_BYTES) {
      toast.error("That picture is too big. Choose one under 25 MB.");
      return;
    }
    setBusy(true);
    try {
      const blob = await shrink(file);
      const { path } = await send({ data: { photo: await blobToBase64(blob) } });
      onChange(path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload the picture.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="ws-field">
      <span className="ws-label">{label}</span>
      <div className="ws-photo">
        {src ? <img src={src} alt="" /> : <div className="ws-photo-empty">No photo</div>}
        <div className="ws-photo-actions">
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={disabled || busy}
            onClick={() => input.current?.click()}
          >
            {busy ? "Uploading…" : value ? "Change photo" : "Add a photo"}
          </button>
          {value ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={disabled || busy}
              onClick={() => onChange(null)}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {hint ? <span className="ws-hint">{hint}</span> : null}
    </div>
  );
}
