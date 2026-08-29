import Link from "next/link";

import { authHref, type SafeNext } from "@/lib/account";

interface GuestPromptProps {
  next: SafeNext;
  message: string;
}

export default function GuestPrompt({ next, message }: GuestPromptProps) {
  return (
    <div className="guest-prompt">
      <p className="panel-note">{message}</p>
      <div className="record-actions">
        <Link href={authHref("login", next)} className="btn btn-primary btn-inline">
          Sign in
        </Link>
        <Link href={authHref("signup", next)} className="btn btn-secondary">
          Create account
        </Link>
      </div>
    </div>
  );
}
