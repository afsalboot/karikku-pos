import { redirect } from "next/navigation";
import { currentUser, publicUser } from "@/lib/auth";
import { getSettings, clientSettings } from "@/services/settings";
import AppShell from "@/components/layout/app-shell";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await getSettings();
  return (
    <AppShell
      user={publicUser(user)}
      settings={JSON.parse(JSON.stringify(clientSettings(settings, user)))}
    >
      {children}
    </AppShell>
  );
}
