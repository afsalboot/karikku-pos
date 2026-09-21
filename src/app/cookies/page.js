import Link from "next/link";
export const metadata = { title: "Cookies and browser storage | Karikku POS" };
export default function CookiesPage() {
  return (
    <main className="workspace help-page">
      <p className="eyebrow">KARIKKU POS</p>
      <h1>Cookies and browser storage</h1>
      <p>
        The application uses browser storage to support sign-in and workspace
        features.
      </p>
      <section className="state-card">
        <h2>Sign-in cookie</h2>
        <p>
          <code>karikku_session</code> identifies your signed-in session. It
          lasts up to 12 hours. The server can revoke access sooner, including
          after account changes or logout. Browser scripts cannot read this
          HTTP-only cookie.
        </p>
      </section>
      <section className="state-card">
        <h2>Optional Google Drive connection</h2>
        <p>
          When an administrator connects Google Drive for backups,{" "}
          <code>karikku_drive_connect</code> temporarily holds information used
          to check the authorization callback. It expires after 10 minutes and
          is restricted to the backup connection path.
        </p>
      </section>
      <section className="state-card">
        <h2>Local workspace and static files</h2>
        <p>
          The <code>karikku-pos-offline</code> IndexedDB database holds cached
          catalog and shop settings. The application also caches static files
          such as scripts, styles and images for loading. These caches remain
          until replaced or removed by the application, you or your browser.
          They do not make an unsaved sale a completed transaction.
        </p>
        <p>
          An unfinished cart is held in the open page’s memory. It is not a
          durable backup and can be lost on refresh, sign-out or session expiry.
        </p>
      </section>
      <section className="state-card">
        <h2>Your controls</h2>
        <p>
          You can clear site cookies and storage through your browser settings.
          Clearing cookies signs you out. Clearing storage removes cached data;
          reconnect before using the workspace again. Complete or resolve any
          unfinished transaction before clearing storage.
        </p>
        <p>
          This application does not include analytics or advertising preference
          controls. For questions about shop data handling, ask your shop
          administrator.
        </p>
      </section>
      <nav className="state-actions" aria-label="Storage notice navigation">
        <Link className="button secondary" href="/login">
          Sign in
        </Link>
        <Link href="/help">Help</Link>
        <Link href="/">Workspace</Link>
      </nav>
    </main>
  );
}
