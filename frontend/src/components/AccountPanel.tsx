"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import GuestPrompt from "@/components/GuestPrompt";
import PanelSkeleton from "@/components/PanelSkeleton";
import { useAuth } from "@/components/AuthProvider";
import { changePassword, authErrorField, friendlyAccountError } from "@/lib/account";

export default function AccountPanel() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordFailed, setPasswordFailed] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordField, setPasswordField] = useState<"password" | "form">("form");

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordStatus("");
    setPasswordFailed(false);
    setPasswordField("form");
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus("Password updated. Use it the next time you sign in.");
    } catch (error) {
      setPasswordFailed(true);
      setPasswordStatus(friendlyAccountError(error, "password"));
      setPasswordField(authErrorField(error, "password") === "password" ? "password" : "form");
    } finally {
      setPasswordBusy(false);
    }
  };

  if (loading) {
    return <PanelSkeleton label="Loading account…" />;
  }

  if (!user) {
    return (
      <GuestPrompt
        next="/?account=1"
        message="Sign in to manage your account. Designs and files need an account; the journal still works without one."
      />
    );
  }

  return (
    <>
      <section className="library-block">
        <h2 className="library-block-title">Profile</h2>
        <div className="library-block-body">
          <div className="control">
            <span className="control-label">Signed in as</span>
            <div className="identity-chip">{user.email}</div>
          </div>
          <button type="button" className="link-button" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      </section>

      <section className="library-block">
        <h2 className="library-block-title">Password</h2>
        <div className="library-block-body">
          <form className="auth-form" onSubmit={(event) => void handleChangePassword(event)}>
            <label className="control">
              <span className="control-label">Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                aria-invalid={passwordFailed && passwordField === "password" ? true : undefined}
                className={passwordFailed && passwordField === "password" ? "is-invalid" : undefined}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label className="control">
              <span className="control-label">
                New password <span className="control-value">6+ characters</span>
              </span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            {passwordStatus ? (
              <div
                className={passwordFailed ? "warning" : "summary"}
                role={passwordFailed ? "alert" : "status"}
              >
                {passwordStatus}
              </div>
            ) : null}
            <button type="submit" className="action-button" disabled={passwordBusy}>
              {passwordBusy ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
