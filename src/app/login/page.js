"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "@/lib/client";
import { safeReturnPath } from "@/lib/navigation";
export default function LoginPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const submitting = useRef(false);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setExpired(
          new URLSearchParams(window.location.search).get("reason") ===
            "expired",
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const user = await api("/auth/login", {
        method: "POST",
        body: {
          username: form.get("username"),
          password: form.get("password"),
        },
      });
      router.replace(
        safeReturnPath(
          new URLSearchParams(window.location.search).get("next"),
          user.role === "ADMIN" ? "/dashboard" : "/pos",
        ),
      );
      router.refresh();
    } catch (error) {
      submitting.current = false;
      setError(error.message);
      setPending(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-card">
        <Image
          src="/logo.png"
          alt="Karikku Juice Shop"
          width={120}
          height={120}
          className="login-logo"
          priority
        />
        <p className="eyebrow">KARIKKU POS</p>
        <h1>Welcome back</h1>
        <p>Sign in to your shop workspace.</p>
        {expired && (
          <p role="status">
            Your session has ended. Sign in again to continue. An unfinished
            cart is not restored.
          </p>
        )}
        <form onSubmit={submit}>
          <label className="field">
            Username
            <input
              name="username"
              autoComplete="username"
              required
              autoFocus
              maxLength={60}
            />
          </label>
          <label className="field">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={72}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <nav className="login-help" aria-label="Sign-in help">
          <Link href="/help#sign-in">Forgot your password?</Link>
          <Link href="/help">Help</Link>
          <Link href="/cookies">Cookies and browser storage</Link>
        </nav>
      </section>
    </main>
  );
}
