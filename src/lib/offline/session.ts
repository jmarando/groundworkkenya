// The sign-in kept on the phone. Supabase keeps its session in the browser's
// storage; with no signal, its own calls report no session once the hour-long
// access token has run out, though the session is still there and refreshes
// when signal returns. So with no signal (or a connection too weak to answer in
// time) the signed-in area reads the stored session itself, and a sign-out
// deletes it. Pure apart from phoneUser and forgetPhoneSession, which read and
// clear the browser's storage.

import type { User } from "@supabase/supabase-js";

import { isNetworkError } from "@/lib/field";

/** How long the signed-in area's check waits for Supabase before using the phone's sign-in. */
export const CHECK_WAIT_MS = 5000;

/** Supabase's storage key for a project (supabase-js's default). */
export const sessionKey = (supabaseUrl: string): string =>
  `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

/** The user of a stored session that can still be refreshed; null otherwise. */
export function userIn(raw: string | null): User | null {
  try {
    const s = JSON.parse(raw ?? "null") as {
      refresh_token?: unknown;
      user?: { id?: unknown };
    } | null;
    return typeof s?.refresh_token === "string" && typeof s.user?.id === "string"
      ? (s.user as User)
      : null;
  } catch {
    return null;
  }
}

/** No signal, or a request that never reached the server, as opposed to a refusal. */
export function unreachable(error: unknown, online: boolean): boolean {
  if (!online) return true;
  if ((error as { name?: unknown } | null)?.name === "AuthRetryableFetchError") return true;
  return error != null && isNetworkError(error);
}

/** The promise's result, or undefined if it takes longer than `ms`. */
export function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type Checked = { data: { user: User | null }; error: unknown };

/**
 * Who enters the signed-in area: the user Supabase confirms; when it can't be
 * reached or doesn't answer within `ms`, the sign-in kept on this phone, which
 * Supabase checks again once there's signal. Null (a refusal, or no sign-in
 * anywhere) means sign in.
 */
export async function entryUser(
  check: () => Promise<Checked>,
  kept: () => User | null,
  online: boolean,
  ms = CHECK_WAIT_MS,
): Promise<User | null> {
  let checked: Checked | undefined;
  try {
    checked = await within(check(), ms);
  } catch (error) {
    checked = { data: { user: null }, error };
  }
  if (checked?.data.user) return checked.data.user;
  return !checked || unreachable(checked.error, online) ? kept() : null;
}

/**
 * Signs out: Supabase's sign-out deletes the stored session, but only when it
 * reaches the server; when it fails (no signal), `forget` deletes the phone's
 * copy, so the phone is signed out either way.
 */
export async function signOutHere(
  signOut: () => Promise<{ error: unknown }>,
  forget: () => void,
): Promise<void> {
  const { error } = await signOut().catch((e: unknown) => ({ error: e }));
  if (error) forget();
}

const key = () => sessionKey(String(import.meta.env["VITE_SUPABASE_URL"]));

/** The user of the sign-in kept on this phone, read without the network. Browser only. */
export function phoneUser(): User | null {
  try {
    return userIn(localStorage.getItem(key()));
  } catch {
    return null;
  }
}

/** Deletes the sign-in kept on this phone, for a sign-out Supabase couldn't be reached for. Browser only. */
export function forgetPhoneSession(): void {
  try {
    localStorage.removeItem(key());
  } catch {
    // Storage refused: there's no kept sign-in to delete.
  }
}
