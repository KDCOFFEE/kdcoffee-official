export type GeneralCheckoutMode = "studio_pickup" | "711_cod" | "home_delivery";

export function generalCheckoutShipping(input: {
  mode: GeneralCheckoutMode;
  subtotal: number;
  homeDeliveryShippingFee?: number;
  member?: boolean;
  date?: string;
  openingYearFreeShipping?: { enabled: boolean; startDate: string; endDate: string; shippingMethods: string[] };
}) {
  if (input.mode === "studio_pickup") return 0;
  if (input.mode === "711_cod") return input.subtotal < 1500 ? 60 : 0;
  const campaign = input.openingYearFreeShipping;
  if (input.member && input.date && campaign?.enabled && campaign.startDate && campaign.endDate &&
    input.date >= campaign.startDate && input.date <= campaign.endDate && campaign.shippingMethods.includes("home_delivery")) return 0;
  return Number.isSafeInteger(input.homeDeliveryShippingFee) && input.homeDeliveryShippingFee! >= 0
    ? input.homeDeliveryShippingFee!
    : 100;
}
