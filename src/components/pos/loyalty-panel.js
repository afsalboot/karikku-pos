import { CalendarDays, Check, ChevronDown, ChevronUp, Gift, Ticket, WalletCards } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { formatCurrency as currency } from "@/lib/client";
import { birthdayProofSchema } from "@/lib/validation";
import { businessDate } from "@/lib/dates";

function BirthdayProof({ pending, blocked, onApply }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [checked, setChecked] = useState(false);
  const parsed = birthdayProofSchema.safeParse({ dateOfBirth: date, checked: true });
  return <div className="birthday-proof">
    {!open ? <button className="button secondary" type="button" disabled={pending} onClick={() => setOpen(true)}>Verify birthday</button> : <>
      <label>Date of birth on proof<input type="date" value={date} max={businessDate()} onChange={event => setDate(event.target.value)} /></label>
      {date && !parsed.success && <p className="form-error" role="alert">{parsed.error.issues[0].message}</p>}
      <label className="birthday-proof-check"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />I checked the customer&apos;s birthday proof</label>
      <small>Used for this sale only. The birthday is not saved to the customer profile.</small>
      {blocked && <p className="form-error">{blocked}</p>}
      <button type="button" className="button primary" disabled={pending || !checked || !parsed.success || Boolean(blocked)} onClick={() => onApply({dateOfBirth:date,checked:true})}>Verify &amp; Apply</button>
    </>}
  </div>;
}

function Skeleton() {
  return <div className="loyalty-skeleton" role="status" aria-label="Loading loyalty information">
    <div /><div /><div /><span /><div />
  </div>;
}

function Progress({ value, total, label }) {
  return <div className="loyalty-progress">
    <div><span>{label}</span><b>{value} / {total}</b></div>
    <progress aria-label={label} value={Math.min(value, total)} max={total} />
  </div>;
}

function Reward({ icon: Icon, title, description, applied, selected, available, blocked, onApply, children, pending }) {
  return <article className={`loyalty-reward ${applied ? "is-applied" : ""}`}>
    <header><span className="loyalty-icon"><Icon size={17} /></span><h4>{title}</h4>
      {available && <span className={`loyalty-badge ${applied ? "applied" : ""}`}>{applied ? <><Check size={12} />Applied</> : selected ? "Selected" : "Available"}</span>}
    </header>
    <p>{description}</p>
    {children}
    {available && <div className="loyalty-reward-action">
      <button type="button" className={`button ${selected ? "secondary" : "primary"}`} disabled={pending || (!selected && Boolean(blocked))} onClick={onApply} aria-label={`${selected ? "Remove" : "Apply"} ${title}`}>
        {selected ? "Remove" : "Apply Reward"}
      </button>
      {blocked && !applied && <small>{blocked}</small>}
    </div>}
  </article>;
}

export default function LoyaltyPanel({ customer, member, configResult, selection, setLoyalty, preview, maximum, walletError, totals, checkoutTotals, subtotal, pending, clearLoyalty, onSelectCustomer }) {
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();
  const config = configResult.data;
  const rewards = member.data?.rewards;
  const profile = member.data?.customer;
  const progress = profile?.loyalty || {};
  const loading = member.loading || configResult.loading;
  const failed = member.error || configResult.error;
  const ready = rewards?.enabled && config?.enabled;
  const stampAvailable = Boolean(config?.stamp.enabled && rewards?.stamp?.available && subtotal > 0);
  const birthdayAvailable = Boolean(config?.birthday.enabled && (rewards?.birthday || selection.birthdayProof) && (subtotal > 0 || config.birthday.rewardType === "WALLET"));
  const selectedReward = selection.stampReward || selection.birthdayReward;
  const canCombineWallet = config?.allowRewardStacking || config?.wallet.allowWithOtherRewards;
  const rewardBlock = (other) => other
    ? "Birthday and Digital Stamp rewards cannot be combined. Remove the applied reward first."
    : selection.walletAmount > 0 && !canCombineWallet
      ? "Remove wallet use to apply this reward. Settings do not allow this combination."
      : "";
  const applied = (key) => Boolean(selection[key] && preview.data?.used?.includes(key === "stampReward" ? "STAMP" : "BIRTHDAY"));
  const updateReward = (key) => setLoyalty((current) => ({ ...current, [key]: !current[key], ...(key === "birthdayReward" && current.birthdayReward ? {birthdayProof:undefined} : {}) }));
  const walletMessage = walletError === "maximum" ? `You can use up to ${currency(maximum)} from this wallet.`
    : walletError === "minimum" ? `Use at least ${currency(config.wallet.minimumRedemption)}, or enter 0.` : walletError;
  const birthdayDescription = rewards?.birthday || config?.birthday;
  const birthdayValue = birthdayDescription?.rewardType === "PERCENTAGE_DISCOUNT"
    ? `${birthdayDescription.rewardValue}% off this purchase`
    : `${currency(birthdayDescription?.rewardValue || 0)} ${birthdayDescription?.rewardType === "WALLET" ? "wallet credit after this sale" : "off this purchase"}`;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const periodEnd = progress.visitPeriodStart && config ? new Date(progress.visitPeriodStart).getTime() + config.visit.periodDays * 86400000 : null;
  const activePeriod = periodEnd && periodEnd > now;
  const visits = activePeriod ? progress.visitCount || 0 : 0;
  const days = activePeriod ? Math.ceil((periodEnd - now) / 86400000) : config?.visit.periodDays;
  const rewardCooldown = config?.visit.oneRewardPerPeriod && progress.lastVisitRewardAt
    ? Math.max(0, Math.ceil((new Date(progress.lastVisitRewardAt).getTime() + config.visit.periodDays * 86400000 - now) / 86400000)) : 0;
  const stampCount = Math.min(progress.stampCount || 0, config?.stamp.requiredPurchases || 1);
  const availableCount = Number(stampAvailable) + Number(birthdayAvailable);
  const hasUpcoming = config?.visit.enabled || (config?.stamp.enabled && !stampAvailable) || (config?.birthday.enabled && !birthdayAvailable);

  return <aside className={`loyalty-panel${expanded ? "" : " is-collapsed"}`} aria-labelledby="checkout-loyalty-title">
    <header className="loyalty-panel-header">
      <h2 id="checkout-loyalty-title"><button type="button" className="loyalty-panel-toggle" aria-label={expanded ? "Collapse Loyalty" : "Expand Loyalty"} aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(value => !value)}><span>Loyalty</span>{expanded ? <ChevronUp size={19} /> : <ChevronDown size={19} />}</button></h2>
      <p>{!expanded && (walletError || preview.error || failed) ? "Expand to review loyalty information" : !expanded && preview.data && (preview.data.wallet > 0 || preview.data.used?.length) ? `Wallet used: ${currency(preview.data.wallet)} · ${preview.data.used.length} reward(s) applied` : "Rewards and wallet for this sale"}</p>
    </header>
    <fieldset id={bodyId} className="loyalty-panel-body" hidden={!expanded} disabled={pending}>
      {!customer.customerId ? <div className="loyalty-empty"><WalletCards size={24} /><p>Select a customer to view and redeem rewards.</p>{onSelectCustomer && <button type="button" className="button secondary" onClick={onSelectCustomer}>Select Customer</button>}</div>
        : loading ? <Skeleton />
        : failed ? <div className="loyalty-empty" role="alert"><p>Unable to load loyalty information.</p><button type="button" className="button secondary" onClick={() => { member.refresh(); configResult.refresh(); }}>Try Again</button><button type="button" className="loyalty-text-button" onClick={clearLoyalty}>Continue without loyalty</button></div>
        : !ready ? <div className="loyalty-empty"><p>Loyalty is not active for this customer.</p><button type="button" className="loyalty-text-button" onClick={clearLoyalty}>Continue without loyalty</button></div>
        : <>
          <div className="loyalty-member"><span className="loyalty-avatar" aria-hidden="true">{(profile.name || customer.name).slice(0, 1).toUpperCase()}</span><div><strong>{profile.name || customer.name}</strong><small>{rewards.tier} Member</small></div><span className="loyalty-tier">{rewards.tier}</span></div>
          <div className="loyalty-metrics">
            <div><span>Wallet</span><b>{currency(rewards.wallet)}</b></div>
            <div><span>Available rewards</span><b>{availableCount}</b></div>
            {config.stamp.enabled && <div><span>Stamps</span><b>{stampCount}/{config.stamp.requiredPurchases}</b></div>}
          </div>
          {config.wallet.enabled && <section className="loyalty-wallet" aria-labelledby="loyalty-wallet-heading">
            <header><h3 id="loyalty-wallet-heading"><WalletCards size={17} />Wallet Balance</h3><strong>{currency(rewards.wallet)}</strong></header>
            <p>{maximum > 0 ? "Available to use on this sale" : "No wallet amount usable on this sale"}</p>
            <label htmlFor="loyalty-wallet-input">Use wallet</label>
            <div className="loyalty-wallet-input"><span aria-hidden="true">₹</span><input id="loyalty-wallet-input" type="text" inputMode="decimal" placeholder="0.00" maxLength={16} value={selection.walletInput} aria-invalid={Boolean(walletError)} aria-describedby="loyalty-wallet-limits loyalty-wallet-error" onChange={(e) => {
              const value = e.target.value;
              setLoyalty((current) => ({ ...current, walletInput: value, walletAmount: /^\d+(\.\d{0,2})?$/.test(value) ? Number(value) : 0 }));
            }} /><button className="button secondary" type="button" disabled={maximum <= 0} onClick={() => setLoyalty((current) => ({ ...current, walletInput: maximum.toFixed(2), walletAmount: maximum }))}>Use all</button></div>
            <div id="loyalty-wallet-limits" className="loyalty-wallet-limits"><span>Available: {currency(rewards.wallet)}</span><b>Maximum now: {currency(maximum)}</b></div>
            {selectedReward && !canCombineWallet ? <small>Wallet cannot be combined with this reward.</small> : <small>Use wallet for up to {config.wallet.maximumRedemptionPercent}% of the bill{config.wallet.minimumRedemption > 0 ? ` · minimum ${currency(config.wallet.minimumRedemption)}` : ""}.</small>}
            <p id="loyalty-wallet-error" className="form-error" role={walletError ? "alert" : undefined}>{walletMessage}</p>
            <dl className="loyalty-sale-summary" aria-live="polite"><div><dt>Sale total</dt><dd>{currency(totals?.total)}</dd></div>{preview.data?.promotional > 0 && <div><dt>Loyalty reward</dt><dd>−{currency(preview.data.promotional)}</dd></div>}<div><dt>Wallet used</dt><dd>−{currency(preview.data?.wallet || 0)}</dd></div>{totals?.tax.enabled && preview.data && <div><dt>Tax reduction</dt><dd>−{currency(totals.tax.amount - checkoutTotals.tax.amount)}</dd></div>}<div><dt>Amount to pay</dt><dd>{currency(checkoutTotals?.total)}</dd></div></dl>
          </section>}
          <section className="loyalty-reward-group"><h3>Available Rewards <span>{availableCount}</span></h3>
            {!availableCount && <p className="loyalty-muted">No rewards available for this sale</p>}
            {stampAvailable && <Reward icon={Ticket} title="Digital Stamp Card" description={`Free item reward up to ${currency(rewards.stamp.maximumValue)}`} available selected={selection.stampReward} applied={applied("stampReward")} blocked={rewardBlock(selection.birthdayReward)} pending={pending || preview.loading} onApply={() => updateReward("stampReward")}>
              {applied("stampReward") && <small className="loyalty-saving">Free item discount: −{currency(preview.data.promotional)}</small>}
            </Reward>}
            {birthdayAvailable && <Reward icon={Gift} title="Birthday Reward" description={birthdayValue} available selected={selection.birthdayReward} applied={applied("birthdayReward")} blocked={rewardBlock(selection.stampReward)} pending={pending || preview.loading} onApply={() => updateReward("birthdayReward")}>
              {applied("birthdayReward") && <small className="loyalty-saving">{birthdayDescription.rewardType === "WALLET" ? "Credit will be added when the sale completes." : `Birthday discount: −${currency(preview.data.promotional)}`}</small>}
              {selection.birthdayProof && <small>Birthday proof checked for this sale</small>}
            </Reward>}
          </section>
          {hasUpcoming && <section className="loyalty-reward-group"><h3>Upcoming Rewards</h3>
            {config.stamp.enabled && !stampAvailable && <Reward icon={Ticket} title="Digital Stamp Card" description={rewards.stamp?.available ? "Add items to use your available reward" : `${Math.max(0, config.stamp.requiredPurchases - stampCount)} eligible purchases to unlock a reward`}><Progress value={stampCount} total={config.stamp.requiredPurchases} label="Stamps" /></Reward>}
            {config.visit.enabled && <Reward icon={CalendarDays} title="Visit Streak" description={rewardCooldown ? `Reward credited to wallet · next reward in ${rewardCooldown} days` : `${Math.max(0, config.visit.requiredVisits - visits)} more visits within ${days} days`}><Progress value={visits} total={config.visit.requiredVisits} label="Visits" /><small>{currency(config.visit.rewardAmount)} wallet credit · awarded automatically</small></Reward>}
            {config.birthday.enabled && !birthdayAvailable && <Reward icon={Gift} title="Birthday Reward" description={progress.birthdayRewardUsedYear === Number(businessDate().slice(0, 4)) ? "Already used this year" : !profile.dateOfBirth ? "Apply after checking birthday proof" : "Not active for this sale"}>
              {!profile.dateOfBirth && progress.birthdayRewardUsedYear !== Number(businessDate().slice(0, 4)) && <BirthdayProof pending={pending || preview.loading} blocked={rewardBlock(selection.stampReward)} onApply={birthdayProof => setLoyalty(current => ({...current,birthdayProof,birthdayReward:true}))} />}
            </Reward>}
          </section>}
          {!availableCount && !hasUpcoming && <p className="loyalty-muted">No rewards yet. Complete qualifying purchases to earn wallet cashback.</p>}
          {preview.loading && <div className="loyalty-preview-skeleton" role="status" aria-label="Updating loyalty totals" />}
          {preview.error && <div className="loyalty-preview-error" role="alert"><p>{preview.error}</p><button type="button" className="loyalty-text-button" onClick={clearLoyalty}>Remove rewards and continue</button></div>}
          {progress.lifetimeEarned > 0 && <small className="loyalty-insight">Lifetime rewards earned: {currency(progress.lifetimeEarned)}</small>}
        </>}
    </fieldset>
  </aside>;
}
