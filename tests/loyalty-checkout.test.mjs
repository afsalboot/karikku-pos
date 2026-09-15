import test from "node:test";
import assert from "node:assert/strict";
import { walletLimit, walletInputError, applyLoyaltyPreview } from "../src/lib/loyalty-checkout.js";
import { calculateTotals } from "../src/lib/calculations.js";
import { birthdayProofSchema, loyaltyPreviewSchema } from "../src/lib/validation.js";

test("birthday proof requires an actual past date and explicit confirmation", () => {
  for (const dateOfBirth of ["", "2025-02-29", "2000-13-01", "2999-01-01"])
    assert.equal(birthdayProofSchema.safeParse({ dateOfBirth, checked:true }).success,false);
  assert.equal(birthdayProofSchema.safeParse({dateOfBirth:"2000-02-29",checked:false}).success,false);
  assert.equal(birthdayProofSchema.safeParse({dateOfBirth:"2000-02-29",checked:true}).success,true);
  const input={customerId:"012345678901234567890123",subtotalAfterDiscount:750,loyalty:{birthdayReward:true,birthdayProof:{dateOfBirth:"2000-02-29",checked:true}}};
  assert.equal(loyaltyPreviewSchema.safeParse(input).success,true);
  assert.equal(loyaltyPreviewSchema.safeParse({...input,loyalty:{...input.loyalty,birthdayReward:false}}).success,false);
});

const config = { enabled: true, allowRewardStacking: false, wallet: { enabled: true, minimumRedemption: 0, maximumRedemptionPercent: 100, allowWithOtherRewards: true } };
const rewards = { enabled: true, wallet: 1000, stamp: { maximumValue: 120 }, birthday: { rewardType: "PERCENTAGE_DISCOUNT", rewardValue: 10 } };
test("wallet reserves the reward first and obeys balance, pre-tax bill, percent and minimum limits", () => {
  assert.equal(walletLimit(config, {...rewards, wallet:20}, 750, {}), 20);
  assert.equal(walletLimit(config, rewards, 75, {}), 75);
  assert.equal(walletLimit(config, rewards, 750, {stampReward:true}), 630);
  assert.equal(walletLimit(config, rewards, 750, {birthdayReward:true}), 675);
  assert.equal(walletLimit({...config,wallet:{...config.wallet, maximumRedemptionPercent:20}},rewards,750,{}),150);
  assert.equal(walletLimit({...config,wallet:{...config.wallet, minimumRedemption:20}},{...rewards,wallet:10},750,{}),0);
  assert.equal(walletLimit({...config,wallet:{...config.wallet, allowWithOtherRewards:false}},rewards,750,{stampReward:true}),0);
  assert.equal(walletLimit({...config,enabled:false},rewards,750,{}),0);
});
test("wallet rejects invalid input without hiding it, and permits zero", () => {
  for (const value of ["-1", "1e2", "abc", "1.001", "Infinity"])
    assert.ok(walletInputError(value,20));
  assert.equal(walletInputError("21",20),"maximum");
  assert.equal(walletInputError("5",20,10),"minimum");
  for (const value of ["", "0", "20.00"]) assert.equal(walletInputError(value,20,10),"");
});
test("preview totals match completed-sale paise arithmetic with rewards, wallet and tax", () => {
  const items=[{lineTotal:750.37}], discount={type:"fixed",value:10.10};
  for (const gstEnabled of [false,true]) {
    const settings={gstEnabled,taxRate:18};
    const base=calculateTotals(items,discount,settings,{});
    assert.deepEqual(applyLoyaltyPreview(base,{wallet:20,promotional:100}),calculateTotals(items,discount,settings,{},120));
  }
});
