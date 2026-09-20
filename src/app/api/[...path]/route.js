import { endpoint } from "@/lib/http";
import { fail } from "@/lib/auth";
import { login, logout, me } from "@/services/auth";
import { products, categories } from "@/services/catalog";
import { sales } from "@/services/sales";
import { expenses } from "@/services/expenses";
import { reports } from "@/services/reports";
import { daySessions } from "@/services/day-sessions";
import { users, settings } from "@/services/admin";
import { customers } from "@/services/customers";
import { loyalty } from "@/services/loyalty";
import { backups } from "@/services/backups";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dispatch = endpoint(async (request, context) => {
  const { path } = await context.params;
  const [resource, recordId, extra] = path;
  if (extra) fail(404, "Endpoint not found");
  const method = request.method;
  if (resource === "auth") {
    if (recordId === "login" && method === "POST") return login(request);
    if (recordId === "logout" && method === "POST") return logout();
    if (recordId === "me" && method === "GET") return me();
    fail(405, "Method not allowed");
  }
  const resources = {
    customers,
    products,
    categories,
    "expense-categories": (r, id) => categories(r, id, true),
    sales,
    expenses,
    reports,
    dashboard: reports,
    "day-sessions": daySessions,
    users,
    settings,
    loyalty,
    backups,
  };
  if (!resources[resource]) fail(404, "Endpoint not found");
  const collectionMethods = {
    customers: ["GET"],
    products: ["GET", "POST"],
    categories: ["GET", "POST"],
    "expense-categories": ["GET", "POST"],
    sales: ["GET", "POST"],
    expenses: ["GET", "POST"],
    users: ["GET", "POST"],
    settings: ["GET", "PATCH"],
    reports: ["GET"],
    dashboard: ["GET"],
    "day-sessions": ["GET", "POST"],
    loyalty: ["GET", "POST", "PATCH"],
    backups: ["GET"],
  };
  const detailMethods = {
    backups: ["GET", "POST"],
    customers: ["GET"],
    products: ["GET", "PATCH"],
    categories: ["GET", "PATCH"],
    "expense-categories": ["GET", "PATCH"],
    sales: ["GET", "PATCH"],
    expenses: ["PATCH", "DELETE"],
    users: ["PATCH"],
    loyalty: ["GET", "POST", "PATCH"],
  };
  if (
    !(
      recordId ? detailMethods[resource] : collectionMethods[resource]
    )?.includes(method)
  )
    fail(405, "Method not allowed");
  return resources[resource](request, recordId);
});
export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
