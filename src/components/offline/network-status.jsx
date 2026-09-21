"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import { syncEssentialOfflineData } from "@/lib/offline/cache-manager";
import { syncPendingRecords } from "@/lib/offline/sync-manager";

export default function NetworkStatus() {
  const [state, setState] = useState({
    online: true,
    pending: 0,
    syncing: false,
    error: false,
  });

  useEffect(() => {
    let active = true;
    let sequence = 0;
    const update = async ({ synchronize = false } = {}) => {
      const current = ++sequence;
      const online = navigator.onLine;
      if (active)
        setState((previous) => ({
          ...previous,
          online,
          syncing: synchronize && online,
        }));
      let pending = 0;
      let error = false;
      try {
        if (synchronize && online) {
          const [cache, queue] = await Promise.allSettled([
            syncEssentialOfflineData(),
            syncPendingRecords(),
          ]);
          error =
            cache.status === "rejected" ||
            queue.status === "rejected" ||
            (cache.status === "fulfilled" &&
              Object.values(cache.value).some(
                (result) => result.status === "rejected",
              ));
        }
        pending = await offlineDb.pendingSync.count();
      } catch {
        error = true;
      }
      if (active && current === sequence)
        setState({ online, pending, syncing: false, error });
    };
    const online = () => update({ synchronize: true });
    const offline = () => update();
    const interval = window.setInterval(() => {
      if (!document.hidden) update({ synchronize: true });
    }, 30000);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const initial = window.setTimeout(online, 0);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const label = !state.online
    ? "Offline"
    : state.error
      ? "Refresh failed"
      : state.syncing
        ? "Refreshing…"
        : state.pending
          ? `${state.pending} waiting to sync`
          : "Online";
  const description = !state.online
    ? "Keep this tab open to retain unfinished work. Reconnect before saving a sale."
    : state.error
      ? "Cached data could not refresh. Check your connection and retry the failed action."
      : "Browser connectivity is available. Each save still requires server confirmation.";
  const Icon = !state.online ? CloudOff : state.syncing ? RefreshCw : Cloud;
  return (
    <div className="connection-status" role="status" aria-live="polite">
      <span
        className={`network-status ${!state.online ? "offline" : state.error || state.pending ? "pending" : "online"}`}
        title={description}
      >
        <Icon
          size={15}
          aria-hidden="true"
          className={state.syncing ? "network-status-spin" : ""}
        />
        {label}
      </span>
      {(!state.online || state.error) && (
        <span className="connection-guidance">{description}</span>
      )}
    </div>
  );
}
