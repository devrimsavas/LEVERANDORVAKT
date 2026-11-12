"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "./api";
import { MAX_NOTE_LENGTH } from "./companyTypes";
import { parseOrgNumber } from "./orgNumber";

export type WatchActionResult =
  | { ok: true }
  | { ok: false; error: "failed" | "tooLong" };

function companyPath(orgNumber: string) {
  return `/companies/${orgNumber}`;
}

export async function followCompany(
  orgNumber: string,
): Promise<WatchActionResult> {
  const org = parseOrgNumber(orgNumber);
  if (!org) return { ok: false, error: "failed" };
  const result = await apiFetch("/api/watchlist", {
    method: "POST",
    body: { orgNumber: org },
  });
  // 409: already followed, e.g. from another tab; the page is right anyway
  if (!result.ok && result.status !== 409)
    return { ok: false, error: "failed" };
  revalidatePath(companyPath(org));
  return { ok: true };
}

export async function unfollowCompany(
  orgNumber: string,
): Promise<WatchActionResult> {
  const org = parseOrgNumber(orgNumber);
  if (!org) return { ok: false, error: "failed" };
  const result = await apiFetch(`/api/watchlist/${org}`, { method: "DELETE" });
  if (!result.ok && result.status !== 404)
    return { ok: false, error: "failed" };
  revalidatePath(companyPath(org));
  return { ok: true };
}

export interface NoteState {
  result?: WatchActionResult;
  // Changes on every save, so the form can show "Saved" again
  savedAt?: number;
}

export async function saveNote(
  orgNumber: string,
  _previous: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const org = parseOrgNumber(orgNumber);
  const note = String(formData.get("note") ?? "").trim();
  if (!org) return { result: { ok: false, error: "failed" } };
  if (note.length > MAX_NOTE_LENGTH) {
    return { result: { ok: false, error: "tooLong" } };
  }
  const result = await apiFetch(`/api/watchlist/${org}`, {
    method: "PATCH",
    body: { note: note === "" ? null : note },
  });
  if (!result.ok) return { result: { ok: false, error: "failed" } };
  revalidatePath(companyPath(org));
  return { result: { ok: true }, savedAt: Date.now() };
}
