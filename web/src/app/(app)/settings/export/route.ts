import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";

// "Download my data": passes the API's JSON file on to the browser as a
// download. The token stays on the server, as everywhere else.
export async function GET(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.redirect(new URL("/login?next=/settings", request.url));
  }

  const base = process.env.API_URL ?? "http://localhost:3000";
  let response: Response;
  try {
    response = await fetch(`${base}/api/auth/me/export`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.redirect(
      new URL("/settings?export=failed", request.url),
    );
  }
  if (response.status === 401) {
    return NextResponse.redirect(new URL("/session-expired", request.url));
  }
  if (!response.ok) {
    return NextResponse.redirect(
      new URL("/settings?export=failed", request.url),
    );
  }

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition":
        response.headers.get("Content-Disposition") ??
        'attachment; filename="leverandorvakt-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
