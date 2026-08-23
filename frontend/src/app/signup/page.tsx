"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { authHref, nextLabel, safeNext, signUp } from "@/lib/account";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const { user, loading, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, router, next]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
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
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
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
                <Link href={authHref("login", next)} className="action-button action-button-inline">
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
            <p className="auth-lead">
              Keep named designs and journal files on your account. The journal still works without
              one.
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
              {error ? <div className="warning">{error}</div> : null}
              <button type="submit" className="action-button" disabled={busy}>
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
      </div>
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
