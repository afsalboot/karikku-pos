"use client";
import DayClosingWorkspace from "@/components/day-closing-workspace";
export default function DayWorkspace() {
  return <DayClosingWorkspace />;
/*
  const [page, setPage] = useState(1);
  const result = useData(`/day-sessions?page=${page}`);
  const [pending, setPending] = useState(false);
  const [closeRequest, setCloseRequest] = useState(null);
  const [actual, setActual] = useState("");
  async function send(payload) {
    setPending(true);
    try {
      await api("/day-sessions", { method: "POST", body: payload });
      toast.success(
        payload.action === "open"
          ? "Business day opened"
          : "Business day closed",
      );
      setCloseRequest(null);
      setActual("");
      result.refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPending(false);
    }
  }
  const day = result.data?.current;
  return (
    <>
      <PageHeading
        title="Day Opening & Closing"
        description="Reconcile the cash drawer for each business session."
      />
      <Notice {...result} retry={result.refresh}>
        {result.data && (
          <>
            {day ? (
              <section className="panel day-panel">
                <div className="page-heading">
                  <h2>Open day · {day.businessDate}</h2>
                  <span className="badge active">OPEN</span>
                </div>
                <p className="muted">
                  Opened by {day.openedBy.name} · {formatDate(day.openedAt)}
                </p>
                <div className="stats">
                  <div>
                    <span>Opening cash</span>
                    <strong>{formatCurrency(day.openingCash)}</strong>
                  </div>
                  <div>
                    <span>Cash sales</span>
                    <strong>{formatCurrency(day.cashSales)}</strong>
                  </div>
                  <div>
                    <span>Cash expenses</span>
                    <strong>{formatCurrency(day.cashExpenses)}</strong>
                  </div>
                </div>
                {day.cashRefunds > 0 && (
                  <p>
                    Earlier-session cash reversals:{" "}
                    {formatCurrency(day.cashRefunds)}
                  </p>
                )}
                <div className="closing-grid">
                  <div>
                    <span>Expected cash</span>
                    <h2>{formatCurrency(day.expectedCash)}</h2>
                    <p className="muted">
                      Opening cash + cash sales − cash expenses −
                      earlier-session cash reversals
                    </p>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setCloseRequest({
                        action: "close",
                        sessionId: day._id,
                        actualCash: Number(actual),
                      });
                    }}
                  >
                    <Field
                      label="Actual cash in drawer (₹)"
                      type="number"
                      required
                      min="0"
                      max="1000000"
                      step="0.01"
                      value={actual}
                      onChange={(e) => setActual(e.target.value)}
                    />
                    <p>
                      Difference:{" "}
                      <strong>
                        {actual === ""
                          ? "—"
                          : formatCurrency(Number(actual) - day.expectedCash)}
                      </strong>
                    </p>
                    <button className="button primary" disabled={pending}>
                      Close Day
                    </button>
                  </form>
                </div>
              </section>
            ) : (
              <section className="panel day-panel">
                <h2>Start a business day</h2>
                <p className="muted">
                  Open the cash drawer session before recording sales or
                  expenses.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send({
                      action: "open",
                      openingCash: Number(
                        new FormData(e.currentTarget).get("openingCash"),
                      ),
                    });
                  }}
                >
                  <Field
                    label="Opening cash (₹)"
                    name="openingCash"
                    required
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.01"
                    defaultValue="0"
                  />
                  <button className="button primary" disabled={pending}>
                    {pending ? "Opening…" : "Open Day"}
                  </button>
                </form>
              </section>
            )}
            <section className="panel">
              <h2>Closed sessions</h2>
              {result.data.items.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Business date",
                          "Expected",
                          "Actual",
                          "Difference",
                          "Closed by",
                          "Closed at",
                        ].map((s) => (
                          <th key={s}>{s}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.items.map((d) => (
                        <tr key={d._id}>
                          <td>{d.businessDate}</td>
                          <td>{formatCurrency(d.expectedCash)}</td>
                          <td>{formatCurrency(d.actualCash)}</td>
                          <td>{formatCurrency(d.difference)}</td>
                          <td>{d.closedBy.name}</td>
                          <td>{formatDate(d.closedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState message="No closed sessions yet" />
              )}
              <Pagination data={result.data} page={page} setPage={setPage} />
            </section>
          </>
        )}
      </Notice>
      {closeRequest && (
        <ConfirmModal
          title="Close business day"
          message="Close this session and lock its cash reconciliation? Sales and expenses will require a new open session."
          pending={pending}
          onClose={() => setCloseRequest(null)}
          onConfirm={() => send(closeRequest)}
        />
      )}
    </>
  );
*/}
