import { SiteHeader } from "@/components/SiteHeader";
import { requireUser } from "@/lib/user";

// Pages for logged-in users. The proxy already sends visitors without a
// session to the login page; requireUser also catches tokens the API no
// longer accepts. The app's own navigation is added in the next step.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
