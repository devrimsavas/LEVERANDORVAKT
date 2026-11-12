import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/ComingSoon";
import { requireUser } from "@/lib/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: `${t("admin")} – Leverandørvakt` };
}

export default async function AdminPage() {
  // Normal users get "not found", so the page does not reveal itself.
  // The API checks the role again on every admin call.
  const user = await requireUser();
  if (user.role !== "admin") notFound();

  const t = await getTranslations("app.nav");
  return <ComingSoon title={t("admin")} />;
}
