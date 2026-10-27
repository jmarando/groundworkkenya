// Where the published website is: its address, large and tappable, with the ways to pass it on.
// Without it the address was a grey line under the title, and a published site seemed to vanish.

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { whatsappShare } from "@/lib/site/share";

export function LiveLink({
  url,
  words,
  justPublished,
}: {
  url: string;
  /** The line that goes with the link when it is shared. */
  words: string;
  justPublished: boolean;
}) {
  const shown = url.replace(/^https?:\/\//, "");
  // The phone's own share sheet, where there is one (not on most computers).
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied. Paste it anywhere.");
    } catch {
      window.prompt("Copy the website's address:", url);
    }
  }
  async function share() {
    try {
      await navigator.share({ text: words, url });
    } catch {
      /* closed without sharing */
    }
  }

  return (
    <div className="card ws-live" role="region" aria-label="Your website's address">
      <span className="eyebrow">
        {justPublished ? "Published. Your website is live at" : "Your website is live at"}
      </span>
      <a className="ws-live-url" href={url} target="_blank" rel="noreferrer">
        {shown}
      </a>
      <p className="meta">
        Anyone with this address can open it. Send it to your WhatsApp groups and put it on posters
        and your social pages.
      </p>
      <div className="ws-live-actions">
        <a className="btn btn--primary btn--sm" href={url} target="_blank" rel="noreferrer">
          Open the website
        </a>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void copy()}>
          Copy the address
        </button>
        <a
          className="btn btn--ghost btn--sm"
          href={whatsappShare(words)}
          target="_blank"
          rel="noreferrer"
        >
          Share on WhatsApp
        </a>
        {canShare ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void share()}>
            Share another way
          </button>
        ) : null}
      </div>
    </div>
  );
}
