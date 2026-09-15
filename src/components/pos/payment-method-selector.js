import { Check } from "lucide-react";
export default function PaymentMethodSelector({
  methods,
  payment,
  setPayment,
}) {
  return (
    <div>
      <span className="mb-2 block text-xs font-medium text-[#6a756c]">
        Payment Method
      </span>
      <div
        className="grid grid-flow-col auto-cols-fr gap-2"
        role="group"
        aria-label="Payment method"
      >
        {methods.map((method) => (
          <button
            type="button"
            key={method}
            aria-pressed={method === payment}
            className={`flex min-h-11 items-center justify-center gap-1 rounded-lg border text-xs transition-colors duration-150 ${method === payment ? "border-[#245b3a] bg-[#245b3a] text-white" : "border-[#dfe6d9] bg-white text-[#445248] hover:bg-[#eaf2e5]"}`}
            onClick={() => setPayment(method)}
          >
            {method === payment && <Check size={13} aria-hidden="true" />}
            {method}
          </button>
        ))}
      </div>
    </div>
  );
}
