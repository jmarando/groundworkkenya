// What a page shows while its data loads, or when the read failed: a line saying so, and a way to
// try again, instead of zeros and empty lists that look like real answers.

export function QueryState({
  isLoading,
  isError,
  retry,
  what,
}: {
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
  what: string;
}) {
  if (isError) {
    return (
      <div className="card note--flag" role="alert" style={{ marginTop: 12 }}>
        <p className="f-note">
          Couldn&apos;t load {what}. Check the connection and{" "}
          <button type="button" className="btn btn--ghost btn--sm" onClick={retry}>
            try again
          </button>
        </p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <p className="f-note" aria-live="polite" style={{ marginTop: 12 }}>
        Loading {what}…
      </p>
    );
  }
  return null;
}
