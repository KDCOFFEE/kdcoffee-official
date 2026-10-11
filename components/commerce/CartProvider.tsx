"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  cartLineKey, cartInventoryKey, cartInventoryLimit, cartQuantity, validateUnifiedCartItem,
  mergeCartLines, coffeeRoastEligible, isCoffeeRoastSku, validateCoffeeOptions,
  cartCheckoutEligibility, coffeeCheckoutItems, isCartRecord, assertCartFields,
} from "@/lib/commerceCart";
import type { UnifiedCartItem, CoffeeCheckoutItem, CheckoutEligibility, CartMigrationState, MigrationIssue, MigrationNotice } from "@/lib/commerceCart";
import { readCartStorage, validateCartEnvelope, writeCartEnvelope } from "@/lib/commerceCartStorage";
import type { CartEnvelope } from "@/lib/commerceCartStorage";

export type CartItem = UnifiedCartItem;
type CartAddition = Omit<Extract<UnifiedCartItem, { domain: "coffee" }>, "quantity">
  | Omit<Extract<UnifiedCartItem, { domain: "store" }>, "quantity">;
export type CartContextValue = {
  items: UnifiedCartItem[]; count: number; subtotal: number; ready: boolean;
  addItem: (item: CartAddition, quantity?: number) => number;
  updateQuantity: (key: string, quantity: number) => boolean;
  removeItem: (key: string) => void;
  updateCustomRoast: (key: string, config: { enabled: boolean; roastLevel?: string; roastNote?: string }) => boolean;
  clearCart: () => void;
  migrationState: CartMigrationState;
  unresolved: MigrationIssue[]; notices: MigrationNotice[];
  persistenceWarning: boolean;
  checkoutEligibility: CheckoutEligibility;
  retryMigration: () => Promise<void>;
  discardUnresolved: () => void;
  getCoffeeCheckoutItems: () => CoffeeCheckoutItem[];
};
const CartContext = createContext<CartContextValue | null>(null);
// Compatibility names now reference the foundation functions, never slug-based keys.
export const cartItemKey = cartLineKey;
export const cartSkuKey = cartInventoryKey;

function emptyEnvelope(): CartEnvelope {
  return { version: 16, items: [], migration: { completed: true, unresolved: [], notices: [] } };
}
type ProviderState = { envelope: CartEnvelope; migrationState: CartMigrationState; persistenceWarning: boolean };

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProviderState>({
    envelope: emptyEnvelope(), migrationState: "PENDING", persistenceWarning: false,
  });
  const current = useRef(state);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  // A failed write/readback retries this same resolved envelope, never an unverified storage value.
  const pendingMigration = useRef<CartEnvelope | null>(null);
  const publish = useCallback((next: ProviderState) => { current.current = next; setState(next); }, []);

  const hydrate = useCallback(async () => {
    if (current.current.migrationState === "READY") {
      let ok = false;
      try { ok = writeCartEnvelope(window.localStorage, current.current.envelope, { removeLegacy: false }).ok; } catch {}
      publish({ ...current.current, persistenceWarning: !ok });
      return;
    }
    const attempt = ++epoch.current;
    controller.current?.abort();
    controller.current = new AbortController();
    publish({ ...current.current, migrationState: "PENDING" });
    try {
      const storage = window.localStorage;
      let envelope = pendingMigration.current;
      if (!envelope) {
        const saved = readCartStorage(storage);
        if (saved.kind === "invalid") throw new Error("Cart storage unavailable");
        if (saved.kind === "current") {
          envelope = { ...saved.envelope, items: mergeCartLines(saved.envelope.items) };
          if (attempt === epoch.current) publish({ envelope, migrationState: "READY", persistenceWarning: false });
          return; // Valid v16, including completed empty carts, never calls legacy resolution.
        }
        if (saved.kind === "empty") envelope = emptyEnvelope();
        else {
          const response = await fetch("/api/commerce/cart/resolve", {
            method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
            body: JSON.stringify({ sourceKey: saved.sourceKey, items: saved.items }),
            signal: controller.current.signal,
          });
          if (!response.ok) throw new Error("Legacy resolution unavailable");
          const result: unknown = await response.json();
          if (!isCartRecord(result)) throw new Error("Invalid resolution");
          assertCartFields(result, ["version", "sourceKey", "items", "unresolved", "notices"]);
          if (result.sourceKey !== saved.sourceKey) throw new Error("Invalid resolution source");
          envelope = validateCartEnvelope({
            version: result.version, items: result.items,
            migration: { completed: true, sourceKey: result.sourceKey, unresolved: result.unresolved, notices: result.notices },
          });
          if (envelope.items.some(item => item.domain !== "coffee")) throw new Error("Invalid legacy domain");
          envelope = { ...envelope, items: mergeCartLines(envelope.items) };
        }
      }
      if (attempt !== epoch.current) return;
      pendingMigration.current = envelope;
      const written = writeCartEnvelope(storage, envelope);
      if (!written.ok) throw new Error("Cart migration persistence failed");
      pendingMigration.current = null;
      publish({ envelope, migrationState: "READY", persistenceWarning: false });
    } catch {
      if (attempt === epoch.current) publish({ ...current.current, migrationState: "FAILED" });
    }
  }, [publish]);

  useEffect(() => {
    void hydrate();
    return () => { ++epoch.current; controller.current?.abort(); };
  }, [hydrate]);

  function commit(envelope: CartEnvelope): boolean {
    if (current.current.migrationState !== "READY") return false;
    let checked: CartEnvelope;
    try { checked = validateCartEnvelope({ ...envelope, items: mergeCartLines(envelope.items) }); } catch { return false; }
    let persisted = false;
    try { persisted = writeCartEnvelope(window.localStorage, checked, { removeLegacy: false }).ok; } catch {}
    // Keep a safe in-memory cart, surface failed persistence and block checkout until retry.
    publish({ envelope: checked, migrationState: "READY", persistenceWarning: !persisted });
    return true;
  }

  const value = useMemo<CartContextValue>(() => {
    const items = state.envelope.items;
    const eligibility = () => cartCheckoutEligibility(current.current.envelope.items,
      current.current.migrationState, current.current.envelope.migration.unresolved, current.current.persistenceWarning);
    return {
      items, ready: state.migrationState === "READY",
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      migrationState: state.migrationState, unresolved: state.envelope.migration.unresolved,
      notices: state.envelope.migration.notices, persistenceWarning: state.persistenceWarning,
      checkoutEligibility: cartCheckoutEligibility(items, state.migrationState,
        state.envelope.migration.unresolved, state.persistenceWarning),
      retryMigration: hydrate,
      discardUnresolved: () => commit({ ...current.current.envelope,
        migration: { ...current.current.envelope.migration, unresolved: [] } }),
      getCoffeeCheckoutItems: () => {
        if (eligibility() !== "ELIGIBLE") throw new Error("Cart is not eligible for coffee checkout");
        return coffeeCheckoutItems(current.current.envelope.items);
      },
      addItem: (raw, quantity = 1) => {
        if (current.current.migrationState !== "READY") return 0;
        try {
          const requestedQuantity = cartQuantity(quantity);
          const item = validateUnifiedCartItem({ ...raw, quantity: requestedQuantity });
          const existing = current.current.envelope.items;
          const inventoryKey = cartInventoryKey(item);
          const existingSkuQuantity = existing.reduce((sum, entry) => sum + (cartInventoryKey(entry) === inventoryKey ? entry.quantity : 0), 0);
          const capacity = Math.max(0, cartInventoryLimit(existing, item) - existingSkuQuantity);
          const safeQuantity = Math.min(requestedQuantity, capacity);
          if (safeQuantity <= 0) return 0;
          const candidate = validateUnifiedCartItem({ ...item, quantity: safeQuantity });
          if (candidate.domain === "coffee" && candidate.coffeeOptions.customRoast && !coffeeRoastEligible(candidate)) return 0;
          const next = mergeCartLines([...existing, candidate]);
          return commit({ ...current.current.envelope, items: next }) ? safeQuantity : 0;
        } catch { return 0; }
      },
      updateQuantity: (key, quantity) => {
        if (current.current.migrationState !== "READY") return false;
        try {
          const requestedQuantity = cartQuantity(quantity);
          const existing = current.current.envelope.items;
          const target = existing.find(item => cartLineKey(item) === key);
          if (!target) return false;
          const otherSkuQuantity = existing.reduce((sum, entry) => sum + (
            cartLineKey(entry) !== key && cartInventoryKey(entry) === cartInventoryKey(target) ? entry.quantity : 0), 0);
          const maxForThisLine = Math.max(0, cartInventoryLimit(existing, target) - otherSkuQuantity);
          const safeQuantity = Math.min(requestedQuantity, maxForThisLine);
          if (safeQuantity <= 0) return false; // Retain unavailable line; never manufacture quantity one.
          return commit({ ...current.current.envelope, items: existing.map(item =>
            cartLineKey(item) === key ? { ...item, quantity: safeQuantity } : item) });
        } catch { return false; }
      },
      removeItem: key => commit({ ...current.current.envelope,
        items: current.current.envelope.items.filter(item => cartLineKey(item) !== key) }),
      updateCustomRoast: (key, config) => {
        const existing = current.current.envelope.items;
        const target = existing.find(item => cartLineKey(item) === key);
        if (!target || target.domain !== "coffee" || typeof config.enabled !== "boolean") return false;
        if (config.enabled && (!isCoffeeRoastSku(target) || (!target.coffeeOptions.customRoast && !coffeeRoastEligible(target)))) return false;
        try {
          const selection = validateCoffeeOptions(config.enabled ? {
            ...target.coffeeOptions, customRoast: true,
            roastLevel: config.roastLevel ?? target.coffeeOptions.roastLevel,
            ...(config.roastNote !== undefined ? { roastNote: config.roastNote } : {}),
          } : { ...(target.coffeeOptions.preparation ? { preparation: target.coffeeOptions.preparation } : {}), customRoast: false });
          // Changed keys are merged only after preserving/normalizing the customer's note.
          return commit({ ...current.current.envelope, items: existing.map(item =>
            cartLineKey(item) === key ? { ...target, coffeeOptions: selection } : item) });
        } catch { return false; }
      },
      clearCart: () => commit({ ...current.current.envelope, items: [],
        migration: { ...current.current.envelope.migration, unresolved: [], notices: [] } }),
    };
  }, [state, hydrate]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
