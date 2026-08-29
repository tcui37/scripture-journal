"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

import ApiWarmup from "@/components/ApiWarmup";
import { useAuth } from "@/components/AuthProvider";
import { authHref, authErrorField, friendlyAccountError, nextLabel, safeNext, signIn } from "@/lib/account";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const { user, sessionReady, refresh, apiStatus } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"email" | "password" | "form">("form");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionReady && user) router.replace(next);
  }, [sessionReady, user, router, next]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (apiStatus !== "ok") return;
    setError("");
    setErrorField("form");
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      await refresh();
      router.push(next);
    } catch (err) {
      setError(friendlyAccountError(err, "signin"));
      setErrorField(authErrorField(err, "signin"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <main className="auth-card">
        <p className="auth-eyebrow">Sign in</p>
        <h1 className="auth-heading">Scripture Journal</h1>
        <ApiWarmup />
        <p className="auth-lead">
          {next === "/"
            ? "Save designs and files to your account."
            : `Continue to ${nextLabel(next)} after you sign in.`}
        </p>
        <form
          className="auth-form"
          onSubmit={(event) => void handleSubmit(event)}
          aria-describedby={error && errorField === "form" ? "login-error" : undefined}
        >
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
              aria-invalid={errorField === "password" || undefined}
              aria-describedby={error && errorField === "password" ? "login-error" : undefined}
              className={errorField === "password" ? "is-invalid" : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? (
            <div id="login-error" className="warning" role="alert">
              {error}
            </div>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || apiStatus !== "ok"}>
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
      </main>
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
