import { cp, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// Inject failure only into an ignored fixture. Production source has no test backdoor.
const root = process.cwd();
const fixture = resolve(root, ".next-root-error-fixture");
let server, browser;
const env = { ...process.env, NEXT_DIST_DIR: ".next", MAINTENANCE_MODE: "false", NODE_ENV: "production" };
const next = join(root, "node_modules/next/dist/bin/next");
async function copy(path) {
  await mkdir(dirname(join(fixture, path)), { recursive: true });
  await cp(join(root, path), join(fixture, path));
}
try {
  for (const path of ["package.json", "jsconfig.json", "postcss.config.mjs", "src/app/layout.js", "src/app/global-error.js", "src/app/globals.css", "src/app/production-states.css", "src/components/ui/page-state.jsx"]) await copy(path);
  try { await symlink(join(root, "node_modules"), join(fixture, "node_modules"), "junction"); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  assert.equal(await realpath(join(fixture, "node_modules")), await realpath(join(root, "node_modules")));
  const layout = await readFile(join(fixture, "src/app/layout.js"), "utf8");
  await writeFile(join(fixture, "src/app/layout.js"), `import { headers } from "next/headers";\n${layout.replace("function RootLayout", "async function RootLayout").replace("  return (", '  if ((await headers()).get("x-fixture-failure") === "true") throw new Error("Private root failure detail");\n  return (')}`);
  await writeFile(join(fixture, "src/app/page.js"), 'export default function Page() { return <main><h1>Recovery succeeded</h1></main>; }');
  await writeFile(join(fixture, "next.config.mjs"), "export default {};\n");
  console.log("Building isolated root-error fixture…");
  await new Promise((resolveBuild, reject) => {
    const build = spawn(process.execPath, [next, "build", "--webpack"], { cwd: fixture, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    build.stdout.on("data", data => { output = (output + data).slice(-6000); });
    build.stderr.on("data", data => { output = (output + data).slice(-6000); });
    build.on("error", reject);
    build.on("exit", code => code === 0 ? resolveBuild() : reject(new Error(output)));
  });
  server = spawn(process.execPath, [next, "start", "--port", "3121"], { cwd: fixture, env, windowsHide: true, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch("http://localhost:3121")).ok) { ready = true; break; } } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  assert.ok(ready, "Fixture server starts");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setExtraHTTPHeaders({ "x-fixture-failure": "true" });
  const response = await page.goto("http://localhost:3121");
  assert.equal(response.status(), 500);
  await expect(page.getByRole("heading", { name: "The application could not load" })).toBeVisible();
  assert.ok(!(await page.locator("body").innerText()).includes("Private root failure detail"));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mkdir(join(root, "test-results/production-pages"), { recursive: true });
  await page.screenshot({ path: join(root, "test-results/production-pages/root-error-mobile.png"), fullPage: true });
  await page.setExtraHTTPHeaders({});
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Recovery succeeded" })).toBeVisible();
  console.log("PASS: Root-layout exception returns HTTP 500, safe responsive global fallback, and successful retry recovery.");
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill();
}
