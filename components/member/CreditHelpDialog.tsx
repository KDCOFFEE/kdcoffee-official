"use client";
import { useEffect, useRef, useState } from "react";
import { MemberCopyText, useMemberCopyKey } from "./MemberCenterCopyProvider";
import type { MembershipBusinessRules } from "@/lib/membershipRuleTypes";
export type CreditDisplayPolicy = {
  maximumOrderPercentEnabled?: boolean;
  maximumOrderPercent: number; appliesToShipping: boolean; allowZeroTotal: boolean;
  redemption: MembershipBusinessRules["credit"]["redemption"];
};

/** One help dialog per surface, shared by ordinary and recurring usage. */
export default function CreditHelpDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [policy, setPolicy] = useState<CreditDisplayPolicy | null>(null);
  const [lockedPolicy, setLockedPolicy] = useState<CreditDisplayPolicy | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = (event?: Event) => {
      setError(false);
      setPolicy(null);
      if (event) setLockedPolicy(event instanceof CustomEvent ? event.detail?.lockedPolicy ?? null : null);
      fetch("/api/commerce/operational-rules", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => { if (active) setPolicy(data.credit); }).catch(() => { if (active) { setPolicy(null); setError(true); } });
    };
    refresh();
    window.addEventListener("kd-credit-help-open", refresh);
    return () => { active = false; window.removeEventListener("kd-credit-help-open", refresh); };
  }, []);
  return <>
    <dialog id="credit-help-dialog" ref={dialog} className="credit-help-dialog" aria-labelledby="credit-help-title" onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.current?.close();
    }}>
      <h2 id="credit-help-title"><MemberCopyText copyKey="credit.help.title" /></h2>
      <h3><MemberCopyText copyKey="credit.help.currentPolicy" /></h3>
      {policy ? <CreditPolicyParagraphs policy={policy} /> : <p><MemberCopyText copyKey={error ? "credit.help.loadError" : "credit.help.loading"} /></p>}
      {lockedPolicy && <section><h3><MemberCopyText copyKey="credit.help.lockedPolicy" /></h3><CreditPolicyParagraphs policy={lockedPolicy} /></section>}
      <p><MemberCopyText copyKey="credit.help.lifecycle" /></p>
      <p><MemberCopyText copyKey="credit.help.subscription" /></p>
      <p><MemberCopyText copyKey="credit.subscription.maximumHint" /></p>
      <p><MemberCopyText copyKey="credit.subscription.persist" /></p>
      <button type="button" onClick={() => dialog.current?.close()}><MemberCopyText copyKey="credit.help.close" /></button>
    </dialog>
  </>;
}

function CreditPolicyParagraphs({ policy }: { policy: CreditDisplayPolicy }) {
  const copy = useMemberCopyKey();
  return <>
    <p><MemberCopyText copyKey={policy.maximumOrderPercentEnabled ? "credit.help.policy" : "credit.help.policyDisabled"} values={{ percent: policy.maximumOrderPercent }} /></p>
    <p><MemberCopyText copyKey={policy.appliesToShipping ? "credit.help.shippingYes" : "credit.help.shippingNo"} /></p>
    {policy.redemption.mode === "minimum-payable" ? <p><MemberCopyText copyKey="credit.help.minimum" values={{ amount: `NT$ ${policy.redemption.amount.toLocaleString("zh-TW")}` }} /></p> : <p><MemberCopyText copyKey="credit.help.other" values={{ policy: policy.redemption.mode === "maximum-fixed" ? copy("credit.help.fixed", { amount: `NT$ ${policy.redemption.amount.toLocaleString("zh-TW")}` }) : policy.redemption.mode === "maximum-percentage" ? copy("credit.help.percentage", { percent: policy.redemption.percent }) : copy("credit.help.unlimited") }} /></p>}
    <p><MemberCopyText copyKey={policy.allowZeroTotal ? "credit.help.zeroYes" : "credit.help.zeroNo"} /></p>
  </>;
}

export function CreditHelpButton({ lockedPolicy }: { lockedPolicy?: CreditDisplayPolicy } = {}) {
  return <button type="button" className="text-link credit-help-trigger" onClick={() => {
    window.dispatchEvent(new CustomEvent("kd-credit-help-open", { detail: { lockedPolicy } }));
    (document.getElementById("credit-help-dialog") as HTMLDialogElement | null)?.showModal();
  }}><MemberCopyText copyKey="credit.help.button" /></button>;
}
