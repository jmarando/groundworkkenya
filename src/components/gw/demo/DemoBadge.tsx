/** Always on screen while demo figures are showing. */
export function DemoBadge({ fictional }: { fictional?: boolean }) {
  return (
    <span className="demo-badge">
      <span aria-hidden="true">◆</span> Demo data{fictional ? " · fictional candidate" : ""}
    </span>
  );
}
