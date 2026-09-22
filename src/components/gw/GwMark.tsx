export function GwMark({ className = "gw-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M86 28V14H14V86H86V52H62"
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
      />
      <rect x="40" y="45.5" width="13" height="13" fill="var(--gw-accent)" />
    </svg>
  );
}
