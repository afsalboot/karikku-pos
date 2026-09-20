// Only loaded explicitly by test-backups.mjs through Node's --import option.
// No Google account or network request is used during integration tests.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "test-access", refresh_token: "test-refresh", scope: "https://www.googleapis.com/auth/drive.file" });
  if (target.startsWith("https://www.googleapis.com/")) {
    if (options.headers?.Authorization !== "Bearer test-access") return Response.json({}, { status: 401 });
    if (target.includes("uploadType=multipart")) {
      if (!Buffer.from(options.body).includes(Buffer.from("KARIKKU1"))) return Response.json({}, { status: 400 });
      return Response.json({ id: "test-backup-file" });
    }
    if (target.includes("/drive/v3/files?fields=id")) return Response.json({ id: "test-backup-folder" });
    return Response.json({}, { status: 400 });
  }
  return originalFetch(url, options);
};
