"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((me: { home: string } | null) => {
        if (me) window.location.replace(me.home);
      })
      .catch(() => {});
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        window.location.assign(data.home);
        return;
      }
      setError(
        response.status === 401
          ? "That email or password isn't right. Check them and try again."
          : response.status === 429
            ? "Too many attempts. Wait a few minutes, then try again."
            : "Something went wrong. Try again.",
      );
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  function fillDemo(accountEmail: string) {
    setEmail(accountEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
    submitRef.current?.focus();
  }

  return (
    <main className="login-shell">
      <div className="login-brand">
        <span className="brand-mark">W</span>
        <span>workday<br />quest</span>
      </div>

      <section className="login-card">
        <h1>Sign in</h1>
        <p className="login-lead">Use your FADO account to see your workday.</p>

        <form className="login-form" onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button ref={submitRef} className="login-submit" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login-demo">
          <p>Prototype accounts. Pick one to fill the form.</p>
          <ul>
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.id}>
                <button type="button" onClick={() => fillDemo(account.email)}>
                  <strong>{account.name}</strong>
                  <span>{account.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="login-note">Fictional prototype data. Not connected to FADO&apos;s HR systems.</p>
    </main>
  );
}
