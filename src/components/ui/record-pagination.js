export default function RecordPagination({
  data,
  page,
  setPage,
  limit,
  setLimit,
  label = "records",
  loading = false,
}) {
  const count = Math.max(1, data?.pages || 1);
  const pages = [...new Set([1, page - 1, page, page + 1, count])]
    .filter((p) => p > 0 && p <= count)
    .sort((a, b) => a - b);
  return (
    <footer className="product-pagination">
      <span>
        {data
          ? `Showing ${data.items.length ? (page - 1) * limit + 1 : 0}–${data.items.length ? (page - 1) * limit + data.items.length : 0} of ${data.total} ${label}`
          : "Loading…"}
      </span>
      <div>
        {setLimit && (
          <select
            aria-label={`${label} per page`}
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        )}
        <button
          className="button secondary"
          disabled={loading || page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        {pages.map((p, i) => (
          <span className="product-page-number" key={p}>
            {i > 0 && p > pages[i - 1] + 1 && <span>…</span>}
            <button
              className={`button ${p === page ? "primary" : "secondary"}`}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              disabled={loading}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          </span>
        ))}
        <button
          className="button secondary"
          disabled={loading || page >= count}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </footer>
  );
}
