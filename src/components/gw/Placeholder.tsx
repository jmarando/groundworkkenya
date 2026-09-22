export function Placeholder({
  eyebrow,
  title,
  serif,
  meta,
  note,
}: {
  eyebrow: string;
  title: string;
  serif: string;
  meta: string;
  note: string;
}) {
  return (
    <section className="view active" aria-label={title}>
      <div className="vh fx">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>
            {title} <span className="serif">{serif}</span>
          </h1>
          <p className="meta">{meta}</p>
        </div>
        <div className="vh-side">
          <span className="chip">
            <b className="stat">Next</b>&nbsp;in the migration
          </span>
        </div>
      </div>
      <div className="card fx2">
        <div className="card-head">
          <h2>Being rebuilt on live data</h2>
          <span className="mono">port in progress</span>
        </div>
        <p className="f-note">{note}</p>
      </div>
    </section>
  );
}
