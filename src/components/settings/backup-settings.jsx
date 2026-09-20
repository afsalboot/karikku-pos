"use client";
import Select from "@/components/ui/select";
import { useRef, useState } from "react";
import { Download, FolderOpen, CloudUpload, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api, formatDate } from "@/lib/client";
import { useData } from "@/hooks/useData";
import Modal from "@/components/modal";
import { SettingsCard as Card } from "./settings-ui";
import { offlineDb } from "@/lib/offline/db";
import "./backup-settings.css";

const labels = { sales: "Sales & receipts", expenses: "Expenses", customers: "Customers & balances", daysessions: "Day sessions", cashmovements: "Cash movements", loyaltytransactions: "Loyalty transactions" };
export default function BackupSettings() {
  const result = useData("/backups"), config = result.data;
  const [password, setPassword] = useState(""), [repeat, setRepeat] = useState(""), [destination, setDestination] = useState("local");
  const [folder, setFolder] = useState(null), [pending, setPending] = useState(""), [error, setError] = useState("");
  const [backup, setBackup] = useState(null), [saved, setSaved] = useState(false), [resetOpen, setResetOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const lock = useRef(false);
  async function chooseFolder() {
    if (!window.showDirectoryPicker) { toast.info("This browser uses downloads. Choose your external drive from the browser Save As dialog."); return; }
    try { setFolder(await window.showDirectoryPicker({ mode: "readwrite", id: "karikku-backups" })); }
    catch (e) { if (e.name !== "AbortError") toast.error("Could not access this folder. Choose another folder or use downloads."); }
  }
  async function create() {
    if (lock.current) return;
    lock.current = true; setPending("backup"); setError(""); setBackup(null); setSaved(false);
    try {
      const data = await api("/backups/create", { method: "POST", body: { password, destination } });
      if (data.content) {
        const bytes = Uint8Array.from(atob(data.content), c => c.charCodeAt(0));
        if (folder) {
          const handle = await folder.getFileHandle(data.filename, { create: true });
          const writer = await handle.createWritable(); await writer.write(bytes); await writer.close();
        } else {
          const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
          const link = document.createElement("a"); link.href = url; link.download = data.filename; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
      }
      setBackup({ filename: data.filename, backupToken: data.backupToken, drive: data.drive });
      setPassword(""); setRepeat(""); result.refresh();
      toast.success(data.content ? "Backup ready. Verify the saved file before resetting." : "Backup saved to Google Drive");
    } catch (e) { setError(e.message); }
    finally { setPending(""); lock.current = false; }
  }
  async function google(action) {
    if (lock.current) return;
    lock.current = true; setPending(action); setError("");
    try {
      const data = await api(`/backups/google-${action}`, { method: "POST", body: {} });
      if (action === "connect") window.location.assign(data.url);
      else { result.refresh(); toast.success("Google Drive disconnected"); }
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setPending(""); }
  }
  async function reset() {
    if (lock.current || !backup || !saved) return;
    lock.current = true; setPending("reset"); setError("");
    try {
      await api("/backups/reset", { method: "POST", body: { backupToken: backup.backupToken, password: adminPassword, confirmation, backupSaved: saved } });
      try { await offlineDb.delete(); } catch { /* Login refresh rebuilds the cache. */ }
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setPending(""); }
  }
  return <div className="backup-settings">
    {result.error && <p className="error-panel" role="alert">{result.error}<button className="button secondary" onClick={result.refresh}>Try again</button></p>}
    <Card title="Workspace Backup" description="Create an encrypted copy of your records, products, settings and login accounts.">
      <p className="muted">Save to your computer, an external drive, Google Drive, or both. Keep the backup password somewhere safe; it is required to restore the file.</p>
      <div className="sm-grid"><label>Backup destination<Select value={destination} disabled={Boolean(pending)} onChange={e => setDestination(e.target.value)}><option value="local">Local / External Drive</option><option value="google">Google Drive</option><option value="both">Both</option></Select></label><div><span className="backup-label">Local folder</span><button type="button" className="button secondary" disabled={Boolean(pending)} onClick={chooseFolder}><FolderOpen size={16}/>{folder ? folder.name : "Choose folder"}</button><small>{folder ? "Used for this browser session." : "Uses browser downloads if no folder is selected."}</small></div></div>
      <div className="sm-grid"><label>Backup password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} disabled={Boolean(pending)} onChange={e => setPassword(e.target.value)} placeholder="At least 12 characters" /></label><label>Confirm backup password<input type="password" autoComplete="new-password" maxLength={128} value={repeat} disabled={Boolean(pending)} onChange={e => setRepeat(e.target.value)} /></label></div>
      <button type="button" className="button primary" disabled={Boolean(pending) || password.length < 12 || password !== repeat || (destination !== "local" && (!config?.google.connected || !config?.google.configured))} onClick={create}><Download size={16}/>{pending === "backup" ? "Creating backup…" : "Create Backup"}</button>
      {config?.lastBackup && <p className="muted">Last backup created: {formatDate(config.lastBackup.createdAt)} · {config.lastBackup.destination}</p>}
      {backup && <div className="backup-ready"><strong>{backup.filename}</strong>{backup.drive && <a href={backup.drive.folderUrl} target="_blank" rel="noreferrer">Open backup folder in Google Drive</a>}<label className="backup-check"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />I have verified that the backup is saved and kept its password.</label></div>}
    </Card>
    <Card title="Google Drive Setup" description="Backups are saved in a Karikku POS Backups folder in the connected Google Drive.">
      <p>{config?.google.connected ? "Google Drive connected" : "Google Drive not connected"}</p>
      {config?.google.folderUrl && <p><a href={config.google.folderUrl} target="_blank" rel="noreferrer">Open backup folder</a></p>}
      {!config?.google.configured && <div className="backup-setup"><p>One-time server setup is required. Enable the Google Drive API and create a Web application OAuth client, then configure these server environment values:</p><ul><li><code>GOOGLE_DRIVE_CLIENT_ID</code></li><li><code>GOOGLE_DRIVE_CLIENT_SECRET</code></li><li><code>GOOGLE_DRIVE_REDIRECT_URI</code> — your website URL followed by <code>/api/backups/google-callback</code></li><li><code>BACKUP_TOKEN_KEY</code> — a random 64-character hexadecimal key</li></ul><p>Register that exact redirect URI with Google and restart the server. Then use Connect Google Drive below.</p></div>}
      <div className="backup-actions"><button type="button" className="button secondary" disabled={Boolean(pending) || !config?.google.configured} onClick={() => google("connect")}><CloudUpload size={16}/>{config?.google.connected ? "Reconnect Google Drive" : "Connect Google Drive"}</button>{config?.google.connected && <button type="button" className="button secondary" disabled={Boolean(pending)} onClick={() => google("disconnect")}>Disconnect</button>}</div><small>Backups run when you click Create Backup. No automatic schedule is enabled.</small>
    </Card>
    <section className="sm-danger"><h2>Reset Workspace</h2><p>Clear transaction history and start a fresh workspace. Products, categories, settings, invoice numbering and login accounts will be kept.</p><dl className="backup-counts">{Object.entries(config?.counts || {}).map(([name, count]) => <div key={name}><dt>{labels[name]}</dt><dd>{count}</dd></div>)}</dl><p>Sales, customers, expenses, loyalty records, cash movements and day sessions—including any open session—will be deleted. Everyone will need to sign in again.</p><button type="button" className="button danger" disabled={Boolean(pending) || !backup || !saved} onClick={() => { setResetOpen(true); setError(""); setAdminPassword(""); setConfirmation(""); }}><RotateCcw size={16}/>Reset Workspace</button>{!backup && <small>Create and verify a fresh backup above to enable reset.</small>}</section>
    {error && !resetOpen && <p className="error-panel" role="alert">{error}</p>}
    {resetOpen && <Modal title="Reset Workspace?" closable={!pending} onClose={() => setResetOpen(false)}><div className="modal-body backup-settings"><p>This permanently deletes operational records. Products, settings and login accounts remain. Backup: <strong>{backup.filename}</strong></p><label>Administrator password<input type="password" autoComplete="current-password" disabled={Boolean(pending)} value={adminPassword} onChange={e => setAdminPassword(e.target.value)} /></label><label>Type RESET WORKSPACE to confirm<input disabled={Boolean(pending)} value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label>{error && <p className="error-panel" role="alert">{error}</p>}</div><footer className="modal-footer"><button type="button" className="button secondary" disabled={Boolean(pending)} onClick={() => setResetOpen(false)}>Cancel</button><button type="button" className="button danger" disabled={Boolean(pending) || !adminPassword || confirmation !== "RESET WORKSPACE"} onClick={reset}>{pending === "reset" ? "Resetting…" : "Confirm Reset"}</button></footer></Modal>}
  </div>;
}
