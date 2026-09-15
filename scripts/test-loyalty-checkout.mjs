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


  const category = await call("/categories", "POST", {name:"Loyalty test drinks",active:true},cookie);
  const product = await call("/products", "POST", {name:"Loyalty test juice",categoryId:category.data._id,basePrice:750,active:true,variantsEnabled:false,addonsEnabled:false,variants:[],addons:[]},cookie);
  check(product.status===201,"Create isolated checkout product");
  await call("/day-sessions","POST",{action:"open",openingCash:0},cookie);
  const config=(await call("/loyalty/settings","GET",undefined,cookie)).data;
  config.wallet.minimumRedemption=0;
  config.wallet.maximumRedemptionPercent=100;
  config.stamp.requiredPurchases=7;
  config.visit.requiredVisits=5;
  const settingsSaved=await call("/loyalty/settings","PATCH",config,cookie);
  check(settingsSaved.status===200,"Configure isolated loyalty rules");
  const customerId=new mongoose.Types.ObjectId(),secondId=new mongoose.Types.ObjectId();
  await mongoose.connection.collection("customers").insertMany([
    {_id:customerId,name:"Shakir Test",phone:"9876543210",dateOfBirth:new Date(),loyalty:{enabled:true,walletBalance:20,stampCount:5,availableStampRewards:0,tier:"Bronze",lifetimeEarned:240,visitCount:3,visitPeriodStart:new Date()},createdAt:new Date()},
    {_id:secondId,name:"Second Test",phone:"9876543211",dateOfBirth:new Date(),loyalty:{enabled:true,walletBalance:1000,stampCount:7,availableStampRewards:1,tier:"Silver"},createdAt:new Date()}
  ]);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const separator=cookie.indexOf("=");
  await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base}]);
  const page=await context.newPage();
  const errors=[]; page.on("pageerror",e=>errors.push(e.message));
  let previews=0;
  page.on("request",r=>{if(r.url().includes("/loyalty/preview")) previews++;});
  await page.goto(base+"/pos");
  await page.getByRole("button",{name:/Loyalty test juice/}).click();
  await page.getByRole("button",{name:"Proceed Payment",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Checkout",exact:true});
  const panel=page.getByRole("complementary",{name:"Loyalty",exact:true});
  await panel.getByRole("button",{name:"Select Customer",exact:true}).click();
  check(await page.getByRole("combobox",{name:"Customer name",exact:true}).evaluate(el=>el===document.activeElement),"Select Customer focuses existing picker");
  check(await panel.getByText("Wallet Balance",{exact:true}).count()===0,"Walk-ins have no wallet amounts");
  async function select(name) {
    await page.getByRole("combobox",{name:"Customer name",exact:true}).fill(name);
    await page.getByRole("option").filter({hasText:name}).click();
    await panel.getByText("Wallet Balance",{exact:true}).waitFor();
  }
  let firstLoad=true;
  await page.route("**/api/loyalty/customer?*",async route=>{
    await new Promise(resolve=>setTimeout(resolve,300));
    if(firstLoad) {firstLoad=false;await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Test loyalty outage"})});}
    else await route.continue();
  });
  await page.getByRole("combobox",{name:"Customer name",exact:true}).fill("Shakir Test");
  await page.getByRole("option").filter({hasText:"Shakir Test"}).click();
  await panel.getByRole("status",{name:"Loading loyalty information"}).waitFor();
  await panel.getByText("Unable to load loyalty information.",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Cash",exact:true}).click();
  check(await page.getByRole("button",{name:/Complete Sale/}).isEnabled(),"Loyalty load failure permits checkout without rewards");
  await panel.getByRole("button",{name:"Try Again",exact:true}).click();
  await panel.getByRole("status",{name:"Loading loyalty information"}).waitFor();
  await panel.getByText("Wallet Balance",{exact:true}).waitFor();
  await page.unroute("**/api/loyalty/customer?*");
  await panel.getByRole("progressbar",{name:"Stamps",exact:true}).waitFor();
  check(await panel.getByRole("progressbar",{name:"Stamps",exact:true}).getAttribute("value")==="5","Real stamp progress shown");
  check(await panel.getByRole("progressbar",{name:"Visits",exact:true}).getAttribute("value")==="3","Real visit progress shown");
  check(await panel.getByRole("checkbox").count()===0,"No reward toggles");
  const box=await panel.boundingBox(), checkoutBox=await dialog.locator(".checkout-form").boundingBox();
  check(box.width>=360 && box.width<=400 && box.x>checkoutBox.x+checkoutBox.width,"Desktop loyalty is 360–400px beside checkout");
  const wallet=panel.getByRole("textbox",{name:"Use wallet",exact:true});
  await panel.getByRole("button",{name:"Use all",exact:true}).click();
  await page.getByRole("button",{name:"Complete Sale · ₹730.00",exact:true}).waitFor();
  const requests=previews;
  await page.waitForTimeout(700);
  check(previews===requests,"Stable preview does not refetch on each render");
  for(const invalid of ["-1","abc","1.001","21"]) {
    await wallet.fill(invalid);
    check(await wallet.getAttribute("aria-invalid")==="true","Invalid wallet input shown: "+invalid);
    check(await page.getByRole("button",{name:/Complete Sale/}).isDisabled(),"Invalid wallet blocks completion");
  }
  await wallet.fill("20");
  await page.getByRole("button",{name:"Complete Sale · ₹730.00",exact:true}).waitFor();
  await panel.getByRole("button",{name:"Apply Birthday Reward",exact:true}).click();
  await page.getByRole("button",{name:"Complete Sale · ₹630.00",exact:true}).waitFor();
  check(await panel.getByRole("button",{name:"Remove Birthday Reward",exact:true}).isVisible(),"Applied birthday has Remove action");
  await mkdir("test-results",{recursive:true});
  await page.screenshot({path:"test-results/loyalty-desktop.png"});
  await page.setViewportSize({width:390,height:844});
  const mobileBox=await panel.boundingBox(),mobileForm=await dialog.locator(".checkout-form").boundingBox();
  check(mobileBox.y>=mobileForm.y+mobileForm.height-1,"Mobile loyalty stacks below checkout");
  check(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),"Mobile dialog has no horizontal overflow");
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({path:"test-results/loyalty-mobile.png"});
  await page.setViewportSize({width:1440,height:1000});
  await select("Second Test");
  check(await wallet.inputValue()==="","Changing customer clears wallet input");
  await page.getByRole("button",{name:"Complete Sale · ₹750.00",exact:true}).waitFor();
  await panel.getByRole("button",{name:"Apply Digital Stamp Card",exact:true}).click();
  await page.getByRole("button",{name:"Complete Sale · ₹630.00",exact:true}).waitFor();
  check(await panel.getByRole("button",{name:"Apply Birthday Reward",exact:true}).isDisabled(),"Stamp and birthday combination is disabled with an explanation");
  check(await panel.getByText(/Birthday and Digital Stamp rewards cannot be combined/).isVisible(),"Incompatible reward explains why");
  await panel.getByRole("button",{name:"Use all",exact:true}).click();
  await page.getByRole("button",{name:"Complete Sale · ₹0.00",exact:true}).waitFor();
  check(await wallet.inputValue()==="630.00","Wallet caps at remaining sale after reward");
  await select("Shakir Test");
  await panel.getByRole("button",{name:"Use all",exact:true}).click();
  await page.getByRole("button",{name:"Complete Sale · ₹730.00",exact:true}).waitFor();
  await panel.getByRole("button",{name:"Apply Birthday Reward",exact:true}).click();
  await page.getByRole("button",{name:"Complete Sale · ₹630.00",exact:true}).waitFor();
  await page.getByRole("button",{name:"Cash",exact:true}).click();
  let saleBody;
  await page.route("**/api/sales",async route=>{
    if(route.request().method()==="POST") {
      saleBody=route.request().postDataJSON();
      await route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({success:false,message:"Test payment failure"})});
    } else await route.continue();
  });
  await page.getByRole("button",{name:"Complete Sale · ₹630.00",exact:true}).click();
  await dialog.getByText("Test payment failure",{exact:true}).waitFor();
  check((await mongoose.connection.collection("customers").findOne({_id:customerId})).loyalty.walletBalance===20,"Failed completion does not consume wallet");
  check(!Object.hasOwn(saleBody.loyalty,"customerId") && saleBody.loyalty.walletAmount===20 && saleBody.loyalty.birthdayReward,"Sale uses existing sanitized loyalty payload");
  await page.unroute("**/api/sales");
  await page.getByRole("button",{name:"Complete Sale · ₹630.00",exact:true}).click();
  await dialog.waitFor({state:"hidden"});
  const saved=await mongoose.connection.collection("sales").findOne({"customer.customerId":customerId});
  check(saved.total===630 && saved.loyaltySummary.walletRedeemed===20 && saved.loyaltySummary.rewardsRedeemed.includes("BIRTHDAY"),"Actual sale persists discounted payable and redemption");
  const after=await mongoose.connection.collection("customers").findOne({_id:customerId});
  check(after.loyalty.walletBalance===18.9,"Cashback excludes the redeemed portion");
  const repeated=await call("/sales","POST",saleBody,cookie);
  check(repeated.status===201 && repeated.data._id===String(saved._id),"Duplicate request returns original sale");
  check((await mongoose.connection.collection("customers").findOne({_id:customerId})).loyalty.walletBalance===18.9,"Duplicate completion does not redeem or award twice");
  config.stamp.enabled=false;
  config.visit.enabled=false;
  config.birthday.rewardType="WALLET";
  await call("/loyalty/settings","PATCH",config,cookie);
  await page.goto(base+"/pos");
  await page.getByRole("button",{name:/Loyalty test juice/}).click();
  await page.getByRole("button",{name:"Proceed Payment",exact:true}).click();
  await select("Second Test");
  check(await panel.getByText("Digital Stamp Card",{exact:true}).count()===0 && await panel.getByText("Visit Streak",{exact:true}).count()===0,"Programs disabled in Settings are hidden");
  await panel.getByRole("button",{name:"Apply Birthday Reward",exact:true}).click();
  await panel.getByText("Credit will be added when the sale completes.",{exact:true}).waitFor();
  check(await page.getByRole("button",{name:"Complete Sale · ₹750.00",exact:true}).isVisible(),"Birthday wallet credit does not pretend to discount this sale");
  await page.getByRole("button",{name:"Cash",exact:true}).click();
  await page.getByRole("button",{name:"Complete Sale · ₹750.00",exact:true}).click();
  await dialog.waitFor({state:"hidden"});
  check((await mongoose.connection.collection("customers").findOne({_id:secondId})).loyalty.walletBalance===1122.5,"Birthday wallet reward credits only on completed sale, with existing cashback");
  config.birthday.rewardType="FIXED_DISCOUNT";
  config.birthday.availability="DAY";
  await call("/loyalty/settings","PATCH",config,cookie);
  const proofId=new mongoose.Types.ObjectId();
  await mongoose.connection.collection("customers").insertOne({_id:proofId,name:"Proof Test",phone:"9876543212",loyalty:{enabled:true,walletBalance:20,tier:"Bronze"},createdAt:new Date()});
  const today=businessDate();
  const proof={dateOfBirth:`2000-${today.slice(5)}`,checked:true};
  const previewInput={customerId:String(proofId),subtotalAfterDiscount:750,loyalty:{birthdayReward:true,birthdayProof:proof}};
  check((await call("/loyalty/preview","POST",{...previewInput,loyalty:{birthdayReward:true}},cookie)).status===400,"Missing birthday cannot redeem without proof");
  check((await call("/loyalty/preview","POST",{...previewInput,loyalty:{birthdayReward:true,birthdayProof:{...proof,checked:false}}},cookie)).status===400,"Server requires proof confirmation");
  const outsideMonth=Number(today.slice(5,7))===1 ? "02" : "01";
  check((await call("/loyalty/preview","POST",{...previewInput,loyalty:{birthdayReward:true,birthdayProof:{dateOfBirth:`2000-${outsideMonth}-01`,checked:true}}},cookie)).status===400,"Proof cannot bypass configured birthday period");
  const cashier=await User.findOneAndUpdate({username:"testadmin"},{$set:{role:"CASHIER"}},{returnDocument:"after"});
  check((await call("/loyalty/preview","POST",previewInput,cookie)).data.promotional===100,"Cashier can preview proof-verified birthday without a saved date");
  check(!(await mongoose.connection.collection("customers").findOne({_id:proofId})).dateOfBirth,"Preview does not save a birthday");
  await page.goto(base+"/pos");
  await page.getByRole("button",{name:/Loyalty test juice/}).click();
  await page.getByRole("button",{name:"Proceed Payment",exact:true}).click();
  await select("Proof Test");
  await panel.getByRole("button",{name:"Verify birthday",exact:true}).click();
  await panel.getByLabel("Date of birth on proof").fill(proof.dateOfBirth);
  check(await panel.getByRole("button",{name:"Verify & Apply",exact:true}).isDisabled(),"Cashier must confirm proof before applying");
  await panel.getByRole("checkbox",{name:"I checked the customer's birthday proof"}).check();
  await page.screenshot({path:"test-results/loyalty-birthday-proof.png"});
  await panel.getByRole("button",{name:"Verify & Apply",exact:true}).click();
  await page.getByRole("button",{name:"Complete Sale · ₹650.00",exact:true}).waitFor();
  await panel.getByRole("button",{name:"Use all",exact:true}).click();
  await page.getByRole("button",{name:"Complete Sale · ₹630.00",exact:true}).waitFor();
  const failedProofSale={requestId:randomUUID(),customer:{name:"Proof Test",phone:"9876543212"},items:[{productId:product.data._id,addonIds:[],quantity:1,note:""}],discount:{type:"fixed",value:0},paymentMethod:"Cash",cashReceived:0,loyalty:{walletAmount:20,birthdayReward:true,birthdayProof:proof}};
  check((await call("/sales","POST",failedProofSale,cookie)).status===400,"Actual sale API rejects insufficient payment with birthday proof");
  const afterFailure=await mongoose.connection.collection("customers").findOne({_id:proofId});
  check(afterFailure.loyalty.walletBalance===20 && !afterFailure.loyalty.birthdayRewardUsedYear && !afterFailure.dateOfBirth,"Failed sale leaves birthday eligibility and wallet untouched");
  await page.getByRole("button",{name:"Cash",exact:true}).click();
  await page.getByRole("button",{name:"Complete Sale · ₹630.00",exact:true}).click();
  await dialog.waitFor({state:"hidden"});
  const proofCustomer=await mongoose.connection.collection("customers").findOne({_id:proofId});
  check(proofCustomer.loyalty.birthdayRewardUsedYear===Number(today.slice(0,4)) && !proofCustomer.dateOfBirth,"Successful proof redemption marks this year without saving DOB");
  const proofAudit=await mongoose.connection.collection("loyaltytransactions").findOne({customerId:proofId,transactionType:"BIRTHDAY_REWARD"});
  check(proofAudit.description.includes("birthday proof checked") && String(proofAudit.createdBy)===String(cashier._id),"Birthday proof redemption is audited with cashier and sale");
  check((await call("/loyalty/preview","POST",previewInput,cookie)).status===400,"Proof cannot redeem the birthday reward twice in the year");
  check((await call("/sales","POST",{...failedProofSale,requestId:randomUUID(),cashReceived:630},cookie)).status===400,"Sale API also blocks a second proof redemption");
  check(errors.length===0,"No browser runtime errors: "+errors.join(", "));
  console.log("PASS: "+assertions+" loyalty API, database and browser assertions.");
} catch(error) { console.error("TEST FAILED:",error.stack);process.exitCode=1; }
finally {await browser?.close();if(server){server.kill();await new Promise(r=>setTimeout(r,500));}await mongoose.disconnect();await repl?.stop();}
