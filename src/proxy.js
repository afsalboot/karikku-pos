import { NextResponse } from "next/server";
import { maintenanceEnabled, maintenanceHtml } from "./lib/maintenance.js";
import { safeReturnPath } from "./lib/navigation.js";

export function proxy(request) {
  if (maintenanceEnabled(process.env.MAINTENANCE_MODE)) {
    const headers = { "Cache-Control": "no-store", "Retry-After": "300" };
    if (request.nextUrl.pathname.startsWith("/api/"))
      return NextResponse.json(
        {
          success: false,
          message:
            "The workspace is undergoing maintenance. Please try again later.",
        },
        { status: 503, headers },
      );
    return new NextResponse(maintenanceHtml, {
      status: 503,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const headers = new Headers(request.headers);
  // Override the caller's value; this header is only a navigation hint, never authorization.
  headers.set("x-workspace-path", safeReturnPath(request.nextUrl.pathname));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|apple-touch-icon.png|sw.js|offline.html).*)",
  ],
};
