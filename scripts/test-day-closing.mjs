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
  const admin = await User.findOne({username:"testadmin"}).select("+passwordHash");
  await User.create({name:"Cashier Tester",username:"cashiertester",passwordHash:admin.passwordHash,role:"CASHIER",active:true});
  const cashierLogin = await call("/auth/login","POST",{username:"cashiertester",password});
  const cashierCookie = cashierLogin.response.headers.get("set-cookie").split(";")[0];
  check((await call("/day-sessions","GET",undefined,cashierCookie)).status===403,"Cashier session access follows settings");


  const post = data => call("/day-sessions", "POST", data, cookie);
  const get = async () => (await call("/day-sessions", "GET", undefined, cookie)).data;
  const opened = await post({action:"open",openingCash:2500});
  check(opened.status===200 && opened.data.sessionNumber===1, "First session opens with number one");
  check((await post({action:"open",openingCash:0})).status===409,"Only one session can be open");
  const dayId = new mongoose.Types.ObjectId(opened.data._id);
  await mongoose.connection.collection("sales").insertMany([
    {daySessionId:dayId,status:"COMPLETED",paymentMethod:"Cash",total:400},
    {daySessionId:dayId,status:"COMPLETED",paymentMethod:"UPI",total:850},
    {daySessionId:dayId,status:"COMPLETED",paymentMethod:"Card",total:300},
    {daySessionId:dayId,status:"COMPLETED",paymentMethod:"Split",total:250,payments:[{method:"Cash",amount:100},{method:"UPI",amount:150}]},
    {daySessionId:new mongoose.Types.ObjectId(),statusChangedSessionId:dayId,status:"REFUNDED",paymentMethod:"Split",total:100,payments:[{method:"Cash",amount:40},{method:"Card",amount:60}]}
  ].map(sale=>({...sale,invoiceNumber:randomUUID(),requestId:randomUUID()})));
  await mongoose.connection.collection("expenses").insertOne({daySessionId:dayId,deletedAt:null,paymentMethod:"Cash",amount:60});
  let current=(await get()).current;
  check(current.cashSales===500 && current.cashRefunds===40 && current.expectedCash===2900,"Cash portions, expenses and refunds balance");
  check(current.totalSales===1800 && current.paymentBreakdown.find(p=>p._id==="UPI").total===1000 && !current.paymentBreakdown.some(p=>p._id==="Split"),"Payment rows allocate split without double counting");
  const movement={action:"movement",sessionId:String(dayId),requestId:randomUUID(),type:"IN",category:"Float Added",amount:100,note:"Float top up"};
  check((await post(movement)).status===200,"Record cash in");
  check((await post(movement)).status===200,"Retry movement is idempotent");
  check((await post({...movement,amount:200})).status===409,"Request ID cannot be reused with different data");
  check((await post({...movement,requestId:randomUUID(),type:"OUT",category:"Float Added"})).status===400,"Category must match movement direction");
  check((await post({...movement,requestId:randomUUID(),amount:0})).status===400,"Movement must be positive");
  check((await call("/day-sessions","POST",{...movement,requestId:randomUUID()},cashierCookie)).status===403,"Disabled cashier cannot record drawer movements");
  const close={action:"close",sessionId:String(dayId),actualCash:3000,expectedCash:3000};
  check((await post({...close,expectedCash:2900,reviewToken:current.reviewToken})).status===409,"Stale reviewed totals rejected");
  current=(await get()).current;
  check(current.cashIn===100 && current.expectedCash===3000 && current.movements.length===1,"Movement affects drawer exactly once");
  await mongoose.connection.collection("sales").insertOne({daySessionId:dayId,status:"COMPLETED",paymentMethod:"UPI",total:10,invoiceNumber:randomUUID(),requestId:randomUUID()});
  check((await post({...close,reviewToken:current.reviewToken})).status===409,"Noncash totals changing also invalidate review");
  check((await post({...close,actualCash:-1})).status===400,"Negative count rejected");
  check((await post({...close,actualCash:2999})).status===400,"Difference requires reason");
  check((await post({...close,actualCash:2999,differenceReason:"Cash Removed From Drawer"})).status===400,"Normal movement is not discrepancy reason");
  check((await post({...close,actualCash:2999,differenceReason:"Other"})).status===400,"Other requires description");
  check((await post({...close,cashRemovedAtClosing:3001})).status===400,"Cannot remove more than actual");
  check((await post({...close,cashRemovedAtClosing:2000,closingFloat:999})).status===400,"Float equality enforced");
  check((await post({...close,denominationBreakdown:{"500":1,"200":0,"100":0,"50":0,"20":0,"10":0,coins:0}})).status===400,"Full denomination count must match actual");

  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const separator=cookie.indexOf("=");
  await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base}]);
  const page=await context.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/day-closing");
  await page.getByRole("button",{name:"Continue to Cash Count"}).waitFor();
  await mkdir("test-results",{recursive:true});
  await page.screenshot({path:"test-results/day-session-review-desktop.png",fullPage:true});
  await page.getByRole("button",{name:"Add Cash Movement"}).click();
  await page.getByLabel("Movement Type").selectOption("OUT");
  await page.getByLabel("Category",{exact:true}).selectOption("Bank Deposit");
  await page.getByLabel("Amount (₹)",{exact:true}).fill("100");
  await page.getByRole("button",{name:"Record Movement"}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Continue to Cash Count"}).click();
  await page.getByLabel("Counting Method").selectOption("manual");
  await page.getByLabel("Actual Counted Cash (₹)").fill("3000");
  check(await page.getByRole("button",{name:"Continue to Closing"}).isDisabled(),"Manual discrepancy requires reason");
  await page.getByLabel("Reason for Difference").selectOption("Other");
  check(await page.getByRole("button",{name:"Continue to Closing"}).isDisabled(),"Other discrepancy requires description in UI");
  await page.getByLabel("Describe the difference").fill("Recount needed");
  check(await page.getByRole("button",{name:"Continue to Closing"}).isEnabled(),"Explained manual count can proceed");
  await page.getByLabel("Counting Method").selectOption("denominations");
  await page.getByLabel("Quantity of ₹500 notes").fill("5");
  await page.getByLabel("Quantity of ₹200 notes").fill("2");
  await page.getByText("Drawer Balanced · ₹0.00 Difference",{exact:true}).waitFor();
  for(const width of [320,390,820,1440]) {
    await page.setViewportSize({width,height:956});
    await page.waitForTimeout(400);
    await page.screenshot({path:"test-results/day-session-count-"+width+".png",fullPage:true});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Cash counter fits "+width+"px");
    await page.screenshot({path:"test-results/day-session-count-"+width+".png",fullPage:true});
  }
  await page.getByRole("button",{name:"Continue to Closing"}).click();
  await page.getByLabel("Cash Removed (₹)",{exact:true}).fill("1900");
  await page.getByLabel("Closing Note").fill("Verified drawer");
  await page.getByRole("button",{name:"Confirm & Close Day",exact:true}).click();
  await page.getByRole("heading",{name:"Day Closed Successfully"}).waitFor();
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await page.getByRole("heading",{name:"Start Business Day"}).waitFor();
  check(await page.getByLabel("Opening Cash (₹)",{exact:true}).inputValue()==="1000","Previous float prefilled");
  const closed=(await get()).previous;
  check(closed.actualCash===2900 && closed.cashOut===100 && closed.closingFloat===1000 && closed.cashRemovedAtClosing===1900,"Closed snapshot saves drawer totals and retained float");
  check(closed.denominationBreakdown["500"]===5 && closed.denominationCount===2900,"Full denomination breakdown saved");
  const detail=(await call("/day-sessions?sessionId="+closed._id,"GET",undefined,cookie)).data;
  check(detail.movements.length===2,"Detail includes all movements");
  await page.locator(".drawer-history-table").getByRole("button",{name:"View",exact:true}).first().click();
  await page.getByRole("heading",{name:"Denomination Count",exact:true}).waitFor();
  await page.getByRole("dialog").getByText("₹500 × 5",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  check(await page.locator(".drawer-history-cards").isVisible(),"Mobile history uses cards");
  check(!(await page.locator(".drawer-history-table").isVisible()),"Mobile wide table hidden");
  await page.screenshot({path:"test-results/day-session-opening-mobile.png",fullPage:true});
  await page.getByLabel("Opening Cash (₹)",{exact:true}).fill("900");
  check(await page.getByRole("button",{name:"Open Business Day"}).isDisabled(),"Opening adjustment requires reason");
  check((await post({action:"open",openingCash:900})).status===400,"Server enforces adjustment reason");
  const second=await post({action:"open",openingCash:900,openingAdjustmentReason:"Float changed by administrator"});
  check(second.status===200 && second.data.sessionNumber===2 && second.data.openingSource==="ADJUSTED","Same date next session and adjusted source");
  check((await post({...movement,requestId:randomUUID()})).status===409,"Movement cannot target closed session");
  await mongoose.connection.collection("expenses").insertOne({daySessionId:new mongoose.Types.ObjectId(second.data._id),deletedAt:null,paymentMethod:"Cash",amount:1000});
  current=(await get()).current;
  check(current.expectedCash===-100 && current.reconciliationState==="NEEDS_REVIEW","Negative balance requires review");
  await mongoose.connection.collection("settings").updateOne({_id:"shop"},{$set:{allowCashierDayClosing:true}});
  check((await call("/day-sessions","GET",undefined,cashierCookie)).status===200,"Enabled cashier can review sessions");
  check((await call("/day-sessions","POST",{action:"close",sessionId:second.data._id,actualCash:0,differenceReason:"Counting Error"},cashierCookie)).status===409,"Cashier cannot close negative expected cash");
  check((await post({action:"close",sessionId:second.data._id,actualCash:0,differenceReason:"Counting Error"})).status===409,"Negative balance blocks admin closing too");
  await page.reload();
  await page.getByText("Invalid drawer balance — review required",{exact:true}).waitFor();
  check(await page.getByRole("button",{name:"Continue to Cash Count"}).isDisabled(),"Negative review blocks normal UI flow");
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Negative guidance fits mobile");
  await post({...movement,sessionId:second.data._id,requestId:randomUUID(),amount:100});
  const corrected=await post({action:"close",sessionId:second.data._id,actualCash:0});
  check(corrected.status===200,"Corrected balance closes");
  const third=await post({action:"open",openingCash:0});
  check(third.data.openingSource==="PREVIOUS_FLOAT" && third.data.sessionNumber===3,"Zero float carried forward");
  const raceMovement={...movement,sessionId:third.data._id,requestId:randomUUID(),amount:10};
  const raceClose={action:"close",sessionId:third.data._id,actualCash:0,expectedCash:0};
  const race=await Promise.all([post(raceMovement),post(raceClose)]);
  check(race.filter(r=>r.status===200).length===1 && race.some(r=>r.status===409),"Concurrent cash movement and close serialize safely");
  current=(await get()).current;
  if(current) await post({action:"close",sessionId:current._id,actualCash:10});
  await mongoose.connection.collection("daysessions").insertOne({businessDate:"2020-01-01",openingCash:0,expectedCash:-100,actualCash:0,difference:100,status:"CLOSED",openedAt:new Date("2020-01-01"),closedAt:new Date("2020-01-01")});
  check((await call("/day-sessions?balance=review","GET",undefined,cookie)).data.total===1,"Legacy negative sessions filter as Needs Review");
  check((await call("/day-sessions?balance=over","GET",undefined,cookie)).data.total===0,"Negative history excluded from Over");
  check((await call("/day-sessions?search=Verified","GET",undefined,cookie)).data.total===1,"History searches closing note");
  check((await call("/day-sessions?search="+second.data.sessionCode,"GET",undefined,cookie)).data.total===1,"History searches session code");
  check((await call("/day-sessions?limit=1&page=2","GET",undefined,cookie)).data.items.length===1,"History paginates");
  await page.reload();
  await page.getByRole("heading",{name:"Start Business Day"}).waitFor();
  await page.getByLabel("Status",{exact:false}).selectOption("review");
  await page.locator(".drawer-history-cards").getByRole("button",{name:"View",exact:true}).first().click();
  await page.getByText("Denomination details were not recorded for this older session.",{exact:true}).waitFor();
  check(await page.getByRole("dialog").getByText("Needs Review",{exact:true}).isVisible(),"Legacy session details safely show Needs Review and missing denomination data");
  await page.getByRole("button",{name:"Done",exact:true}).click();
  check(errors.length===0,"No browser errors: "+errors.join(", "));
  console.log("PASS: "+assertions+" day-session API, database and browser assertions.");
} catch(error) { console.error("TEST FAILED:",error.stack); console.error(output); process.exitCode=1; }
finally {await browser?.close();if(server){server.kill();await new Promise(r=>setTimeout(r,500));}await mongoose.disconnect();await repl?.stop();}
