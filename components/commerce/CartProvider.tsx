"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isCustomRoastLineEligible } from "@/lib/checkoutRules";

export type CartItem = {
  slug: string;
  name: string;
  optionId?: string;
  optionLabel: string;
  optionDetail: string;
  preparationLabel?: string;
  customRoast?: boolean;
  roastLevel?: string;
  roastNote?: string;
  unitPrice: number;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  ready: boolean;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  updateCustomRoast: (key: string, config: { enabled: boolean; roastLevel?: string; roastNote?: string }) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "kdcoffee-cart-v15";
const LEGACY_KEYS = ["kdcoffee-cart-v13", "kdcoffee-cart-v3", "kdcoffee-cart-v2", "kdcoffee-cart-v1"];

export const cartItemKey = (item: Pick<CartItem, "slug" | "optionId" | "optionLabel" | "preparationLabel" | "customRoast" | "roastLevel">) =>
  `${item.slug}::${item.optionId || item.optionLabel}::${item.preparationLabel || "default"}::${item.customRoast ? item.roastLevel || "custom" : "standard"}`;

function normalizeCartCustomRoast(items: CartItem[]) {
  return items.map((item) => {
    const eligible = isCustomRoastLineEligible(items, item);
    if (item.customRoast === true && eligible) return item;
    return {
      ...item,
      customRoast: false,
      roastLevel: undefined,
      roastNote: undefined,
    };
  });
}

function sanitizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const items = value.flatMap((raw: any) => {
    if (!raw || typeof raw !== "object") return [];
    const slug = String(raw.slug || "").trim();
    const name = String(raw.name || "").trim();
    const optionLabel = String(raw.optionLabel || "").trim();
    const optionDetail = String(raw.optionDetail || "").trim();
    const unitPrice = Number(raw.unitPrice);
    const quantity = Math.max(1, Math.min(99, Number(raw.quantity) || 1));
    if (!slug || !name || !optionLabel || !Number.isFinite(unitPrice) || unitPrice < 0) return [];
    const customRoast = raw.customRoast === true;
    return [{
      slug,
      name,
      optionId: raw.optionId ? String(raw.optionId) : undefined,
      optionLabel,
      optionDetail,
      preparationLabel: raw.preparationLabel ? String(raw.preparationLabel) : undefined,
      customRoast,
      roastLevel: customRoast && raw.roastLevel ? String(raw.roastLevel).slice(0, 30) : undefined,
      roastNote: customRoast && raw.roastNote ? String(raw.roastNote).slice(0, 160) : undefined,
      unitPrice,
      quantity,
    }];
  });
  return normalizeCartCustomRoast(items);
}

function persist(items: CartItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
        const saved = localStorage.getItem(key);
        if (!saved) continue;
        const parsed = sanitizeCart(JSON.parse(saved));
        setItems(parsed);
        persist(parsed);
        LEGACY_KEYS.forEach((legacy) => localStorage.removeItem(legacy));
        break;
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      LEGACY_KEYS.forEach((legacy) => localStorage.removeItem(legacy));
      setItems([]);
    } finally { setReady(true); }
  }, []);

  const value = useMemo<CartContextValue>(() => ({
    items,
    ready,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    addItem: (item, quantity = 1) => {
      setItems((current) => {
        const safeQuantity = Math.max(1, Math.min(99, Number(quantity) || 1));
        const candidate = {
          ...item,
          quantity: safeQuantity,
        };
        const customRoast =
          item.customRoast === true &&
          isCustomRoastLineEligible([...current, candidate], candidate);
        const normalized = {
          ...item,
          customRoast,
          roastLevel: customRoast ? item.roastLevel : undefined,
          roastNote: customRoast ? item.roastNote : undefined,
        };
        const key = cartItemKey(normalized);
        const found = current.find((entry) => cartItemKey(entry) === key);
        const merged = found
          ? current.map((entry) => cartItemKey(entry) === key
            ? { ...entry, quantity: Math.min(99, entry.quantity + safeQuantity) }
            : entry)
          : [...current, { ...normalized, quantity: safeQuantity }];
        const next = normalizeCartCustomRoast(merged);
        persist(next);
        return next;
      });
    },
    updateQuantity: (key, quantity) => {
      setItems((current) => {
        const safeQuantity = Math.max(1, Math.min(99, Number(quantity) || 1));
        const updated = current.map((item) => cartItemKey(item) === key
          ? {
              ...item,
              quantity: safeQuantity,
            }
          : item);
        const next = normalizeCartCustomRoast(updated);
        persist(next);
        return next;
      });
    },
    removeItem: (key) => {
      setItems((current) => {
        const next = normalizeCartCustomRoast(
          current.filter((item) => cartItemKey(item) !== key),
        );
        persist(next);
        return next;
      });
    },
    updateCustomRoast: (key, config) => {
      setItems((current) => {
        const next = current.map((item) => {
          if (cartItemKey(item) !== key) return item;
          const eligible = isCustomRoastLineEligible(current, item);
          if (!eligible || !config.enabled) {
            return { ...item, customRoast: false, roastLevel: undefined, roastNote: undefined };
          }
          return {
            ...item,
            customRoast: true,
            roastLevel: config.roastLevel?.slice(0, 30),
            roastNote: config.roastNote?.slice(0, 160),
          };
        });
        persist(next);
        return next;
      });
    },
    clearCart: () => { persist([]); setItems([]); },
  }), [items, ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
