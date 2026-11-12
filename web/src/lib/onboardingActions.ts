"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "./api";

// Closes the "getting started" list for good
export async function dismissOnboarding(): Promise<boolean> {
  const result = await apiFetch("/api/auth/me/onboarding/dismiss", {
    method: "POST",
  });
  revalidatePath("/overview");
  return result.ok;
}
