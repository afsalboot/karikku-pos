import { safeReturnPath } from "./navigation.js";
const referenceCache = new Map();
const inFlightReferenceRequests = new Map();
const REFERENCE_CACHE_MS = 15000;
let cacheGeneration = 0;
function invalidateReferences() {
  cacheGeneration++;
  referenceCache.clear();
  inFlightReferenceRequests.clear();
}

// Cancelling one subscriber must not cancel a shared request for other views.
function forSubscriber(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

const isReferencePath = (path) =>
  [
    "/categories",
    "/expense-categories",
    "/settings",
    "/loyalty/settings",
  ].includes(path);

async function request(path, options) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      cache: "no-store",
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Unable to reach the server. Check your connection and try again.",
    );
  }
  const result = await response
    .json()
    .catch(() => ({ message: "The server returned an invalid response" }));
  if (!response.ok) {
    // A full navigation clears all in-memory cart and user state after session expiry.
    if (
      response.status === 401 &&
      !["/auth/login", "/auth/logout"].includes(path)
    ) {
      invalidateReferences();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `/login?reason=expired&next=${encodeURIComponent(safeReturnPath(window.location.pathname))}`,
      );
    }
    throw new Error(result.message || "Request failed");
  }
  return result.data;
}

export async function api(path, options = {}) {
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const method = (options.method || "GET").toUpperCase();
  // These small reference payloads change infrequently. Reuse them briefly so
  // navigating between screens does not wait on a slow connection again.
  const cacheable = method === "GET" && isReferencePath(path);
  if (!cacheable) {
    if (method !== "GET") invalidateReferences();
    try {
      return await request(path, options);
    } finally {
      if (method !== "GET") invalidateReferences();
    }
  }

  const cached = referenceCache.get(path);
  if (cached && Date.now() - cached.savedAt < REFERENCE_CACHE_MS)
    return forSubscriber(Promise.resolve(cached.data), options.signal);
  if (inFlightReferenceRequests.has(path))
    return forSubscriber(inFlightReferenceRequests.get(path), options.signal);

  const generation = cacheGeneration;
  const pending = request(path, { ...options, signal: undefined })
    .then((data) => {
      if (generation === cacheGeneration)
        referenceCache.set(path, { data, savedAt: Date.now() });
      return data;
    })
    .finally(() => {
      if (inFlightReferenceRequests.get(path) === pending)
        inFlightReferenceRequests.delete(path);
    });
  inFlightReferenceRequests.set(path, pending);
  return forSubscriber(pending, options.signal);
}
const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
export const formatCurrency = (value = 0) => currencyFormatter.format(value);
export const formatDate = (value) => dateFormatter.format(new Date(value));
