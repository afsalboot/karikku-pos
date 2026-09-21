import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import User from "../src/models/User.js";
const base = "http://localhost:3108";
let repl, server, browser, cookie, output = "", checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
async function call(path, method = "GET", body) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { Origin: base, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); assert.ok(response.ok, data.message); return { ...data, response };
}
try {
  repl = await MongoMemoryReplSet.create({ binary: { downloadDir: ".cache/mongodb" }, replSet: { count: 1 } });
  const uri = repl.getUri("picker_test"), password = randomUUID();
  await mongoose.connect(uri); await User.create({ name: "UI Tester", username: "uitester", role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3108"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, MONGODB_URI: uri, MONGODB_DB_NAME: "picker_test", JWT_SECRET: randomUUID().repeat(2) } });
  server.stdout.on("data", c => { output = (output + c).slice(-6000); }); server.stderr.on("data", c => { output = (output + c).slice(-6000); });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/login")).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  const login = await call("/auth/login", "POST", { username: "uitester", password }); cookie = login.response.headers.get("set-cookie").split(";")[0];
  for (let i = 0; i < 12; i++) await call("/categories", "POST", { name: `Juice ${String(i+1).padStart(2,"0")}`, active: true });
  await call("/day-sessions", "POST", { action: "open", openingCash: 100 });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const split = cookie.indexOf("="); await context.addCookies([{ name: cookie.slice(0,split), value: cookie.slice(split+1), url: base }]);
  const page = await context.newPage(), errors = []; page.on("pageerror", e => errors.push(e.message));
  await mkdir("test-results", { recursive: true });
  await page.goto(base + "/sales");
  const preset = page.getByLabel("Date range", { exact: true });
  await preset.click(); await page.locator(".select-panel").waitFor();
  await page.screenshot({path:"test-results/dropdown-sales-desktop.png",fullPage:true});
  await page.locator(".select-panel").getByRole("option", { name: "Last Month", exact: true }).click();
  check(await preset.inputValue() === "last-month", "Custom dropdown updates controlled date preset");
  await preset.focus(); await page.keyboard.press("Enter"); await page.keyboard.press("Home"); await page.keyboard.press("Enter");
  check(await preset.inputValue() === "today", "Keyboard dropdown selection works");
  await preset.click(); await page.keyboard.press("Escape"); check(await page.locator(".select-panel").count() === 0, "Escape closes menu");
  await preset.selectOption("month");
  const from = page.getByLabel("From date", { exact: true });
  await from.click(); await page.locator(".calendar-panel").waitFor();
  check(await page.locator(".calendar-grid .in-range").count() > 0, "Selected range is highlighted");
  await page.screenshot({path:"test-results/calendar-sales-desktop.png",fullPage:true});
  await page.locator(".calendar-panel").screenshot({path:"test-results/calendar-panel.png"});
  await page.locator(".calendar-grid button:not(.outside-month):not(:disabled)").nth(2).click();
  check((await from.inputValue()).endsWith("-03"), "Calendar choice updates date filter");
  await from.focus(); await page.keyboard.press("Enter"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
  check((await from.inputValue()).endsWith("-04"), "Keyboard calendar arrows select next date");
  for (const width of [320,390,820]) {
    await page.setViewportSize({width,height:956}); await page.waitForTimeout(400);
    await from.click(); const rect = await page.locator(".calendar-panel").boundingBox();
    check(rect.x >= 0 && rect.x+rect.width <= width+1, "Calendar stays inside "+width+"px");
    await page.screenshot({path:`test-results/calendar-sales-${width}.png`,fullPage:true});
    const overflow = await page.evaluate(()=>({width:innerWidth, scroll:document.documentElement.scrollWidth, elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width}))}));
    check(overflow.scroll<=width+1,"Sales filters do not overflow: "+JSON.stringify(overflow));
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base+"/products/add");
  const category = page.locator("dialog select").filter({has:page.locator('option', {hasText:"Juice 12"})}).first();
  await category.click(); await page.getByLabel("Search options",{exact:true}).fill("Juice 12");
  check(await page.locator(".select-panel [role=option]").count()===1,"Long dropdown search filters options");
  await page.locator(".select-panel").getByRole("option",{name:"Juice 12",exact:true}).click();
  check(await category.locator("option:checked").innerText()==="Juice 12","Category value updates in product form");
  await page.goto(base+"/day-closing");
  await page.getByRole("button",{name:"Add Cash Movement",exact:true}).click();
  const dialog = page.getByRole("dialog",{name:"Add Cash Movement",exact:true});
  await dialog.getByLabel("Movement Type").click();
  await page.locator(".select-panel").getByRole("option",{name:"Cash Out",exact:true}).click();
  await dialog.getByLabel("Category",{exact:true}).click();
  await page.screenshot({path:"test-results/dropdown-modal.png",fullPage:true});
  await page.locator(".select-panel").getByRole("option",{name:"Bank Deposit",exact:true}).click();
  await dialog.getByLabel("Amount (₹)",{exact:true}).fill("10");
  await dialog.getByRole("button",{name:"Record Movement",exact:true}).click(); await dialog.waitFor({state:"hidden"});
  check((await call("/day-sessions")).data.current.cashOut===10,"Dropdown works inside modal and preserves server payload");
  await page.goto(base+"/settings"); await page.getByRole("button",{name:"Payments",exact:true}).first().click();
  await page.getByRole("button",{name:"Invoice & Receipt",exact:true}).click();
  const receiptSize=page.locator('select').filter({has:page.locator('option',{hasText:'58mm'})}).first();
  await receiptSize.click(); await page.locator('.select-panel').getByRole('option',{name:'58mm',exact:true}).click();
  check(await receiptSize.inputValue()==='58mm','Settings dropdown retains draft updates');
  check(errors.length===0,'No browser errors: '+errors.join(', '));
  console.log(`PASS: ${checks} calendar/dropdown browser checks.`);
} catch(e) { console.error(e.stack); console.error(output); process.exitCode=1; }
finally { await browser?.close(); server?.kill(); await mongoose.disconnect(); await repl?.stop(); }
