"use client";
import { createContext, useContext, useState } from "react";
import { cents, money } from "@/lib/calculations";
import { addCartItem } from "@/lib/cart";
const CartContext = createContext(null);
export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState({ type: "fixed", value: 0 });
  function addItem(item) {
    const incoming = {
      ...item,
      key: crypto.randomUUID(),
      quantity: Math.max(1, Math.min(999, item.quantity || 1)),
      note: item.note || "",
    };
    setItems((current) => addCartItem(current, incoming));
  }
  function removeItem(key) {
    setItems((current) => current.filter((item) => item.key !== key));
  }
  function quantity(key, change) {
    setItems((current) =>
      current.map((item) =>
        item.key === key
          ? {
              ...item,
              quantity: Math.max(1, Math.min(999, item.quantity + change)),
            }
          : item,
      ),
    );
  }
  function note(key, value) {
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, note: value } : item,
      ),
    );
  }
  function clearCart() {
    setItems([]);
    setDiscount({ type: "fixed", value: 0 });
  }
  const calculateSubtotal = () =>
    money(
      items.reduce(
        (sum, item) => sum + cents(item.unitTotal) * item.quantity,
        0,
      ),
    );
  const calculateDiscount = () =>
    discount.type === "percentage"
      ? money(Math.round((cents(calculateSubtotal()) * discount.value) / 100))
      : discount.value;
  const calculateTotal = () =>
    money(cents(calculateSubtotal()) - cents(calculateDiscount()));
  return (
    <CartContext.Provider
      value={{
        items,
        discount,
        setDiscount,
        addItem,
        removeItem,
        increaseQuantity: (key) => quantity(key, 1),
        decreaseQuantity: (key) => quantity(key, -1),
        clearCart,
        setNote: note,
        calculateSubtotal,
        calculateDiscount,
        calculateTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
export const useCart = () => useContext(CartContext);
