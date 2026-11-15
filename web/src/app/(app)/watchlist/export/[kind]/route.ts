import { proxyDownload } from "@/lib/download";

// The watchlist and its changes as one Excel file (/watchlist/export/excel),
// or either as a CSV file (/watchlist/export/companies, .../changes)
const FILES = {
  excel: {
    filename: "leverandorvakt-watchlist.xlsx",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  companies: {
    filename: "leverandorvakt-companies.csv",
    contentType: "text/csv; charset=utf-8",
  },
  changes: {
    filename: "leverandorvakt-changes.csv",
    contentType: "text/csv; charset=utf-8",
  },
} as const;

export async function GET(
  request: Request,
  { params }: RouteContext<"/watchlist/export/[kind]">,
) {
  const { kind } = await params;
  if (!Object.hasOwn(FILES, kind)) {
    return new Response("Not found", { status: 404 });
  }
  return proxyDownload(
    request,
    `/api/watchlist/export/${kind}`,
    "/watchlist",
    FILES[kind as keyof typeof FILES],
  );
}
