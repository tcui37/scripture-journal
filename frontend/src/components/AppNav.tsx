"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { authHref } from "@/lib/account";

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
  const { user, loading } = useAuth();
  const onJournal = pathname === "/";
  const accountOpen = onJournal && searchParams.get("account") === "1";
  const signInNext = accountOpen ? "/?account=1" : "/";

  if (loading) return null;

  if (user) {
    if (!onJournal) {
      return (
        <Link href="/?account=1" className="account-icon" title={user.email} aria-label="Account">
          <AccountIcon />
        </Link>
      );
    }

    return (
      <button
        type="button"
        className={`account-icon${accountOpen ? " is-on" : ""}`}
        title={user.email}
        aria-label={accountOpen ? "Close account" : "Account"}
        aria-expanded={accountOpen}
        aria-controls="account-sidecar"
        onClick={() => router.push(accountHref(searchParams, accountOpen))}
      >
        <AccountIcon />
      </button>
    );
  }

  return (
    <Link
      href={authHref("login", signInNext)}
      className={`app-nav-tab app-nav-tab-accent${accountOpen ? " is-on" : ""}`}
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
  const pathname = usePathname();
  const onJournal = pathname === "/";

  return (
    <nav className="app-nav" aria-label="App">
      <div className="app-nav-tabs">
        <Link href="/" className={`app-nav-tab${onJournal ? " is-on" : ""}`}>
          Journal
        </Link>
      </div>
    </nav>
  );
}
