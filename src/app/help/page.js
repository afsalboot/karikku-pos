import Link from "next/link";
export const metadata = { title: "Help | Karikku POS" };
export default function HelpPage() {
  return (
    <main className="workspace help-page">
      <p className="eyebrow">KARIKKU POS</p>
      <h1>Help with your workspace</h1>
      <p>Guidance for shop administrators and cashiers.</p>
      <nav className="state-actions" aria-label="Help navigation">
        <Link className="button primary" href="/">
          Open workspace
        </Link>
        <Link href="/login">Sign in</Link>
        <Link href="/cookies">Cookies and browser storage</Link>
      </nav>
      <section className="state-card" id="sign-in">
        <h2>Cannot sign in?</h2>
        <p>
          Use the username and password issued by your shop administrator.
          Accounts are created by the shop; there is no public registration or
          email password reset.
        </p>
        <p>
          For a forgotten password, ask an administrator to open Users, find
          your account and choose Reset Password. An administrator can also
          check whether your account is active. If login attempts are
          temporarily limited, wait for the time shown on the sign-in screen.
        </p>
        <p>
          If no administrator can sign in, the person responsible for running
          the application must arrange account recovery. Creating another
          browser session will not reset a password.
        </p>
        <Link href="/login">Return to sign in</Link>
      </section>
      <section className="state-card">
        <h2>Set up the shop</h2>
        <ol>
          <li>
            An administrator reviews business details, receipts, payment methods
            and cashier permissions in <Link href="/settings">Settings</Link>.
          </li>
          <li>
            Add active categories and products in{" "}
            <Link href="/products">Products</Link>.
          </li>
          <li>
            Open a business day with the opening cash in{" "}
            <Link href="/day-closing">Day Closing</Link>.
          </li>
          <li>
            Use <Link href="/pos">New Sale</Link> to select products and record
            payment.
          </li>
        </ol>
        <p>
          Pages and actions depend on your role and the shop settings. Ask an
          administrator when access is unavailable.
        </p>
      </section>
      <section className="state-card">
        <h2>Record payments and recover a failed save</h2>
        <p>
          Confirm that payment has been received before completing a sale. Cash,
          UPI and Card record the payment method; the application does not
          charge a card or verify a UPI transfer.
        </p>
        <p>
          If saving fails, keep the checkout open and use its retry action. When
          a connection is interrupted, check <Link href="/sales">Sales</Link>{" "}
          before entering the sale again. A receipt or successful sale
          confirmation means the server saved the sale.
        </p>
        <p>
          Administrators can record a cancellation or refund from Sales when a
          business day is open. The actual money reversal must be handled
          separately. Ask the shop administrator which transactions qualify.
        </p>
      </section>
      <section className="state-card">
        <h2>Connection problems and expired sessions</h2>
        <p>
          When offline, keep the current tab open to retain unsaved work in
          memory. Refreshing, closing the tab or signing in again can discard an
          unfinished cart. Offline sale saving is not supported.
        </p>
        <p>
          An online indicator only describes browser connectivity. Requests can
          still fail if the server is unavailable. Reconnect and retry; confirm
          saved transactions in Sales.
        </p>
        <p>
          If your session expires or an administrator changes your account, sign
          in again. You will return to a permitted workspace destination, but
          unfinished transactions are not restored.
        </p>
      </section>
      <section className="state-card">
        <h2>Accounts, exports and backups</h2>
        <p>
          View your identity in <Link href="/account">Your account</Link>.
          Administrators manage staff in <Link href="/users">Users</Link> and
          can export operational data or create a manual backup in Settings.
          Keep backup files and passwords secure; follow the instructions shown
          before any reset.
        </p>
        <p>
          For access issues, customer-data questions or shop-specific policies,
          ask your shop administrator. Do not share passwords or customer
          information when describing a problem.
        </p>
      </section>
    </main>
  );
}
