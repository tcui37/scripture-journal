"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

import ApiWarmup from "@/components/ApiWarmup";
import { useAuth } from "@/components/AuthProvider";
import { authHref, nextLabel, safeNext, signIn } from "@/lib/account";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const { user, loading, refresh, apiStatus } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, router, next]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      await refresh();
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-eyebrow">Sign in</p>
        <h1 className="auth-heading">Scripture Journal</h1>
        <ApiWarmup />
        <p className="auth-lead">
          {next === "/"
            ? "Save designs and files to your account."
            : `Continue to ${nextLabel(next)} after you sign in.`}
        </p>
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="control">
            <span className="control-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="control">
            <span className="control-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="warning">{error}</div> : null}
          <button type="submit" className="action-button" disabled={busy || apiStatus === "warming"}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="auth-footer">
          <p>
            Need an account? <Link href={authHref("signup", next)}>Create one</Link>
          </p>
          <p>
            <Link href={next}>← Back to {nextLabel(next)}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
