import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "./auth.js";
import { COOKIE } from "./jwt.js";
import { safeReturnPath } from "./navigation.js";

export async function requirePageUser(destination) {
  const user = await currentUser();
  if (!user) {
    const reason = (await cookies()).has(COOKIE) ? "&reason=expired" : "";
    redirect(
      `/login?next=${encodeURIComponent(safeReturnPath(destination))}${reason}`,
    );
  }
  return user;
}
