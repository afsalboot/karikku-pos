import Link from "next/link";
import { requirePageUser } from "@/lib/page-auth";
export default async function AccountPage() {
  const user = await requirePageUser("/account");
  return (
    <main className="workspace help-page">
      <p className="eyebrow">YOUR WORKSPACE</p>
      <h1>Your account</h1>
      <section className="state-card">
        <h2>Signed-in details</h2>
        <dl className="account-details">
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Username</dt>
          <dd>{user.username}</dd>
          <dt>Role</dt>
          <dd>{user.role === "ADMIN" ? "Administrator" : "Cashier"}</dd>
        </dl>
        <p>
          Your shop administrator manages names, passwords and access in Users.
          Updating a staff account revokes its existing sessions.
        </p>
        {user.role === "ADMIN" && (
          <Link className="button primary" href="/users">
            Manage staff accounts
          </Link>
        )}
      </section>
      <section className="state-card">
        <h2>Password and access help</h2>
        <p>
          Ask your shop administrator to reset a forgotten password or update
          your access. To sign out, open Profile options and choose Logout.
        </p>
        <Link href="/help">Open help</Link>
      </section>
    </main>
  );
}
