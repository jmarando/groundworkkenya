// Small pieces of the Website editor: a field that edits one language of a
// two-language value, section cards with an on/off switch, and the controls
// for moving and removing list items.

import type { ReactNode } from "react";

import type { Bi, Lang } from "@/lib/site/content";

import { LANG_NAME } from "./util";

export function BiField({
  label,
  value,
  lang,
  onChange,
  max,
  multiline = false,
  rows = 4,
  placeholder,
  hint,
  disabled,
}: {
  label: string;
  value: Bi;
  lang: Lang;
  onChange: (v: Bi) => void;
  max: number;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const other: Lang = lang === "en" ? "sw" : "en";
  const text = value[lang];
  const common = {
    value: text,
    maxLength: max,
    disabled,
    placeholder: value[other] || placeholder,
    onChange: (e: { target: { value: string } }) => onChange({ ...value, [lang]: e.target.value }),
  };
  return (
    <label className="ws-field">
      <span className="ws-label">
        {label} <span className="ws-lang">{LANG_NAME[lang]}</span>
      </span>
      {multiline ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />}
      {!text.trim() && value[other].trim() ? (
        <span className="ws-hint">
          Not in {LANG_NAME[lang]} yet, so visitors reading {LANG_NAME[lang]} see the{" "}
          {LANG_NAME[other]}.
        </span>
      ) : hint ? (
        <span className="ws-hint">{hint}</span>
      ) : null}
      {text.length > max * 0.85 ? (
        <span className="ws-count">
          {text.length} / {max}
        </span>
      ) : null}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  max = 200,
  placeholder,
  warn,
  hint,
  disabled,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "tel" | "email" | "url" | "date" | "time";
  max?: number;
  placeholder?: string;
  /** Shown when the value will not be kept as typed. */
  warn?: string | null;
  hint?: string;
  disabled?: boolean;
  inputMode?: "numeric" | "tel" | "email" | "url";
}) {
  return (
    <label className="ws-field">
      <span className="ws-label">{label}</span>
      <input
        type={type}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        aria-invalid={warn ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {warn ? (
        <span className="ws-hint ws-warn">{warn}</span>
      ) : hint ? (
        <span className="ws-hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function SectionCard({
  title,
  hint,
  on,
  onToggle,
  disabled,
  children,
}: {
  title: string;
  hint?: ReactNode;
  on?: boolean;
  onToggle?: (on: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const hidden = on === false;
  return (
    <section className={`card ws-card${hidden ? " is-off" : ""}`} aria-label={title}>
      <div className="ws-card-head">
        <div>
          <h2>{title}</h2>
          {hint ? <p className="ws-card-hint">{hint}</p> : null}
        </div>
        {onToggle ? (
          <label className="ws-switch">
            <input
              type="checkbox"
              role="switch"
              checked={Boolean(on)}
              disabled={disabled}
              onChange={(e) => onToggle(e.target.checked)}
            />
            <span className="ws-switch-track" aria-hidden="true" />
            <span>{on ? "On the site" : "Hidden"}</span>
          </label>
        ) : null}
      </div>
      {hidden ? null : <div className="ws-card-body">{children}</div>}
    </section>
  );
}

/** Up, down and remove for one item in a list. */
export function ItemTools({
  index,
  count,
  onMove,
  onRemove,
  what,
  disabled,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  what: string;
  disabled?: boolean;
}) {
  return (
    <div className="ws-tools">
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        aria-label={`Move ${what} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        aria-label={`Move ${what} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={disabled}
        onClick={() => onRemove(index)}
      >
        Remove {what}
      </button>
    </div>
  );
}
