"use client";

import { MemberCopyValue, MemberCopyElement } from "@/components/member/MemberCenterCopyProvider";

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
      ><MemberCopyValue value={"說明 "} /><span aria-hidden="true">{open ? "∨" : "〉"}</span>
      </MemberCopyElement>
      <div id={panelId} className={styles.rewardWaitingPanel} hidden={!open}>
        <p><MemberCopyValue value={"此筆來源訂單已完成取貨。"} /></p>
        <p><MemberCopyValue value={"為保障退貨、取消或其他交易異常的處理期間，這筆回饋會依本筆回饋建立時的規則經過安全等待期。"} /></p>
        <p><MemberCopyValue value={"若等待期間內交易維持正常，回饋將由系統自動入帳，您不需要另外操作。"} /></p>
        <dl>
          <div><dt><MemberCopyValue value={"完成取貨"} /></dt><dd>{completedAt}</dd></div>
          {explanation.exactDayBreakdownAvailable ? (
            <>
              <div><dt><MemberCopyValue value={"基礎等待"} /></dt><dd>{explanation.baseWaitingDays}<MemberCopyValue value={" 天"} /></dd></div>
              <div><dt><MemberCopyValue value={"退貨保護"} /></dt><dd>{explanation.returnProtectionDays}<MemberCopyValue value={" 天"} /></dd></div>
            </>
          ) : (
            <div><dt><MemberCopyValue value={"安全等待規則"} /></dt><dd><MemberCopyValue value={"依本筆回饋建立時的規則執行"} /></dd></div>
          )}
          <div><dt><MemberCopyValue value={"預計入帳"} /></dt><dd><MemberCopyValue value={explanation.projectedReleaseDate ? formatTaipeiDate(explanation.projectedReleaseDate) : "入帳日期確認中"} /></dd></div>
        </dl>
      </div>
    </div>
  );
}
