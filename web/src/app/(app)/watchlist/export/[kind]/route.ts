import { proxyDownload } from "@/lib/download";

const KINDS = ["companies", "changes"] as const;
type Kind = (typeof KINDS)[number];

// The watchlist (/watchlist/export/companies) or the changes of the
// followed companies (/watchlist/export/changes) as a CSV file
export async function GET(
  request: Request,
  { params }: RouteContext<"/watchlist/export/[kind]">,
) {
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) {
    return new Response("Not found", { status: 404 });
  }
  return proxyDownload(request, `/api/watchlist/export/${kind}`, "/watchlist", {
    filename: `leverandorvakt-${kind}.csv`,
    contentType: "text/csv; charset=utf-8",
  });
}
