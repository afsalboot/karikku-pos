"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import { syncEssentialOfflineData } from "@/lib/offline/cache-manager";
import { syncPendingRecords } from "@/lib/offline/sync-manager";

export default function NetworkStatus() {
  const [state, setState] = useState({ online: true, pending: 0, syncing: false });

  useEffect(() => {
    let active = true;
    const update = async ({ synchronize = false } = {}) => {
      const online = navigator.onLine;
      if (synchronize && online) {
        if (active) setState((current) => ({ ...current, online, syncing: true }));
        await Promise.allSettled([syncEssentialOfflineData(), syncPendingRecords()]);
      }
      const pending = await offlineDb.pendingSync.count();
      if (active) setState({ online, pending, syncing: false });
    };
    const online = () => update({ synchronize: true });
    const offline = () => update();
    const interval = window.setInterval(() => {
      if (!document.hidden) update({ synchronize: true });
    }, 30000);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    update({ synchronize: true });
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const label = !state.online
    ? state.pending ? `${state.pending} change${state.pending === 1 ? "" : "s"} saved locally` : "Offline"
    : state.syncing
      ? "Syncing…"
      : state.pending
        ? `${state.pending} waiting to sync`
        : "Synced";
  const Icon = !state.online ? CloudOff : state.syncing ? RefreshCw : Cloud;
  return <span className={`network-status ${!state.online ? "offline" : state.pending ? "pending" : "online"}`} title={label}><Icon size={15} className={state.syncing ? "network-status-spin" : ""} />{label}</span>;
}
