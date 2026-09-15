import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { fail } from "./auth.js";
export const ok = (data, message = "Success", status = 200) =>
  NextResponse.json(
    { success: true, message, data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
export function endpoint(handler, { multipart = false } = {}) {
  return async (request, context) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        if (request.headers.get("origin") !== new URL(request.url).origin)
          fail(403, "Request origin is not allowed");
        if (
          !request.headers
            .get("content-type")
            ?.includes(multipart ? "multipart/form-data" : "application/json")
        )
          fail(
            415,
            multipart
              ? "Send an image as multipart form data"
              : "Send JSON content",
          );
      }
      return await handler(request, context);
    } catch (error) {
      let status = error.status || 500;
      let message =
        status < 500 || status === 503
          ? error.message
          : "Unable to complete the request";
      if (error instanceof ZodError) {
        status = 400;
        message = error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .slice(0, 3)
          .join("; ");
      }
      if (error instanceof SyntaxError) {
        status = 400;
        message = "Invalid JSON";
      }
      if (error.code === 11000) {
        status = 409;
        message =
          "A record with those details already exists. Refresh and try again.";
      }
      if (status === 500)
        console.error("API failure", error.name, error.code || "internal");
      return NextResponse.json(
        { success: false, message },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
export async function body(request) {
  const raw = await request.text();
  if (raw.length > 400000) fail(413, "Request is too large");
  return JSON.parse(raw);
}
export function pagination(url) {
  const page = Math.max(
    1,
    Math.min(100000, Number(url.searchParams.get("page")) || 1),
  );
  const limit = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("limit")) || 20),
  );
  return {
    page: Math.floor(page),
    limit: Math.floor(limit),
    skip: (Math.floor(page) - 1) * Math.floor(limit),
  };
}
export const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 200);
