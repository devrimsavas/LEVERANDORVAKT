import "server-only";
import { NextResponse } from "next/server";
import { getSessionToken } from "./session";

// Passes a file from the API on to the browser as a download (the data
// export, the CSV files). The token stays on the server, as everywhere
// else. When the file cannot be made, the browser goes back to `page`
// with ?export=failed, which the page shows as a message.
export async function proxyDownload(
  request: Request,
  apiPath: string,
  page: string,
  fallback: { filename: string; contentType: string },
): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(page)}`, request.url),
    );
  }

  const failed = () =>
    NextResponse.redirect(new URL(`${page}?export=failed`, request.url));
  const base = process.env.API_URL ?? "http://localhost:3000";
  let response: Response;
  try {
    response = await fetch(`${base}${apiPath}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return failed();
  }
  if (response.status === 401) {
    return NextResponse.redirect(new URL("/session-expired", request.url));
  }
  if (!response.ok) return failed();

  return new NextResponse(response.body, {
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") ?? fallback.contentType,
      "Content-Disposition":
        response.headers.get("Content-Disposition") ??
        `attachment; filename="${fallback.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
