import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import type { Action, NewsTag, WatchItem } from "@/lib/demo/types";

/** One tap from the briefing to doing something: a poll, a draft, a screen, a task. */
export function ActionButton({ action, quiet = false }: { action: Action; quiet?: boolean }) {
  const [drafting, setDrafting] = useState(false);
  const cls = `btn btn--sm ${quiet ? "btn--ghost" : "btn--primary"}`;

  if (action.kind === "poll") {
    return (
      <Link to="/polling" search={{ ask: action.ask }} className={cls}>
        {action.label}
      </Link>
    );
  }
  if (action.kind === "go") {
    return (
      <Link to={action.to} className={cls}>
        {action.label}
      </Link>
    );
  }
  if (action.kind === "task") {
    return (
      <button
        type="button"
        className={cls}
        onClick={() =>
          toast.success("Added to today's list", {
            description: `${action.task}. In the demo, tasks aren't saved.`,
          })
        }
      >
        {action.label}
      </button>
    );
  }
  return (
    <>
      <button type="button" className={cls} onClick={() => setDrafting(true)}>
        {action.label}
      </button>
      {drafting && (
        <DraftDialog title={action.title} body={action.body} onClose={() => setDrafting(false)} />
      )}
    </>
  );
}

/** A drafted statement to edit and copy. Nothing is sent from here. */
function DraftDialog({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(body);
  const id = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied. Paste it wherever it's going.");
    } catch {
      toast.error("This browser wouldn't copy. Select the text and copy it by hand.");
    }
  };

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="pb mb-draft">
        <div className="pb-head">
          <div>
            <span className="eyebrow">Draft for review</span>
            <h2 id={id}>{title}</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pb-body">
          <label className="pb-field">
            <span>Edit before it goes anywhere</span>
            <textarea value={text} rows={9} onChange={(e) => setText(e.target.value)} />
          </label>
          <p className="f-note">
            Drafted from this morning's briefing. A person reviews every public statement before
            it's sent.
          </p>
        </div>
        <div className="pb-foot">
          <span className="f-note">{text.split(/\s+/).filter(Boolean).length} words</span>
          <button className="btn btn--primary" type="button" onClick={() => void copy()}>
            Copy text
          </button>
        </div>
      </div>
    </div>
  );
}

export function Tag({ tag }: { tag: NewsTag }) {
  return <span className={`mb-tag mb-tag--${tag.toLowerCase()}`}>{tag}</span>;
}

/** A week-on-week change: arrow plus number, never colour alone. */
export function Delta({
  value,
  unit = "",
  neutral = false,
}: {
  value: number;
  unit?: string;
  /** For changes that are neither good nor bad for us, like an issue getting louder. */
  neutral?: boolean;
}) {
  if (value === 0) return <span className="mb-delta">no change</span>;
  const up = value > 0;
  const tone = neutral ? "" : up ? " is-good" : " is-bad";
  return (
    <span className={`mb-delta${tone}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr">{up ? "up" : "down"}</span> {Math.abs(value)}
      {unit}
    </span>
  );
}

const LEVEL = {
  high: { glyph: "●", text: "High" },
  medium: { glyph: "◐", text: "Medium" },
  low: { glyph: "○", text: "Low" },
} as const;

export function Level({ level }: { level: WatchItem["level"] }) {
  return (
    <span className={`mb-level mb-level--${level}`}>
      <span aria-hidden="true">{LEVEL[level].glyph}</span> {LEVEL[level].text}
    </span>
  );
}
