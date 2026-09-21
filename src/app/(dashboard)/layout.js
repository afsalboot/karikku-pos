import { publicUser } from "@/lib/auth";
import { getSettings, clientSettings } from "@/services/settings";
import AppShell from "@/components/layout/app-shell";
import { headers } from "next/headers";
import { requirePageUser } from "@/lib/page-auth";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }) {
  const user = await requirePageUser((await headers()).get("x-workspace-path"));
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
