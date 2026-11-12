"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "./api";
import type { JobKind, JobResult, JobSummary } from "./adminTypes";

const PATHS: Record<JobKind, string> = {
  changeDetection: "/api/admin/change-detection/run",
  accountsCheck: "/api/admin/accounts-check/run",
};

// Runs a background job once, right now. The API checks that the caller
// is an admin; 409 means the job is already running.
export async function runJob(kind: JobKind): Promise<JobResult> {
  if (!(kind in PATHS)) return { ok: false, error: "failed" };
  const result = await apiFetch<JobSummary>(PATHS[kind], { method: "POST" });
  revalidatePath("/admin");
  if (result.ok) return { ok: true, summary: result.data };
  return { ok: false, error: result.status === 409 ? "running" : "failed" };
}
