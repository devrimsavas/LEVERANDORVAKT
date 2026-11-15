import { apiFetch } from "@/lib/api";

// The address in the List-Unsubscribe header of the notification emails.
// Email apps such as Gmail POST to it when the user clicks their own
// "Unsubscribe" button (RFC 8058), without opening a page. Only POST is
// answered, so a link checker that opens the address changes nothing.
export async function POST(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 400 });

  const result = await apiFetch("/api/email/unsubscribe", {
    method: "POST",
    body: { token },
    auth: false,
  });
  if (result.ok) return new Response("Unsubscribed", { status: 200 });
  return new Response(
    result.status === 400 ? "This link is not valid" : "Try again later",
    { status: result.status === 400 ? 400 : 503 },
  );
}
