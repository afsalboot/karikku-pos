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


  const {settingSchema}=await import("../src/lib/validation.js");
  const keys=Object.keys(settingSchema.shape);
  const getConfig=async()=>{const s=(await call("/settings","GET",undefined,cookie)).data;const l=(await call("/loyalty/settings","GET",undefined,cookie)).data;return {...s,loyalty:l};};
  const clean=s=>Object.fromEntries(keys.filter(k=>s[k]!==undefined).map(k=>[k,s[k]]));
  let config=await getConfig();
  const saveConfig=async next=>{const result=await call("/settings","PATCH",clean(next),cookie);check(result.status===200,"Settings saved: "+result.message);config=await getConfig();return result;};
  check(config.checkout.defaultQuantity===1&&config.receipt.copies===1,"New defaults available");
  const invalid={...clean(config),businessName:"Should not persist",loyalty:{...config.loyalty,wallet:{...config.loyalty.wallet,cashbackPercentage:101}}};
  check((await call("/settings","PATCH",invalid,cookie)).status===400,"Combined save rejects invalid loyalty");
  check((await getConfig()).businessName===config.businessName,"Invalid combined save is atomic");
  check((await call("/loyalty/settings","PATCH",{...config.loyalty,visit:{...config.loyalty.visit,periodDays:0}},cookie)).status===400,"Legacy loyalty endpoint validates configuration");

  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  const split=cookie.indexOf("=");await context.addCookies([{name:cookie.slice(0,split),value:cookie.slice(split+1),url:base}]);
  await context.addInitScript(()=>{window.print=()=>console.log("TEST_PRINT_REQUEST");});
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  let settingsWrites=0;page.on("request",r=>{if(r.method()==="PATCH"&&r.url().endsWith("/api/settings"))settingsWrites++;});
  await page.goto(base+"/settings");
  const saveButton=page.getByRole("button",{name:"Save Changes",exact:true});await saveButton.waitFor();
  check(await saveButton.isDisabled(),"Save disabled until draft changes");
  await page.getByLabel("Business Name").fill("Karikku Settings Test");
  await page.getByLabel("Email Address").fill("invalid");
  await saveButton.click();
  await page.locator(".sm-field .sm-error").first().waitFor();
  check(settingsWrites===0,"Invalid field blocks save");
  await page.getByLabel("Email Address").fill("owner@example.com");
  await page.getByRole("navigation",{name:"Settings categories"}).getByRole("button",{name:"Payments",exact:true}).click();
  await page.getByRole("navigation",{name:"Settings categories"}).getByRole("button",{name:"General",exact:true}).click();
  check(await page.getByLabel("Business Name").inputValue()==="Karikku Settings Test","Switching categories preserves draft");
  await saveButton.click();await page.getByText("Settings saved successfully",{exact:true}).waitFor();
  check(settingsWrites===1,"One settings request persists business and loyalty");
  await page.reload();await page.getByLabel("Business Name").waitFor();
  check(await page.getByLabel("Business Name").inputValue()==="Karikku Settings Test","Saved business survives refresh");
  await page.getByLabel("Business Name").fill("Discard me");
  await page.getByRole("button",{name:"Discard Changes",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Discard",exact:true}).click();
  check(await page.getByLabel("Business Name").inputValue()==="Karikku Settings Test","Discard restores saved values");

  const search=page.getByRole("textbox",{name:"Search settings"});
  await search.fill("invoice prefix");await page.locator(".sm-results").getByRole("button",{name:/Invoice Prefix/}).click();
  check(await page.getByLabel("Invoice Prefix",{exact:true}).isVisible(),"Search navigates to individual setting");
  await page.getByLabel("Invoice Prefix",{exact:true}).fill("KJ-");
  await page.getByLabel("Invoice Format",{exact:true}).selectOption("DATE_SEQUENCE");
  check((await page.locator(".sm-invoice-preview > strong").textContent()).startsWith("KJ-"+businessDate().replaceAll("-","")),"Invoice preview uses current IST date");
  await saveButton.click();await page.waitForFunction(()=>[...document.querySelectorAll("button")].find(b=>b.textContent==="Save Changes")?.disabled);
  await page.getByRole("button",{name:"Preview Receipt",exact:true}).click();
  await page.getByRole("dialog").waitFor();check(await page.getByText("Fresh Juice (sample)",{exact:true}).first().isVisible(),"Receipt preview uses clearly labeled sample");
  await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
  await search.fill("cashback");await page.locator(".sm-results").getByRole("button",{name:/Wallet Cashback/}).click();
  await page.getByLabel("Cashback rate (%)",{exact:true}).fill("5");
  await page.getByLabel("Minimum purchase (₹)",{exact:true}).fill("100");
  await page.getByLabel("Maximum cashback per sale (₹)",{exact:true}).fill("100");
  await saveButton.click();await page.waitForFunction(()=>[...document.querySelectorAll("button")].find(b=>b.textContent==="Save Changes")?.disabled);
  await mkdir("test-results",{recursive:true});
  await page.screenshot({path:"test-results/settings-loyalty-desktop.png",fullPage:true});
  for(const program of ["Digital Stamp Card","Visit Streak","Birthday Reward"]){const card=page.locator(".sm-program").filter({has:page.getByRole("heading",{name:program,exact:true})});await card.getByRole("button",{name:"Configure"}).click();check(await card.locator(".sm-program-fields").isVisible(),program+" configuration expands");}
  await page.getByRole("switch",{name:"Loyalty Program",exact:true}).click();
  check(await page.locator(".sm-program").count()===4,"Disabled master retains all program cards");
  await page.getByRole("button",{name:"Discard Changes",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Discard",exact:true}).click();
  await page.getByRole("navigation",{name:"Settings categories"}).getByRole("button",{name:"Payments",exact:true}).click();
  await page.getByRole("switch",{name:"Accept Cash",exact:true}).click();await page.getByRole("switch",{name:"Accept UPI",exact:true}).click();await page.getByRole("switch",{name:"Accept Card",exact:true}).click();
  check(await page.getByText("At least one payment method must remain enabled.",{exact:true}).isVisible(),"Payment UI prevents disabling final method");
  await page.getByRole("button",{name:"Discard Changes",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Discard",exact:true}).click();
  await page.getByRole("navigation",{name:"Settings categories"}).getByRole("button",{name:"General",exact:true}).click();
  await page.screenshot({path:"test-results/settings-business-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Settings mobile does not overflow");
  await page.screenshot({path:"test-results/settings-mobile.png",fullPage:true,animations:"disabled"});
  await page.getByRole("navigation",{name:"Settings categories"}).getByRole("button",{name:"Data & Backup",exact:true}).click();
  await page.getByRole("button",{name:"Reset settings to defaults",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Load Defaults",exact:true}).click();
  await page.getByText("Defaults loaded. Review and Save Changes to apply.",{exact:true}).waitFor();
  check(await saveButton.isEnabled(),"Reset stages defaults for review");
  await page.getByRole("button",{name:"Discard Changes",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Discard",exact:true}).click();
  check((await getConfig()).businessName==="Karikku Settings Test","Staged reset never changes database");
  for(const kind of ["sales","expenses","products","customers"]){const response=await fetch(base+"/api/settings?export="+kind,{headers:{Cookie:cookie}});check(response.ok&&response.headers.get("content-type").includes("text/csv"),kind+" CSV export works");}
  config=await getConfig();
  const category=await call("/categories","POST",{name:"Test Juice",active:true},cookie);
  const product=await call("/products","POST",{name:"Test Juice",categoryId:category.data._id,basePrice:200,active:true,available:true,variantsEnabled:false,addonsEnabled:false,variants:[],addons:[]},cookie);
  check(product.status===201,"Create isolated test product");
  check((await call("/day-sessions","POST",{action:"open",openingCash:0},cookie)).status===200,"Open isolated session");
  const checkout=async(extra={})=>call("/sales","POST",{requestId:randomUUID(),items:[{productId:product.data._id,quantity:1,note:"",addonIds:[]}],discount:{type:"fixed",value:0},paymentMethod:"Cash",...extra},cookie);
  await saveConfig({...config,checkout:{...config.checkout,customerPrompt:"REQUIRED",splitPayment:false,allowItemNotes:false,cashAmountEntry:false,defaultQuantity:2,allowCustomQuantity:false},discounts:{types:["percentage"],maximumPercentage:25,maximumFixed:50,requireReason:true}});
  check((await checkout()).status===400,"Server enforces customer requirement");
  const customer={name:"Test Customer",phone:"9999999999"};
  check((await checkout({customer})).status===400,"Server enforces quantity rules");
  const items=[{productId:product.data._id,quantity:2,note:"",addonIds:[]}];
  await page.setViewportSize({width:1440,height:1050});await page.goto(base+"/pos");
  await page.locator(".pos-product-card").first().click();
  check(await page.getByRole("button",{name:"Increase Test Juice",exact:true}).isDisabled(),"Custom quantity control respects Settings");
  check(await page.locator(".pos-quantity").textContent().then(t=>t.includes("2")),"Default quantity is used by product selection");
  check(await page.getByRole("button",{name:"Add note for Test Juice",exact:true}).count()===0,"Item note control hidden when disabled");
  await page.getByRole("button",{name:"Proceed Payment",exact:true}).click();
  await page.getByRole("button",{name:"Cash",exact:true}).click();
  check(await page.getByRole("switch",{name:"Split payment",exact:true}).count()===0,"Split control hidden when disabled");
  check(await page.getByLabel("Amount Received",{exact:true}).count()===0,"Cash amount entry hidden when disabled");
  check(await page.getByRole("button",{name:/Complete Sale/}).isDisabled(),"Required customer blocks checkout completion");
  await page.getByRole("button",{name:"Back to cart",exact:true}).click();
  check((await checkout({customer,items,paymentMethod:"Split",payments:[{method:"Cash",amount:200},{method:"UPI",amount:200}]})).status===400,"Server enforces disabled split");
  check((await checkout({customer,items,cashReceived:500})).status===400,"Server enforces disabled cash entry");
  check((await checkout({customer,items:[{...items[0],note:"Forbidden"}]})).status===400,"Server enforces item notes");
  check((await checkout({customer,items,discount:{type:"percentage",value:30,reason:"Test"}})).status===400,"Server enforces percent limit");
  check((await checkout({customer,items,discount:{type:"percentage",value:10}})).status===400,"Server enforces discount reason");
  const sale=await checkout({customer,items,discount:{type:"percentage",value:10,reason:"Customer offer"}});
  check(sale.status===201 && sale.data.discount.reason==="Customer offer","Allowed discount and reason persist");
  const oldInvoice=sale.data.invoiceNumber;
  config=await getConfig();
  check((await call("/settings","PATCH",{...clean(config),startingNumber:config.lastIssuedSequence-1},cookie)).status===400,"Sequence cannot move below issued invoices");
  await saveConfig({...config,invoicePrefix:"NEW-",startingNumber:config.lastIssuedSequence+1,receipt:{...config.receipt,showLogo:false,showCustomer:false,showPayment:false,copies:2},checkout:{...config.checkout,customerPrompt:"OPTIONAL",allowCustomQuantity:true,defaultQuantity:1,allowItemNotes:true,splitPayment:true,cashAmountEntry:true},discountEnabled:false});
  check((await checkout({discount:{type:"fixed",value:10}})).status===400,"Global discount switch is enforced");
  check((await call("/sales/"+sale.data._id,"GET",undefined,cookie)).data.invoiceNumber===oldInvoice,"Existing invoice number remains unchanged");
  const nextSale=await checkout();check(nextSale.status===201&&nextSale.data.business.receipt.showCustomer===false&&nextSale.data.business.receipt.copies===2,"Receipt preferences snapshot with future sale");

  // All rewards use the existing checkout transaction, on disposable records.
  await saveConfig({...config,loyalty:{...config.loyalty,enabled:true,wallet:{...config.loyalty.wallet,enabled:true,cashbackPercentage:5,minimumBillAmount:100,maximumCashbackPerSale:100},stamp:{...config.loyalty.stamp,enabled:true,requiredPurchases:2},visit:{...config.loyalty.visit,enabled:true,requiredVisits:2,periodDays:10,countEverySale:true,minimumBillAmount:100},birthday:{...config.loyalty.birthday,enabled:true,rewardType:"WALLET",rewardValue:100,availability:"MONTH"}}});
  const customerDoc=await mongoose.connection.collection("customers").findOne({phone:customer.phone});
  await mongoose.connection.collection("customers").updateOne({_id:customerDoc._id},{$set:{dateOfBirth:new Date("2000-"+businessDate().slice(5)+"T00:00:00Z"),"loyalty.stampCount":0,"loyalty.availableStampRewards":0,"loyalty.visitCount":0,"loyalty.visitPeriodStart":new Date(),"loyalty.lastVisitRewardAt":null}});
  const rewardSale=await checkout({customer,loyalty:{birthdayReward:true,walletAmount:0,stampReward:false}});
  check(rewardSale.status===201&&rewardSale.data.loyaltySummary.cashbackEarned===10,"Wallet cashback uses configured rate");
  check(rewardSale.data.loyaltySummary.rewardsUnlocked.includes("BIRTHDAY_WALLET")&&rewardSale.data.total===200,"Birthday wallet credit does not discount sale");
  const repeat=await checkout({customer});check(repeat.status===201&&repeat.data.loyaltySummary.rewardsUnlocked.includes("STAMP")&&repeat.data.loyaltySummary.rewardsUnlocked.includes("VISIT_STREAK"),"Stamp and visit rewards use configured thresholds");
  check((await checkout({customer,loyalty:{birthdayReward:true,walletAmount:0,stampReward:false}})).status===400,"Birthday reward cannot be claimed twice");
  const balanceBefore=(await mongoose.connection.collection("customers").findOne({_id:customerDoc._id})).loyalty.walletBalance;
  await saveConfig({...config,loyalty:{...config.loyalty,wallet:{...config.loyalty.wallet,enabled:false},stamp:{...config.loyalty.stamp,enabled:false},visit:{...config.loyalty.visit,enabled:false},birthday:{...config.loyalty.birthday,enabled:false}}});
  const disabledRewardSale=await checkout({customer});
  check(disabledRewardSale.status===201&&disabledRewardSale.data.loyaltySummary.cashbackEarned===0&&disabledRewardSale.data.loyaltySummary.stampEarned===0&&disabledRewardSale.data.loyaltySummary.rewardsUnlocked.length===0,"Individual program switches affect checkout rewards");
  await saveConfig({...config,loyalty:{...config.loyalty,enabled:false}});
  check((await mongoose.connection.collection("customers").findOne({_id:customerDoc._id})).loyalty.walletBalance===balanceBefore,"Disabling loyalty preserves balances");
  await page.setViewportSize({width:1440,height:1050});await page.goto(base+"/pos");await page.getByRole("heading",{name:"New Sale",exact:true}).waitFor();
  check(await page.getByRole("spinbutton",{name:"Discount value"}).count()===0,"Discount controls hidden in POS when disabled");
  await saveConfig({...config,checkout:{...config.checkout,customerPrompt:"NEVER",showSuccess:false,autoPrint:false},upiId:"shop@upi"});
  await page.goto(base+"/pos");await page.locator(".pos-product-card").first().click();await page.getByRole("button",{name:"Proceed Payment",exact:true}).click();
  check(await page.getByRole("combobox",{name:"Customer name",exact:true}).count()===0,"Never customer setting hides collection");
  await page.getByRole("button",{name:"GPay / UPI",exact:true}).click();
  await page.getByText("Pay to: shop@upi",{exact:true}).waitFor();
  await page.getByRole("button",{name:/Complete Sale/}).click();await page.getByText("Sale completed successfully",{exact:true}).waitFor();
  check(await page.getByRole("heading",{name:"Payment Successful"}).count()===0,"Success modal setting is respected");
  await page.goto(base+"/settings");await page.getByRole("navigation",{name:"Settings categories"}).getByRole("button",{name:"Printing",exact:true}).click();
  const printRequested=new Promise(resolve=>page.on("console",message=>{if(message.text().includes("TEST_PRINT_REQUEST"))resolve(true);}));
  await page.getByRole("button",{name:"Test Print",exact:true}).click();
  check(await Promise.race([printRequested,new Promise(resolve=>setTimeout(()=>resolve(false),8000))]),"Test print invokes the browser print implementation");
  await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
  check(errors.length===0,"No browser runtime errors: "+errors.join("; "));
  console.log("PASS: "+assertions+" settings API, database and browser assertions.");
} catch(error) {console.error("TEST FAILED:",error.stack);process.exitCode=1;}
finally {await browser?.close();if(server){server.kill();await new Promise(r=>setTimeout(r,500));}await mongoose.disconnect();await repl?.stop();}
