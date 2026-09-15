"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "@/lib/client";
export default function LoginPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event) {
    event.preventDefault();
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
      router.replace(user.role === "ADMIN" ? "/dashboard" : "/pos");
      router.refresh();
    } catch (error) {
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
      </section>
    </main>
  );
}
