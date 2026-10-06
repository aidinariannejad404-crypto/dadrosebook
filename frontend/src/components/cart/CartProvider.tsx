"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as client from "@/lib/cart-client";
import type { Cart, CartSource } from "@/lib/types";
import { CheckIcon } from "@/components/ui/Icons";

interface CartContextValue {
  /** null until the first fetch finished */
  cart: Cart | null;
  count: number;
  fixtures: boolean;
  add: (variantId: number, quantity?: number, source?: CartSource) => Promise<client.CartResult>;
  update: (itemId: number, quantity: number) => Promise<client.CartResult>;
  /** `silent`: the caller announces it itself (the cart's undo row, ج۴) */
  remove: (itemId: number, opts?: { silent?: boolean }) => Promise<client.CartResult>;
  bulk: (items: { variant_id: number; quantity?: number }[], source?: CartSource) => Promise<client.BulkResult>;
  clear: () => Promise<client.CartResult>;
  refresh: () => Promise<void>;
  /** polite screen-reader + visual announcement */
  announce: (message: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

/**
 * Guest cart state for the whole site (mounted in the root layout). `fixtures` comes from the
 * server (USE_API_FIXTURES is not visible in the browser) and switches the client to its local cart.
 */
export function CartProvider({ fixtures, children }: { fixtures: boolean; children: ReactNode }) {
  // configure before any child handler can call the client
  client.configureCartClient({ fixtures });
  const [cart, setCart] = useState<Cart | null>(null);
  const [message, setMessage] = useState("");
  const [toastKey, setToastKey] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    const r = await client.fetchCart();
    if (r.ok) setCart(r.cart);
    else setCart((c) => c ?? client.emptyCart());
  }, []);

  useEffect(() => {
    void refresh();
    // another tab changed the cart
    const onStorage = (e: StorageEvent) => {
      if (e.key === client.CART_TOKEN_KEY || e.key === "dadrose_cart_fixture") void refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const announce = useCallback((text: string) => {
    setMessage(text);
    setToastKey((k) => k + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(""), 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const apply = useCallback(<R extends client.CartResult>(r: R): R => {
    if (r.ok) setCart(r.cart);
    else if (r.error.cart) setCart(r.error.cart);
    return r;
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      count: cart?.item_count ?? 0,
      fixtures,
      add: async (variantId, quantity = 1, source = "other") => {
        const r = apply(await client.addToCart(variantId, quantity, source));
        if (r.ok) announce("به سبد خرید اضافه شد");
        return r;
      },
      update: async (itemId, quantity) => apply(await client.updateQuantity(itemId, quantity)),
      remove: async (itemId, opts) => {
        const r = apply(await client.removeItem(itemId));
        if (r.ok && !opts?.silent) announce("از سبد خرید حذف شد");
        return r;
      },
      bulk: async (items, source = "other") => {
        const r = await client.bulkAdd(items, source);
        if (r.ok) {
          setCart(r.result.cart);
          if (r.result.added.length) announce("کتاب‌های انتخابی به سبد خرید اضافه شد");
        }
        return r;
      },
      clear: async () => apply(await client.clearCart()),
      refresh,
      announce,
    }),
    [cart, fixtures, apply, announce, refresh],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>
      {message && (
        <div
          key={toastKey}
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-raised"
        >
          <CheckIcon size={18} strokeWidth={2.6} className="shrink-0 text-accent" />
          {message}
        </div>
      )}
    </CartContext.Provider>
  );
}
