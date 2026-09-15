"use client";
export default function ErrorPage({ reset }) {
  return (
    <main className="workspace">
      <h1>Unable to load this page</h1>
      <p>The server or database may be unavailable. Please try again.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
