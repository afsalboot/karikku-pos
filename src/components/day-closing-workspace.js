"use client";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/hooks/useData";
import { api, formatDate } from "@/lib/client";
import { PageHeading } from "@/components/ui/shared";
import { validSession } from "@/lib/day-closing";
import Modal from "@/components/modal";
import OpenDay from "./day-session-opening";
import MovementModal from "./day-session-movement";
import ClosingFlow from "./day-session-closing";
import SessionHistory from "./day-session-history";
import {
  SessionHeader,
  SessionMetrics,
  PaymentSummary,
  CashMovements,
  NegativeWarning,
  MoneyRows,
  DifferenceBadge,
} from "./day-session-summary";
import "./day-session.css";
export default function DayClosingWorkspace() {
  const result = useData("/day-sessions?limit=1"),
    day = result.data?.current;
  const [pending, setPending] = useState(false),
    [success, setSuccess] = useState(null),
    [movement, setMovement] = useState(false);
  const lock = useRef(false);
  async function open(values) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      await api("/day-sessions", {
        method: "POST",
        body: { action: "open", ...values },
      });
      toast.success("Business day opened");
      result.refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <div className="day-closing-workspace drawer-workspace">
      <PageHeading
        title="Day Closing"
        description="Manage your daily cash drawer"
      >
        <span className={`day-status ${day ? "open" : ""}`}>
          {day ? "● SESSION OPEN" : "NO OPEN SESSION"}
        </span>
      </PageHeading>
      {result.error ? (
        <div className="error-panel">
          <p>{result.error}</p>
          <button className="button secondary" onClick={result.refresh}>
            Try again
          </button>
        </div>
      ) : result.loading ? (
        <p role="status" className="panel">
          Loading session…
        </p>
      ) : day ? (
        <>
          <SessionHeader day={day} />
          {!validSession(day) && (
            <p className="error-panel" role="alert">
              Session data is invalid. Refresh before closing.
            </p>
          )}
          <SessionMetrics day={day} />
          <NegativeWarning day={day} />
          <div className="drawer-columns">
            <ClosingFlow
              key={day._id}
              day={day}
              refreshing={result.refreshing}
              onRefresh={result.refresh}
              onClosed={(closed) => {
                setSuccess(closed);
                result.refresh();
              }}
            />
            <div>
              <PaymentSummary day={day} />
              <section className="panel">
                <button
                  className="button secondary"
                  disabled={result.refreshing}
                  onClick={() => setMovement(true)}
                >
                  <Plus size={16} />
                  Add Cash Movement
                </button>
                <CashMovements movements={day.movements} />
              </section>
            </div>
          </div>
        </>
      ) : (
        <OpenDay
          key={result.data?.previous?._id || "first"}
          previous={result.data?.previous}
          pending={pending || result.refreshing}
          onOpen={open}
        />
      )}
      <SessionHistory version={day?._id || success?._id || "initial"} />
      {movement && day && (
        <MovementModal
          day={day}
          onClose={() => setMovement(false)}
          onSaved={() => {
            setMovement(false);
            result.refresh();
          }}
        />
      )}
      {success && (
        <Modal title="Day Closed Successfully" onClose={() => setSuccess(null)}>
          <div className="modal-body drawer-details">
            <MoneyRows
              rows={[
                ["Expected Cash", success.expectedCash],
                ["Actual Cash", success.actualCash],
                ["Difference", success.difference],
                ["Cash Removed", success.cashRemovedAtClosing],
                ["Closing Float", success.closingFloat],
              ]}
            />
            <DifferenceBadge day={success} />
            <p>Closed by {success.closedBy?.name || "Unknown"}</p>
            <p>Closed at {formatDate(success.closedAt)}</p>
          </div>
          <footer className="modal-footer">
            <button className="button primary" onClick={() => setSuccess(null)}>
              Done
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
