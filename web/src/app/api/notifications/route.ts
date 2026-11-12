import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { getNotificationSummary } from "@/lib/notifications";

// Used by the bell to check for new notifications while a page is open.
// The browser calls this Next route; the Next server calls the API with the
// token from the session cookie.
export async function GET() {
  if (!(await getSessionToken())) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const summary = await getNotificationSummary();
  if (!summary) {
    return NextResponse.json({ error: "Unavailable" }, { status: 502 });
  }
  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
