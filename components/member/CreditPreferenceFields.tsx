"use client";
import { MemberCopyText } from "./MemberCenterCopyProvider";
import type { SubscriptionCreditPreference } from "@/lib/subscriptionCreditPreference";

export default function CreditPreferenceFields({ value, onChange, disabled = false }: {
  value: SubscriptionCreditPreference; onChange: (value: SubscriptionCreditPreference) => void; disabled?: boolean;
}) {
  return <div className="subscription-enrollment-fields credit-preference-fields">
    <label><MemberCopyText copyKey="member.rewards.storeCredit.title" />
      <select value={value.mode} disabled={disabled} onChange={(event) => onChange(event.target.value === "fixed" ? { mode: "fixed", amount: 1 } : { mode: event.target.value as "off" | "maximum" })}>
        <option value="off"><MemberCopyText copyKey="credit.subscription.off" /></option>
        <option value="maximum"><MemberCopyText copyKey="credit.subscription.maximum" /></option>
        <option value="fixed"><MemberCopyText copyKey="credit.subscription.fixed" /></option>
      </select>
    </label>
    {value.mode === "fixed" && <label><MemberCopyText copyKey="credit.subscription.amount" />
      <input type="number" min={1} max={100000000} step={1} value={value.amount} disabled={disabled} onChange={(event) => onChange({ mode: "fixed", amount: Number(event.target.value) })} />
    </label>}
  </div>;
}
