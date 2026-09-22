export type DeliveryAddress = {
  recipientName: string;
  phone: string;
  postalCode: string;
  city: string;
  district: string;
  addressLine: string;
};

const LIMITS: Record<keyof DeliveryAddress, number> = {
  recipientName: 40,
  phone: 20,
  postalCode: 6,
  city: 20,
  district: 30,
  addressLine: 120,
};

const LABELS: Record<keyof DeliveryAddress, string> = {
  recipientName: "收件人姓名",
  phone: "手機／聯絡電話",
  postalCode: "郵遞區號",
  city: "縣市",
  district: "區／鄉鎮市",
  addressLine: "詳細地址",
};

export function validateDeliveryAddress(value: unknown): DeliveryAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("請填寫完整宅配地址");
  const source = value as Record<string, unknown>;
  const address = {} as DeliveryAddress;
  for (const key of Object.keys(LIMITS) as Array<keyof DeliveryAddress>) {
    const raw = source[key];
    if (typeof raw !== "string" || !raw.trim()) throw new Error(`請填寫${LABELS[key]}`);
    const trimmed = raw.trim();
    if (trimmed.length > LIMITS[key]) throw new Error(`${LABELS[key]}過長`);
    address[key] = trimmed;
  }
  if (!/^(?:09\d{8}|0[2-8]\d{7,8})$/.test(address.phone)) throw new Error("宅配聯絡電話格式不正確");
  if (!/^\d{3}(?:\d{2,3})?$/.test(address.postalCode)) throw new Error("郵遞區號格式不正確");
  return address;
}

export function validateOrderDeliverySelection(input: { orderMode: string; store?: unknown; studioPickup?: unknown; deliveryAddress?: unknown; paymentMethod?: unknown }) {
  if (input.orderMode !== "home_delivery") {
    if (input.deliveryAddress != null) throw new Error("此配送方式不可填寫宅配地址");
    return { deliveryAddress: null, paymentMethod: null };
  }
  if (input.store != null || input.studioPickup != null) throw new Error("宅配不可同時指定門市或工作室自取");
  const deliveryAddress = validateDeliveryAddress(input.deliveryAddress);
  if (input.paymentMethod !== "atm_transfer" && input.paymentMethod !== "cash_on_delivery") throw new Error("請選擇可用的宅配付款方式");
  return { deliveryAddress, paymentMethod: input.paymentMethod };
}
