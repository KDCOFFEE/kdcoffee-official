"use client";
import { useState } from "react";
import CreditPreferenceFields from "./CreditPreferenceFields";
import { MemberCopyText } from "./MemberCenterCopyProvider";
import type { SubscriptionCreditPreference } from "@/lib/subscriptionCreditPreference";

export default function SubscriptionCreditEditor({ initial, disabled, onSave }: {
  initial?: SubscriptionCreditPreference; disabled: boolean;
  onSave: (preference: SubscriptionCreditPreference) => Promise<unknown>;
}) {
  const [value, setValue] = useState<SubscriptionCreditPreference>(initial ?? { mode: "off" });
  const invalid = value.mode === "fixed" && (!Number.isSafeInteger(value.amount) || value.amount < 1 || value.amount > 100000000);
  return <section className="member-action-panel">
    <CreditPreferenceFields value={value} onChange={setValue} disabled={disabled} />
    <button type="button" disabled={disabled || invalid} onClick={() => void onSave(value)}><MemberCopyText copyKey="credit.subscription.save" /></button>
  </section>;
}
