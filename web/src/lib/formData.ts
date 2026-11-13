// Helpers for the server actions behind the forms

export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// Whole minutes, never 0, for "try again in X minutes"
export function retryMinutes(seconds: number | undefined): number {
  return Math.max(1, Math.ceil((seconds ?? 60) / 60));
}
