"use client";

import { useState } from "react";
import { useMemberCopyKey } from "./MemberCenterCopyProvider";

// Same select + custom-text pattern as the existing member cancellation form.
export default function ReturnReasonFields({ disabled, admin = false, onValue, error }: { disabled?: boolean; admin?: boolean; onValue?: (value: string) => void; error?:string }) {
  const copy = useMemberCopyKey();
  const [preset, setPreset] = useState(""), [custom, setCustom] = useState("");
  const options = admin ? ["商品狀況已確認", "等待補充資料", "不符合退貨條件", "其他"] : ["商品破損／瑕疵", "收到的商品不符", "商品不符需求", "其他"];
  const labels = ["reasonDamaged", "reasonWrong", "reasonUnneeded", "reasonOther"];
  const resolved = (selected: string, detail: string) => selected === "其他" ? detail.trim() : selected + (detail.trim() ? `：${detail.trim()}` : "");
  const update = (selected: string, detail: string) => { setPreset(selected); setCustom(detail); onValue?.(resolved(selected, detail)); };
  return <><label>{admin ? "審核原因" : copy("member.returns.reasonLabel")}<select name="reasonPreset" aria-invalid={!!error} aria-describedby={error?"return-reason-error":undefined} required value={preset} disabled={disabled} onChange={event => update(event.target.value, "")}>
    <option value="">{admin ? "請選擇審核原因" : copy("member.returns.reasonPlaceholder")}</option>{options.map((option, index) => <option key={option} value={option}>{admin ? option : copy(`member.returns.${labels[index]}`)}</option>)}
  </select>{error?<small id="return-reason-error" role="alert">{error}</small>:null}</label>{preset ? <label>{admin ? "補充說明（合計最多 200 字）" : copy("member.returns.reasonCustom")}<textarea name="reasonCustom" aria-invalid={!!error&&preset==="其他"} aria-describedby={error?"return-reason-error":undefined} value={custom} required={preset === "其他"} disabled={disabled}
    maxLength={200 - (preset === "其他" ? 0 : preset.length + 1)} onChange={event => update(preset, event.target.value)} /></label> : null}
    <input type="hidden" name="reason" value={preset ? resolved(preset, custom) : ""} />
  </>;
}
