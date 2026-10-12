import { RACE_NAMES, share1, votes, whole, type ResultBlock } from "@/lib/atlas-view";

/** One race in one year: each candidate's votes and share, and where the figures came from. */
export function ResultList({ block, caption }: { block: ResultBlock; caption?: string }) {
  const top = Math.max(...block.rows.map((r) => r.votes), 1);
  return (
    <div className="el-result">
      <p className="el-result-h">
        <b>
          {RACE_NAMES[block.race]} · {block.year}
        </b>
        {caption ? <span className="dim"> · {caption}</span> : null}
      </p>
      <ul className="mb-results">
        {block.rows.map((r) => (
          <li key={r.name}>
            <span className="mb-results-n">
              {r.name}
              <span className="dim"> · {r.party ?? r.bloc}</span>
            </span>
            <span className="mb-results-bar" aria-hidden="true">
              <i style={{ width: `${(r.votes / top) * 100}%` }} />
            </span>
            <b>{votes(r.votes)}</b>
            <small className="dim">{share1(r.share)}</small>
          </li>
        ))}
      </ul>
      <p className="el-src">
        {block.tag ?? "Source not recorded"}
        {block.listedOnly ? " · shares of the candidates listed" : ""}
        {block.turnout !== null ? ` · turnout ${whole(block.turnout)}` : ""}
        {block.source?.url ? (
          <>
            {" · "}
            <a href={block.source.url} target="_blank" rel="noreferrer">
              the document
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}
