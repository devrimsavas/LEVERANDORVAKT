import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { requireUser } from "@/lib/user";

// Pages for logged-in users. The proxy already sends visitors without a
// session to the login page; requireUser also catches tokens the API no
// longer accepts.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <>
      <AppHeader user={user} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
