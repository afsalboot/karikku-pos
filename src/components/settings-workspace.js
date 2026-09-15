"use client";
import SettingsAdministration from "@/components/settings/settings-page";
import { useData } from "@/hooks/useData";
import { Notice } from "@/components/ui/shared";
export default function SettingsWorkspace() {
  const result = useData("/settings");
  const loyalty = useData("/loyalty/settings");
  return <Notice {...result} retry={result.refresh}><Notice {...loyalty} retry={loyalty.refresh}>{result.data && loyalty.data && <SettingsForm initial={result.data} initialLoyalty={loyalty.data} />}</Notice></Notice>;
}
function SettingsForm({ initial, initialLoyalty }) {
  return <SettingsAdministration initial={initial} initialLoyalty={initialLoyalty} />;
/*
  const [form, setForm] = useState(() => ({
    ...initial,
    paymentMethods: initial.paymentMethods.filter((m) => m !== "Other"),
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    if (!form.businessName?.trim() && !form.logo) {
      setError("Add a business name or receipt logo");
      return;
    }
    setPending(true);
    setError("");
    const { _id, createdAt, updatedAt, __v, ...input } = form;
    try {
      await api("/settings", { method: "PATCH", body: input });
      toast.success("Settings saved");
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  function field(key, label, type = "text", props = {}) {
    return (
      <Field
        key={key}
        label={label}
        type={type}
        value={form[key]}
        onChange={(e) =>
          set(key, type === "number" ? Number(e.target.value) : e.target.value)
        }
        {...props}
      />
    );
  }
  function toggle(key, label) {
    return (
      <label key={key} className="check-line">
        <input
          type="checkbox"
          checked={form[key]}
          onChange={(e) => set(key, e.target.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error("Choose a PNG, JPEG or WebP image");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logo", reader.result);
    reader.readAsDataURL(file);
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="settings-grid">
        <section className="panel">
          <h2>Business information</h2>
          {field("businessName", "Business name (optional with logo)", "text", {
            maxLength: 100,
          })}
          <p className="muted">
            Add a business name or receipt logo. Either one is enough.
          </p>
          {field("address", "Address", "text", { maxLength: 300 })}
          <div className="field-grid">
            {field("phone", "Phone", "tel", { maxLength: 30 })}
            {field("email", "Email", "email")}
          </div>
          <div className="field-grid">
            {field("gstin", "GSTIN (optional)")}
            <Field label="Currency">
              <select
                value={form.currency}
                onChange={(e) => set("currency", e.target.value)}
              >
                <option>INR</option>
              </select>
            </Field>
          </div>
          <Field label="Receipt logo (PNG, JPEG or WebP)">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={upload}
            />
          </Field>
          {form.logo && (
            <div className="logo-preview">
              <img
                src={form.logo}
                alt="Business logo preview"
                width="64"
                height="64"
              />
              <button
                type="button"
                className="text-button"
                onClick={() => set("logo", "")}
              >
                Remove logo
              </button>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Invoice & printing</h2>
          <div className="field-grid">
            {field("invoicePrefix", "Invoice prefix", "text", {
              required: true,
              maxLength: 12,
            })}
            {field("startingNumber", "Starting number", "number", {
              required: true,
              min: 1,
              max: 999999999,
              step: 1,
            })}
          </div>
          {field("receiptFooter", "Receipt footer", "text", { maxLength: 300 })}
          <Field label="Receipt size">
            <select
              value={form.receiptSize}
              onChange={(e) => set("receiptSize", e.target.value)}
            >
              <option>80mm</option>
              <option>58mm</option>
            </select>
          </Field>
          <p className="muted">
            Saved receipts retain the business details and prices recorded at
            checkout.
          </p>
          <h2>Payment methods</h2>
          {["Cash", "UPI", "Card"].map((m) => (
            <label className="check-line" key={m}>
              <input
                type="checkbox"
                checked={form.paymentMethods.includes(m)}
                onChange={(e) =>
                  set(
                    "paymentMethods",
                    e.target.checked
                      ? [...form.paymentMethods, m]
                      : form.paymentMethods.filter((p) => p !== m),
                  )
                }
              />
              <span>{m === "UPI" ? "GPay / UPI" : m}</span>
            </label>
          ))}
        </section>
        <section className="panel">
          <h2>Cashier permissions</h2>
          {toggle("allowCashierDiscount", "Allow cashier discounts")}
          {field(
            "maxCashierDiscount",
            "Maximum cashier discount (%)",
            "number",
            { min: 0, max: 100, step: 0.01, required: true },
          )}
          {toggle("allowCashierExpenses", "Allow cashier expense creation")}
          {toggle(
            "allowCashierDayClosing",
            "Allow cashier day opening / closing",
          )}
          <p className="muted">
            Users, product management, reports, and sensitive settings remain
            administrator-only.
          </p>
        </section>
        <section className="panel">
          <h2>Tax</h2>
          {toggle("gstEnabled", "Enable GST")}
          {field("taxRate", "GST rate (%)", "number", {
            min: 0,
            max: 100,
            step: 0.01,
            required: true,
          })}
          <p className="muted">
            When enabled, GST is added to the bill after discounts. Prices are
            tax-exclusive.
          </p>
        </section>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="settings-save">
        <button className="button primary" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
*/}
