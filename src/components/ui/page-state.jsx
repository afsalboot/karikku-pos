import Link from "next/link";

export default function PageState({ code, title, children, action }) {
  return (
    <main className="state-page">
      <section className="state-card" aria-labelledby="state-title">
        <p className="eyebrow">KARIKKU POS {code && ` / ${code}`}</p>
        <h1 id="state-title">{title}</h1>
        <div className="state-description">{children}</div>
        <div className="state-actions">
          {action}
          <Link className="button secondary" href="/">
            Return to workspace
          </Link>
          <Link href="/help">Help with Karikku POS</Link>
        </div>
      </section>
    </main>
  );
}
