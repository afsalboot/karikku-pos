const referenceCache = new Map();
const inFlightReferenceRequests = new Map();
const REFERENCE_CACHE_MS = 15000;

const isReferencePath = (path) =>
  ["/categories", "/expense-categories", "/settings", "/loyalty/settings"].includes(
    path,
  );

async function request(path, options) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const result = await response
    .json()
    .catch(() => ({ message: "The server returned an invalid response" }));
  if (!response.ok) {
    // A full navigation clears all in-memory cart and user state after session expiry.
    if (response.status === 401 && !path.startsWith("/auth/")) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
    throw new Error(result.message || "Request failed");
  }
  return result.data;
}

export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  // These small reference payloads change infrequently. Reuse them briefly so
  // navigating between screens does not wait on a slow connection again.
  const cacheable =
    method === "GET" && !options.signal && isReferencePath(path);
  if (!cacheable) {
    const data = await request(path, options);
    if (method !== "GET") referenceCache.clear();
    return data;
  }

  const cached = referenceCache.get(path);
  if (cached && Date.now() - cached.savedAt < REFERENCE_CACHE_MS)
    return cached.data;
  if (inFlightReferenceRequests.has(path))
    return inFlightReferenceRequests.get(path);

  const pending = request(path, options)
    .then((data) => {
      referenceCache.set(path, { data, savedAt: Date.now() });
      return data;
    })
    .finally(() => inFlightReferenceRequests.delete(path));
  inFlightReferenceRequests.set(path, pending);
  return pending;
}
export const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    value,
  );
export const formatDate = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
