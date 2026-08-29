import { DEFAULT_REFERENCE, DEFAULT_SETTINGS } from "./constants";
import type {
  AuthUser,
  Design,
  DesignRecord,
  JournalFile,
  PassageSelection,
  Reference,
  Settings,
} from "./types";

export class AccountError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AccountError";
    this.status = status;
  }
}

function detailMessage(detail: unknown, status: number): string {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return `HTTP ${status}`;
}

export type AccountErrorKind = "signin" | "signup" | "password" | "files" | "designs";

/** Map API/network failures to what happened and what to do next. */
export function friendlyAccountError(error: unknown, kind: AccountErrorKind): string {
  const status = error instanceof AccountError ? error.status : 0;
  const message = error instanceof Error ? error.message.trim() : "";
  const userFacing = message && !message.startsWith("HTTP ") ? message : "";

  if (status === 401) {
    if (kind === "signin") return "That email or password is not right. Try again.";
    if (kind === "password") return "That current password is not right. Try again.";
  }
  if (status === 503) {
    return "Account storage is not available right now. Try again in a moment.";
  }
  if (status === 429) {
    return userFacing || "Too many attempts. Try again in a few minutes.";
  }
  if (status >= 500 || status === 0) {
    if (kind === "signin") return "Could not sign in. Check your connection and try again.";
    if (kind === "signup") return "Could not create the account. Check your connection and try again.";
    if (kind === "password") return "Could not update the password. Try again.";
    if (kind === "files") return "Could not load files. Try again.";
    return "Could not load designs. Try again.";
  }
  if (userFacing) return userFacing;
  if (kind === "signin") return "Could not sign in. Try again.";
  if (kind === "signup") return "Could not create the account. Try again.";
  if (kind === "password") return "Could not update the password. Try again.";
  if (kind === "files") return "Could not load files. Try again.";
  return "Could not load designs. Try again.";
}

export type AuthErrorField = "email" | "password" | "form";

/** Where to attach a mapped auth error so it is not only a form-level banner. */
export function authErrorField(error: unknown, kind: AccountErrorKind): AuthErrorField {
  if (!(error instanceof AccountError)) return "form";
  if (kind === "signin" && error.status === 401) return "password";
  if (kind === "password" && error.status === 401) return "password";
  if (kind === "signup" && error.status === 400) return "email";
  return "form";
}

async function sendJson<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const headers: HeadersInit = {};
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(path, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: { detail?: unknown }) => body?.detail)
      .catch(() => null);
    throw new AccountError(response.status, detailMessage(detail, response.status));
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function signUp(email: string, password: string) {
  return sendJson<{ user: AuthUser; needs_confirmation: boolean }>("/api/auth/signup", {
    method: "POST",
    body: { email, password },
  });
}

export async function signIn(email: string, password: string) {
  return sendJson<{ user: AuthUser; needs_confirmation: false }>("/api/auth/signin", {
    method: "POST",
    body: { email, password },
  });
}

export async function signOutRequest() {
  return sendJson<void>("/api/auth/signout", { method: "POST" });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return sendJson<void>("/api/auth/change-password", {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
  });
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const data = await sendJson<{ user: AuthUser }>("/api/auth/me");
    return data.user;
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) return null;
    throw error;
  }
}

export async function listDesigns() {
  return sendJson<DesignRecord[]>("/api/designs");
}

export async function createDesign(name: string, settings: Design) {
  return sendJson<DesignRecord>("/api/designs", {
    method: "POST",
    body: { name, settings },
  });
}

export async function deleteDesign(id: string) {
  return sendJson<void>(`/api/designs/${id}`, { method: "DELETE" });
}

export async function listFiles() {
  return sendJson<JournalFile[]>("/api/files");
}

export async function fetchFile(id: string) {
  return sendJson<JournalFile>(`/api/files/${id}`);
}

export async function createFile(body: {
  name: string;
  book_id: string;
  start_chapter: string;
  start_verse: string;
  end_chapter: string;
  end_verse: string;
  design: Design;
}) {
  return sendJson<JournalFile>("/api/files", { method: "POST", body });
}

export async function deleteFile(id: string) {
  return sendJson<void>(`/api/files/${id}`, { method: "DELETE" });
}

/** Allowed post-auth redirect targets (relative paths only). */
const SAFE_NEXT_PATHS = ["/", "/?files=1", "/?account=1"] as const;
export type SafeNext = (typeof SAFE_NEXT_PATHS)[number];

export function safeNext(value: string | null | undefined): SafeNext {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  const withoutHash = value.split("#", 1)[0] ?? value;
  const qIndex = withoutHash.indexOf("?");
  const path = qIndex === -1 ? withoutHash : withoutHash.slice(0, qIndex);
  const query = qIndex === -1 ? "" : withoutHash.slice(qIndex + 1);

  if (path === "/files") return "/?files=1";
  if (path === "/account") return "/?account=1";
  if (path === "/" && query) {
    const params = new URLSearchParams(query);
    if (params.get("account") === "1") return "/?account=1";
    if (params.get("files") === "1") return "/?files=1";
  }
  if (path === "/") return "/";
  return "/";
}

export function authHref(page: "login" | "signup", next?: string | null): string {
  const dest = safeNext(next);
  const base = page === "login" ? "/login" : "/signup";
  return dest === "/" ? base : `${base}?next=${encodeURIComponent(dest)}`;
}

export function nextLabel(path: string): string {
  switch (safeNext(path)) {
    case "/?files=1":
      return "files";
    case "/?account=1":
      return "account";
    default:
      return "journal";
  }
}

export function formatPassageLabel(selection: PassageSelection): string {
  const { book_id, start_chapter, start_verse, end_chapter, end_verse } = selection;
  if (start_chapter === end_chapter) {
    const range = end_verse !== start_verse ? `–${end_verse}` : "";
    return `${book_id} ${start_chapter}:${start_verse}${range}`;
  }
  return `${book_id} ${start_chapter}:${start_verse}–${end_chapter}:${end_verse}`;
}

export function sameDesign(left: Design, right: Design): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]) as Set<keyof Design>;
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

export function newestFirst<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** Build a file POST body from the journal snapshot in localStorage. No translations. */
export function fileCreateBody(
  name: string,
  snapshot: { settings?: Partial<Settings>; reference?: Partial<Reference> },
) {
  const reference = { ...DEFAULT_REFERENCE, ...snapshot.reference };
  const design = { ...DEFAULT_SETTINGS, ...snapshot.settings };
  return {
    name,
    book_id: reference.bookId,
    start_chapter: reference.startChapter,
    start_verse: reference.startVerse,
    end_chapter: reference.endChapter,
    end_verse: reference.endVerse,
    design,
  };
}
