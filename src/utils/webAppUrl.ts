// Where the web app runs, for the links in emails
export function webAppUrl(): string {
  return (process.env.WEB_APP_URL || "http://localhost:3001").replace(
    /\/+$/,
    "",
  );
}
