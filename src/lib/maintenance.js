export function maintenanceEnabled(value) {
  return value === "true";
}

export const maintenanceHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maintenance | Karikku POS</title><style>body{margin:0;background:#f7f9f6;color:#202d26;font:16px Arial,sans-serif;line-height:1.6}main{max-width:38rem;margin:12vh auto;padding:2rem}a{display:inline-block;padding:.8rem 1.2rem;background:#245b3a;color:white;border-radius:.5rem}a:focus-visible{outline:3px solid #245b3a;outline-offset:4px}</style></head><body><main><p>KARIKKU POS</p><h1>Temporarily unavailable</h1><p>The workspace is undergoing maintenance. Please try again later.</p><p>If a sale was being saved, check Sales after service returns before entering it again.</p><a href="/">Try again</a></main></body></html>`;
