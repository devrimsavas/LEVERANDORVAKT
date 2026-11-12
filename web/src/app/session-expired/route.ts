import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// The API no longer accepts the saved token (expired, or the account was
// deleted): forget it and ask the user to log in again.
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/login?expired=1", request.url),
  );
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
