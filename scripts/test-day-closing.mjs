import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import User from "../src/models/User.js";
import { businessDate } from "../src/lib/dates.js";

const base = "http://localhost:3101";
const password = randomBytes(6).toString("hex");
let repl, server, browser;
let output = "";
let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions++;
};
async function call(path, method = "GET", data, cookie = "") {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const json = await response.json();
  return { response, status: response.status, ...json };
}
try {
  console.log("Starting disposable MongoDB replica set for isolated tests…");
  repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: join(process.cwd(), ".cache", "mongodb") },
    replSet: { count: 1 },
  });
  const uri = repl.getUri("karikku_test");
  await mongoose.connect(uri);
  await User.init();
  await promisify(execFile)(process.execPath, ["scripts/seed-admin.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MONGODB_URI: uri,
      MONGODB_DB_NAME: "karikku_test",
      SEED_ADMIN_USERNAME: "testadmin",
      SEED_ADMIN_PASSWORD: password,
    },
    windowsHide: true,
  });
  check(
    await User.exists({ username: "testadmin", role: "ADMIN", active: true }),
    "Documented bootstrap script creates the administrator",
  );
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3101"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MONGODB_URI: uri,
        MONGODB_DB_NAME: "karikku_test",
        JWT_SECRET: randomBytes(48).toString("hex"),
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  server.stdout.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-12000);
  });
  server.stderr.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-12000);
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("Test server exited");
    try {
      if ((await fetch(`${base}/login`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  check(ready, "Test server starts");
  check(
    (await call("/products")).status === 401,
    "Catalog API rejects anonymous requests",
  );
  check(
    (await fetch(`${base}/products`, { redirect: "manual" })).status === 307,
    "Protected page redirects to login",
  );
  const login = await call("/auth/login", "POST", {
    username: "testadmin",
    password,
  });
  check(login.status === 200, `Login succeeds: ${login.message}`);
  const cookie = login.response.headers.get("set-cookie").split(";")[0];

  const opened = await call("/day-sessions", "POST", {action:"open", openingCash:2500}, cookie);
  check(opened.status===200, "Open test session");
  const dayId = new mongoose.Types.ObjectId(opened.data._id);
  await mongoose.connection.collection("sales").insertMany([
    {daySessionId:dayId,status:"COMPLETED",paymentMethod:"Cash",total:400},
    {daySessionId:dayId,status:"COMPLETED",paymentMethod:"UPI",total:850},
    {daySessionId:dayId,status:"COMPLETED",paymentMethod:"Card",total:300},
    {daySessionId:dayId,status:"COMPLETED",paymentMethod:"Split",total:250,payments:[{method:"Cash",amount:100},{method:"UPI",amount:150}]},
    {daySessionId:new mongoose.Types.ObjectId(),statusChangedSessionId:dayId,status:"REFUNDED",paymentMethod:"Split",total:100,payments:[{method:"Cash",amount:40},{method:"Card",amount:60}]}
  ].map(sale=>({...sale,invoiceNumber:randomUUID(),requestId:randomUUID()})));
  await mongoose.connection.collection("expenses").insertOne({daySessionId:dayId,deletedAt:null,paymentMethod:"Cash",amount:60});
  const current=(await call("/day-sessions","GET",undefined,cookie)).data.current;
  check(current.cashSales===500 && current.cashRefunds===40 && current.cashExpenses===60 && current.expectedCash===2900,"Only applied cash enters drawer including reversals and expenses");
  check(current.totalSales===1800 && current.paymentBreakdown.find(p=>p._id==="Split").total===250,"Payment categories do not double count split");
  check((await call("/day-sessions","POST",{action:"close",sessionId:String(dayId),actualCash:2400},cookie)).status===400,"Server requires discrepancy reason");
  check((await call("/day-sessions","POST",{action:"close",sessionId:String(dayId),expectedCash:2800,actualCash:2900},cookie)).status===409,"Server rejects stale reviewed totals");
  for(const value of [-1,1.001]) check((await call("/day-sessions","POST",{action:"close",sessionId:String(dayId),actualCash:value},cookie)).status===400,"Server rejects invalid cash");
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const separator=cookie.indexOf("=");
  await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base}]);
  const page=await context.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/day-closing");
  const actual=page.getByRole("spinbutton",{name:"Actual Cash in Drawer"});
  await actual.waitFor();
  const close=page.getByRole("button",{name:"Close Day",exact:true});
  check(await close.isDisabled(),"Empty cash cannot close");
  await actual.fill("2900");
  await page.getByText("Drawer Balanced",{exact:true}).waitFor();
  check(await close.isEnabled(),"Balanced cash can close");
  await actual.fill("3100");
  await page.getByText("Cash Over",{exact:true}).waitFor();
  check(await close.isDisabled(),"Over requires reason");
  await actual.fill("2400");
  await page.getByText("Cash Short",{exact:true}).waitFor();
  check(await close.isDisabled(),"Short requires reason");
  await page.getByLabel("Reason for Difference").selectOption("Other");
  check(await close.isDisabled(),"Other requires detail");
  await page.getByLabel("Describe the difference").fill("Counting verification");
  check(await close.isEnabled(),"Detailed reason enables close");
  await page.getByRole("button",{name:"Count by Denomination"}).click();
  await page.getByLabel("Quantity of ₹500 notes").fill("5");
  await page.getByLabel("Quantity of ₹200 notes").fill("2");
  await page.getByRole("button",{name:/Use .* as Actual Cash/}).click();
  check(await actual.inputValue()==="2900.00","Denomination total fills actual cash");
  await actual.fill("2400");
  await mkdir("test-results",{recursive:true});
  await page.screenshot({path:"test-results/day-closing-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"Mobile has no page overflow");
  await page.waitForTimeout(400);
  await page.screenshot({path:"test-results/day-closing-mobile.png",fullPage:true,animations:"disabled"});
  await close.click();
  const dialog=page.getByRole("dialog",{name:"Close Business Session?"});
  await dialog.waitFor();
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
  check((await call("/day-sessions","GET",undefined,cookie)).data.current!==null,"Cancel preserves open day");
  await close.click();
  await page.getByRole("button",{name:"Confirm & Close Day",exact:true}).click();
  await page.getByRole("heading",{name:"Day Closed Successfully"}).waitFor();
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await page.getByRole("heading",{name:"Start a business day"}).waitFor();
  const history=(await call("/day-sessions?balance=short&search=Counting","GET",undefined,cookie)).data;
  check(history.total===1 && history.items[0].difference===-500,"Status and search filter persisted discrepancy");
  check(history.items[0].paymentBreakdown.find(p=>p._id==="Split").total===250,"Closed history retains split snapshot");
  check((await call("/day-sessions?balance=balanced","GET",undefined,cookie)).data.total===0,"Balanced filter excludes short");
  check((await call(`/day-sessions?from=${current.businessDate}&to=${current.businessDate}`,"GET",undefined,cookie)).data.total===1,"Date range includes closing business date");
  check((await call("/day-sessions?from=2000-01-01&to=2000-01-02","GET",undefined,cookie)).data.total===0,"Date range excludes unrelated sessions");
  check((await call("/day-sessions?limit=1&page=2","GET",undefined,cookie)).data.items.length===0,"History pagination applies on server");
  check((await call("/day-sessions","POST",{action:"close",sessionId:String(dayId),actualCash:2400,differenceReason:"Counting verification"},cookie)).status===409,"Repeated close is rejected");
  await page.getByRole("button",{name:"View session"}).first().click();
  await page.getByRole("dialog",{name:"Session Information"}).waitFor();
  check(await page.getByRole("dialog").getByText("Counting verification",{exact:true}).isVisible(),"Details show saved reason");
  await page.screenshot({path:"test-results/day-closing-details.png",fullPage:true});
  await page.getByRole("dialog").getByRole("button", {name:"Done", exact:true}).click();
  const negativeDay = await call("/day-sessions", "POST", {action:"open", openingCash:2900}, cookie);
  const negativeId = new mongoose.Types.ObjectId(negativeDay.data._id);
  await mongoose.connection.collection("sales").insertOne({daySessionId:negativeId,status:"COMPLETED",paymentMethod:"Cash",total:2550,invoiceNumber:randomUUID(),requestId:randomUUID()});
  await mongoose.connection.collection("expenses").insertOne({daySessionId:negativeId,deletedAt:null,paymentMethod:"Cash",amount:12000});
  await page.reload();
  await actual.waitFor();
  await page.getByText("Negative expected cash — review the cash records",{exact:true}).waitFor();
  await actual.fill("6550");
  await page.getByText("₹13,100.00 above recorded balance",{exact:true}).waitFor();
  await actual.fill("-6550");
  check(await close.isDisabled(),"Negative input cannot silently reuse the previous valid count");
  check(await actual.getAttribute("aria-invalid")==="true","Invalid physical count is explained");
  await actual.fill("0");
  await page.getByText("₹6,550.00 above recorded balance",{exact:true}).waitFor();
  check(await close.isDisabled(),"Negative expected balance still requires a discrepancy reason");
  await page.getByLabel("Reason for Difference").selectOption("Expense Paid Outside Drawer");
  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"Negative cash guidance fits mobile");
  await page.screenshot({path:"test-results/day-closing-negative-mobile.png",fullPage:true});
  await close.click();
  await dialog.getByText("₹6,550.00 above recorded balance",{exact:true}).waitFor();
  await dialog.getByRole("button",{name:"Confirm & Close Day",exact:true}).click();
  await page.getByRole("heading",{name:"Day Closed Successfully"}).waitFor();
  const negativeHistory=(await call("/day-sessions?balance=over","GET",undefined,cookie)).data.items.find(d=>d._id===String(negativeId));
  check(negativeHistory.expectedCash===-6550 && negativeHistory.actualCash===0 && negativeHistory.difference===6550,"Closing preserves the negative recorded balance and actual zero without clamping");
  check(errors.length===0,"No browser runtime errors: "+errors.join(", "));
  console.log("PASS: "+assertions+" day-closing API, database and browser assertions.");
} catch(error) { console.error("TEST FAILED:",error.stack);process.exitCode=1; }
finally {await browser?.close();if(server){server.kill();await new Promise(r=>setTimeout(r,500));}await mongoose.disconnect();await repl?.stop();}
