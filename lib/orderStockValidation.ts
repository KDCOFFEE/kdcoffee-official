type SkuIdentity = {
  id?: unknown;
  label?: unknown;
};

export type SkuDemandLine = {
  skuId: unknown;
  productName: string;
  optionLabel: string;
  stock: unknown;
  quantity: number;
};

export type AggregatedSkuDemand = {
  skuId: string;
  productName: string;
  optionLabel: string;
  stock: number;
  required: number;
};

export function resolveSkuOption<T extends SkuIdentity>(
  source: readonly T[],
  requestedOptionId: unknown,
  requestedOptionLabel: unknown,
) {
  const optionId = typeof requestedOptionId === "string" ? requestedOptionId.trim() : "";
  if (optionId) return source.find((entry) => entry.id === optionId);

  const optionLabel = String(requestedOptionLabel ?? "").trim();
  if (!optionLabel) return undefined;
  const labelMatches = source.filter((entry) => entry.label === optionLabel);
  return labelMatches.length === 1 ? labelMatches[0] : undefined;
}

function stockDataError(line: SkuDemandLine) {
  return new Error(`「${line.productName}｜${line.optionLabel}」庫存資料異常，請稍後再試或聯絡 KD Coffee。`);
}

export function validateSkuDemand(lines: readonly SkuDemandLine[]) {
  const demandBySku = new Map<string, AggregatedSkuDemand>();

  for (const line of lines) {
    if (typeof line.skuId !== "string" || !line.skuId.trim()) throw stockDataError(line);
    if (typeof line.stock !== "number" || !Number.isInteger(line.stock) || line.stock < 0) throw stockDataError(line);

    const existing = demandBySku.get(line.skuId);
    if (existing) {
      if (existing.stock !== line.stock) throw stockDataError(line);
      existing.required += line.quantity;
    } else {
      demandBySku.set(line.skuId, {
        skuId: line.skuId,
        productName: line.productName,
        optionLabel: line.optionLabel,
        stock: line.stock,
        required: line.quantity,
      });
    }
  }

  for (const demand of demandBySku.values()) {
    if (demand.required > demand.stock) {
      throw new Error(`「${demand.productName}｜${demand.optionLabel}」庫存不足，目前剩餘 ${demand.stock}，您需要 ${demand.required}。`);
    }
  }

  return [...demandBySku.values()];
}
