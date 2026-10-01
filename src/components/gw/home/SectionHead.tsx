/** A section's heading. */
export function SectionHead({ id, title }: { id: string; title: string }) {
  return (
    <div className="home-head">
      <h2 id={id}>{title}</h2>
    </div>
  );
}
