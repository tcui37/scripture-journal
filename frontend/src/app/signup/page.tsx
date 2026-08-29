"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

import ApiWarmup from "@/components/ApiWarmup";
import { useAuth } from "@/components/AuthProvider";
import { authHref, authErrorField, friendlyAccountError, nextLabel, safeNext, signUp } from "@/lib/account";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const { user, sessionReady, refresh, apiStatus } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"email" | "password" | "form">("form");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

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
      const result = await signUp(email.trim(), password);
      if (result.needs_confirmation) {
        setCheckEmail(true);
        return;
      }
      await refresh();
      router.push(next);
    } catch (err) {
      setError(friendlyAccountError(err, "signup"));
      setErrorField(authErrorField(err, "signup"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <main className="auth-card">
        {checkEmail ? (
          <>
            <p className="auth-eyebrow">Almost there</p>
            <h1 className="auth-heading">Scripture Journal</h1>
            <p className="auth-lead">
              We sent a confirmation link to <strong>{email.trim()}</strong>. Open it, then sign
              in.
            </p>
            <div className="summary">Check your inbox, then return here to sign in.</div>
            <div className="auth-footer">
              <p>
                <Link href={authHref("login", next)} className="btn btn-primary btn-inline">
                  Back to sign in
                </Link>
              </p>
              <p>
                <Link href={next}>← Back to {nextLabel(next)}</Link>
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="auth-eyebrow">Create account</p>
            <h1 className="auth-heading">Scripture Journal</h1>
            <ApiWarmup />
            <p className="auth-lead">
              Keep named designs and journal files on your account. The journal still works without
              one.
            </p>
            <form
              className="auth-form"
              onSubmit={(event) => void handleSubmit(event)}
              aria-describedby={error && errorField === "form" ? "signup-error" : undefined}
            >
              <label className="control">
                <span className="control-label">Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  aria-invalid={errorField === "email" || undefined}
                  aria-describedby={error && errorField === "email" ? "signup-error" : undefined}
                  className={errorField === "email" ? "is-invalid" : undefined}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="control">
                <span className="control-label">
                  Password <span className="control-value">6+ characters</span>
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {error ? (
                <div id="signup-error" className="warning" role="alert">
                  {error}
                </div>
              ) : null}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy || apiStatus !== "ok"}>
                {busy ? "Creating…" : "Create account"}
              </button>
            </form>
            <div className="auth-footer">
              <p>
                Already have an account? <Link href={authHref("login", next)}>Sign in</Link>
              </p>
              <p>
                <Link href={next}>← Back to {nextLabel(next)}</Link>
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
