import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/services/settings";
import ProductsWorkspace from "@/components/products-workspace";
import PosWorkspace from "@/components/pos/pos-workspace";
import SalesWorkspace from "@/components/sales/sales-workspace";
import ExpensesWorkspace from "@/components/expenses-workspace";
import ReportsWorkspace from "@/components/reports-workspace";
import DashboardWorkspace from "@/components/dashboard/dashboard-workspace";
import DayWorkspace from "@/components/day-workspace";
import UsersWorkspace from "@/components/users-workspace";
import SettingsWorkspace from "@/components/settings-workspace";
import CustomersWorkspace from "@/components/customers-workspace";
export default async function WorkspacePage({ params, searchParams }) {
  const { section } = await params;
  if (
    ![
      "dashboard",
      "pos",
      "sales",
      "products",
      "expenses",
      "reports",
      "day-closing",
      "users",
      "settings",
      "customers",
    ].includes(section)
  )
    notFound();
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") {
    const settings = await getSettings();
    if (
      !["pos", "sales"].includes(section) &&
      !(section === "expenses" && settings.allowCashierExpenses) &&
      !(section === "day-closing" && settings.allowCashierDayClosing)
    )
      redirect("/pos");
  }
  const views = {
    customers: CustomersWorkspace,
    products: ProductsWorkspace,
    pos: PosWorkspace,
    sales: SalesWorkspace,
    expenses: ExpensesWorkspace,
    "day-closing": DayWorkspace,
    users: UsersWorkspace,
    settings: SettingsWorkspace,
  };
  if (section === "dashboard") return <DashboardWorkspace />;
  if (section === "reports") return <ReportsWorkspace />;
  if (section === "pos")
    return <PosWorkspace duplicateId={(await searchParams).duplicate} />;
  if (section === "expenses")
    return <ExpensesWorkspace initialAdd={(await searchParams).add === "1"} />;
  const View = views[section];
  return <View />;
}
