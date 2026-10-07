"use client";

import { MemberCopyValue, MemberCopyElement, MemberCopyText } from "@/components/member/MemberCenterCopyProvider";

import { useId, useState } from "react";

import {
  formatTaipeiDate,
  formatTaipeiDateTime,
  type RewardWaitingExplanation,
} from "@/lib/memberRewardPresentation";

import styles from "./MemberReferralExperience.module.css";

export default function RewardWaitingDisclosure({
  explanation,
}: {
  explanation: RewardWaitingExplanation | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const generatedId = useId();
  const panelId = `reward-waiting-explanation-${generatedId.replaceAll(":", "")}`;
  if (!explanation || !["safety_wait", "due"].includes(explanation.state)) return null;

  const completedAt = explanation.completedAt
    ? explanation.completedAt.includes("T")
      ? formatTaipeiDateTime(explanation.completedAt)
      : formatTaipeiDate(explanation.completedAt)
    : "歷史時間未記錄";

  return (
    <div className={styles.rewardWaitingDisclosure}>
      <MemberCopyElement as="button"
        type="button"
        className={styles.rewardWaitingToggle}
        aria-label="查看安全等待說明"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      ><MemberCopyText copyKey="member.rewards.label.9b6c1b038a" /><span aria-hidden="true">{open ? "∨" : "〉"}</span>
      </MemberCopyElement>
      <div id={panelId} className={styles.rewardWaitingPanel} hidden={!open}>
        <p><MemberCopyText copyKey="member.rewards.label.ec6226ad10" /></p>
        <p><MemberCopyText copyKey="member.rewards.reward.afccb6ad2c" /></p>
        <p><MemberCopyText copyKey="member.rewards.reward.e44effcabf" /></p>
        <dl>
          <div><dt><MemberCopyText copyKey="member.rewards.label.363cb82ec7" /></dt><dd>{completedAt}</dd></div>
          {explanation.exactDayBreakdownAvailable ? (
            <>
              <div><dt><MemberCopyText copyKey="member.rewards.reward.4925fe0641" /></dt><dd>{explanation.baseWaitingDays}<MemberCopyText copyKey="member.subscription.label.c3304d1e49" /></dd></div>
              <div><dt><MemberCopyText copyKey="member.rewards.label.6c6d2b4aae" /></dt><dd>{explanation.returnProtectionDays}<MemberCopyText copyKey="member.subscription.label.c3304d1e49" /></dd></div>
            </>
          ) : (
            <div><dt><MemberCopyText copyKey="member.rewards.reward.a11162e104" /></dt><dd><MemberCopyText copyKey="member.rewards.reward.d20644062a" /></dd></div>
          )}
          <div><dt><MemberCopyText copyKey="member.rewards.reward.a1b04f9a8b" /></dt><dd><MemberCopyValue value={explanation.projectedReleaseDate ? formatTaipeiDate(explanation.projectedReleaseDate) : "入帳日期確認中"} /></dd></div>
        </dl>
      </div>
    </div>
  );
}
