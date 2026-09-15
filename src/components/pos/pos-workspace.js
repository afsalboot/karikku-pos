"use client";
import { useRef, useState } from "react";
import { ShoppingBasket, ArrowDown } from "lucide-react";
import ProductBrowser from "./product-browser";
import CartPanel from "./cart-panel";
import PaymentModal from "./payment-modal";
import DuplicateSaleModal from "./duplicate-sale-modal";
import { toast } from "sonner";
import { CartProvider, useCart } from "@/context/CartContext";
import { useAuth } from "@/components/layout/app-shell";
import { useDebounce } from "@/hooks/useData";
import { useOfflineProducts } from "@/hooks/useOfflineProducts";
import { api, formatCurrency } from "@/lib/client";
import { calculateTotals, cents, money } from "@/lib/calculations";
import { PageHeading, ConfirmModal } from "@/components/ui/shared";
import Modal from "@/components/modal";
import { ReceiptModal, AutomaticReceiptPrint } from "@/components/sales/receipt";
import { settingsWithDefaults } from "@/lib/settings-config";
import { customerSchema } from "@/lib/validation";
export default function PosWorkspace({ duplicateId }) {
  return (
    <CartProvider>
      <Pos duplicateId={duplicateId} />
    </CartProvider>
  );
}
function Pos({ duplicateId }) {
  const { user, settings } = useAuth();
  const preferences = settingsWithDefaults(settings).checkout;
  const [printSale, setPrintSale] = useState(null);
  const cart = useCart();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [configure, setConfigure] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(Boolean(duplicateId));
  const requestId = useRef(null);
  const lock = useRef(false);
  const products = useOfflineProducts({
    query: debouncedQuery,
    category,
    page,
    limit: 40,
  });
  const categories = products.categories;
  let totals = null,
    calculationError = "";
  try {
    totals = calculateTotals(
      cart.items.map((item) => ({
        lineTotal: money(cents(item.unitTotal) * item.quantity),
      })),
      cart.discount,
      settings,
      user,
    );
  } catch (error) {
    calculationError = error.message;
  }
  function add(product, variant, addons = []) {
    cart.addItem({
      quantity: preferences.defaultQuantity,
      productId: product._id,
      name: product.name,
      imageUrl: product.imageUrl || "",
      categoryName: product.categoryId?.name || "",
      variantId: variant?._id || null,
      variantName: variant?.name || "",
      addonIds: addons.map((a) => a._id),
      addonNames: addons.map((a) => a.name),
      unitTotal: money(
        cents(variant?.price ?? product.basePrice) +
          addons.reduce((sum, a) => sum + cents(a.price), 0),
      ),
    });
    setConfigure(null);
  }
  function select(product) {
    if (product.variantsEnabled || product.addonsEnabled) setConfigure(product);
    else add(product);
  }
  async function checkout(paymentData) {
    if (lock.current || !cart.items.length || !paymentData || !totals) return;
    const hasCustomer = preferences.customerPrompt !== "NEVER" && Boolean(customer.name.trim() || customer.phone.trim());
    if (preferences.customerPrompt === "REQUIRED" && !hasCustomer) {setPaymentError("Customer details are required at checkout");return;}
    const parsedCustomer = hasCustomer
      ? customerSchema.safeParse(customer)
      : null;
    if (parsedCustomer && !parsedCustomer.success) {
      setPaymentError(parsedCustomer.error.issues[0].message);
      return;
    }
    lock.current = true;
    setPending(true);
    setPaymentError("");
    requestId.current ||= crypto.randomUUID();
    try {
      const sale = await api("/sales", {
        method: "POST",
        body: {
          requestId: requestId.current,
          items: cart.items.map(
            ({ productId, variantId, addonIds, quantity, note }) => ({
              productId,
              variantId,
              addonIds,
              quantity,
              note,
            }),
          ),
          discount: cart.discount,
          ...paymentData,
          ...(parsedCustomer ? { customer: parsedCustomer.data } : {}),
        },
      });
      setPaymentOpen(false);
      if (preferences.showSuccess) setSuccess(sale);
      else {
        toast.success("Sale completed successfully");
        if(preferences.autoPrint) setPrintSale(sale);
        if(preferences.returnToNewSale) reset();
        else setCustomer({name:"",phone:""});
      }
      cart.clearCart();
      requestId.current = null;
    } catch (error) {
      setPaymentError(error.message);
      toast.error(error.message);
    } finally {
      setPending(false);
      lock.current = false;
    }
  }
  function reset() {
    cart.clearCart();
    setSuccess(null);
    setQuery("");
    setCategory("");
    setPage(1);

    setCustomer({ name: "", phone: "" });
    setPaymentOpen(false);
    setPaymentError("");
    requestId.current = null;
  }
  return (
    <div className="pos-workspace pb-20 lg:pb-0">
      <PageHeading title="New Sale" description="Fresh picks. Fast checkout." />
      <div className="pos-layout grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] min-[1400px]:grid-cols-[minmax(0,1fr)_390px]">
        <ProductBrowser
          products={products}
          categories={categories}
          query={query}
          setQuery={setQuery}
          category={category}
          setCategory={setCategory}
          page={page}
          setPage={setPage}
          pending={pending}
          select={select}
          items={cart.items}
        />
        <CartPanel
          cart={cart}
          user={user}
          settings={settings}
          pending={pending}
          totals={totals}
          calculationError={calculationError}
          onProceed={() => {
            setPaymentError("");
            setPaymentOpen(true);
          }}
          onClear={() => setClearing(true)}
        />
      </div>
      <button
        type="button"
        className="pos-mobile-summary fixed bottom-4 left-4 right-4 z-20 flex min-h-12 items-center justify-between rounded-xl bg-[#245b3a] px-4 text-sm font-semibold text-white shadow-lg lg:hidden"
        onClick={() => {
          const panel = document.getElementById("current-sale");
          panel?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "instant"
              : "smooth",
            block: "start",
          });
          panel?.focus({ preventScroll: true });
        }}
      >
        <span className="flex items-center gap-2">
          <ShoppingBasket size={18} />
          {cart.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
          {cart.items.reduce((sum, item) => sum + item.quantity, 0) === 1
            ? "item"
            : "items"}{" "}
          · {formatCurrency(totals?.total)}
        </span>
        <span className="flex items-center gap-1">
          View cart
          <ArrowDown size={16} />
        </span>
      </button>
      {configure && (
        <ConfigureProduct
          product={configure}
          onClose={() => setConfigure(null)}
          onAdd={(variant, addons) => add(configure, variant, addons)}
        />
      )}
      {duplicateOpen && (
        <DuplicateSaleModal
          id={duplicateId}
          onClose={() => setDuplicateOpen(false)}
          onUse={({ sale, items }) => {
            cart.clearCart();
            items.forEach((item) => cart.addItem(item));
            setCustomer(
              sale.customer
                ? { name: sale.customer.name, phone: sale.customer.phone }
                : { name: "", phone: "" },
            );

            requestId.current = null;
            setDuplicateOpen(false);
          }}
        />
      )}
      {paymentOpen && (
        <PaymentModal
          checkoutSettings={{...preferences,upiId:settings.upiId}}
          customer={customer}
          setCustomer={setCustomer}
          cart={cart}
          totals={totals}
          methods={settings.paymentMethods}
          loyaltyEnabled={settings.loyaltyEnabled && preferences.customerPrompt !== "NEVER"}
          pending={pending}
          error={paymentError || calculationError}
          onPay={checkout}
          onClose={() => {
            if (!lock.current) setPaymentOpen(false);
          }}
        />
      )}
      {success && <ReceiptModal success sale={success} autoPrint={preferences.autoPrint} onClose={()=>{if(preferences.returnToNewSale)reset();else {setSuccess(null);setCustomer({name:"",phone:""});}}} />}
      {printSale && <AutomaticReceiptPrint sale={printSale} onDone={()=>setPrintSale(null)}/>}
      {clearing && (
        <ConfirmModal
          title="Clear cart"
          message="Remove all items from this sale?"
          onClose={() => setClearing(false)}
          onConfirm={() => {
            cart.clearCart();
            setClearing(false);
          }}
        />
      )}
    </div>
  );
}
function ConfigureProduct({ product, onClose, onAdd }) {
  const [variantId, setVariantId] = useState(
    product.variants.length === 1 ? product.variants[0]._id : "",
  );
  const [addonIds, setAddonIds] = useState([]);
  const variant = product.variants.find((v) => v._id === variantId);
  const addons = product.addons.filter((a) => addonIds.includes(a._id));
  return (
    <Modal title={product.name} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(variant, addons);
        }}
      >
        <div className="modal-body">
          {product.variantsEnabled && (
            <label className="field">
              Choose a variant
              <select
                required
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
              >
                <option value="" disabled>
                  Select size or option
                </option>
                {product.variants.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name} — {formatCurrency(v.price)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {product.addonsEnabled && (
            <div className="field">
              Optional add-ons
              {product.addons.map((a) => (
                <label className="check-line" key={a._id}>
                  <input
                    type="checkbox"
                    checked={addonIds.includes(a._id)}
                    onChange={(e) =>
                      setAddonIds(
                        e.target.checked
                          ? [...addonIds, a._id]
                          : addonIds.filter((id) => id !== a._id),
                      )
                    }
                  />
                  <span>{a.name}</span>
                  <strong>+{formatCurrency(a.price)}</strong>
                </label>
              ))}
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">Add to cart</button>
        </footer>
      </form>
    </Modal>
  );
}
