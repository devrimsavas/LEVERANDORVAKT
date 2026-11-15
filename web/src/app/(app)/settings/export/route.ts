import { proxyDownload } from "@/lib/download";

// "Download my data": the API's JSON file of everything stored about the user
export async function GET(request: Request) {
  return proxyDownload(request, "/api/auth/me/export", "/settings", {
    filename: "leverandorvakt-data.json",
    contentType: "application/json; charset=utf-8",
  });
}
