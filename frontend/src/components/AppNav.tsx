"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { authHref } from "@/lib/account";

import ApiWarmup from "./ApiWarmup";
import { useAuth } from "./AuthProvider";

function accountHref(searchParams: URLSearchParams, accountOpen: boolean): string {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("account");
  if (!accountOpen) params.set("account", "1");
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

/** Account icon (signed in) or Sign in link (guest). */
export function AccountControl() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, apiStatus } = useAuth();
  const onJournal = pathname === "/";
  const accountOpen = onJournal && searchParams.get("account") === "1";
  const signInNext = accountOpen ? "/?account=1" : "/";

  // Hide until /me has run against a live API so guests never flash an account
  // icon and signed-in users never flash Sign in.
  if (loading || apiStatus !== "ok") return null;

  if (user) {
    if (!onJournal) {
      return (
        <Link href="/?account=1" className="account-icon is-label" title={user.email} aria-label="Account">
          <AccountIcon />
          Account
        </Link>
      );
    }

    return (
      <button
        type="button"
        className={`account-icon is-label${accountOpen ? " is-on" : ""}`}
        title={user.email}
        aria-label={accountOpen ? "Close account" : "Account"}
        aria-expanded={accountOpen}
        aria-controls="account-sidecar"
        onClick={() => router.push(accountHref(searchParams, accountOpen))}
      >
        <AccountIcon />
        Account
      </button>
    );
  }

  return (
    <Link
      href={authHref("login", signInNext)}
      className={`app-nav-tab${accountOpen ? " is-on" : ""}`}
    >
      Sign in
    </Link>
  );
}

function AccountIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export default function AppNav() {
  return (
    <nav className="app-nav" aria-label="App">
      <div className="app-nav-tabs">
        <ApiWarmup />
      </div>
    </nav>
  );
}
