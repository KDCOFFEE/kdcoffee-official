"use client";

import { DEFAULT_RETURN_REFUND_SETTINGS, resolvedReturnRefundSettings, RETURN_HANDOFFS, type ReturnRefundSettings } from "@/lib/returnRefundSettings";
import styles from "./ReturnRefundSettingsFields.module.css";

const cards = {
  seven_eleven: { title: "7-ELEVEN 寄回", description: "會員選擇 7-ELEVEN 寄回時顯示以下門市資訊。", fields: [
    ["storeName", "門市名稱", "請輸入門市名稱"], ["storeNumber", "門市店號", "請輸入門市店號"],
    ["address", "門市地址", "請輸入門市地址"], ["instructions", "退貨說明", "請輸入寄回商品的注意事項"],
  ] },
  courier: { title: "宅配寄回工作室", description: "會員自行使用宅配寄回商品時顯示以下收件資訊。", fields: [
    ["recipient", "收件人", "請輸入收件人"], ["phone", "聯絡電話", "請輸入聯絡電話"],
    ["address", "收件地址", "請輸入收件地址"], ["instructions", "退貨說明", "請輸入寄回商品的注意事項"],
  ] },
  in_person: { title: "工作室現場退貨", description: "會員親自送回工作室時顯示以下資訊。", fields: [
    ["address", "工作室地址", "請輸入工作室地址"], ["phone", "聯絡方式", "請輸入聯絡方式"],
    ["hours", "可受理時間", "請輸入可受理時間"], ["mapUrl", "Google Maps 連結", "https://maps.google.com/…"],
    ["instructions", "退貨說明", "請輸入現場退貨的注意事項"],
  ] },
} as const;

function safeMapLink(value: string | undefined) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}

export default function ReturnRefundSettingsFields({ value, onChange }: { value?: ReturnRefundSettings; onChange: (value: ReturnRefundSettings) => void }) {
  const settings = resolvedReturnRefundSettings(value) ?? DEFAULT_RETURN_REFUND_SETTINGS;
  const mapLink = safeMapLink(settings.destinations.in_person.mapUrl);
  return <section className={`membership-rule-card ${styles.section}`} aria-labelledby="return-refund-settings-title">
    <header className={styles.heading}><div><h2 id="return-refund-settings-title">退貨與人工退款</h2><p>設定會員可使用的退貨方式、寄回資訊與人工退款通知。</p></div></header>
    <div className={styles.cards}>
      {RETURN_HANDOFFS.map(method => <fieldset key={method} className={`${styles.card} ${!settings.destinations[method].enabled ? styles.inactive : ""}`}>
        <legend>{cards[method].title}</legend>
        <p className={styles.description}>{cards[method].description}</p>
        <label className={styles.enable}><input name={`${method}_enabled`} type="checkbox" checked={settings.destinations[method].enabled} onChange={event => {
          const next = structuredClone(settings); next.destinations[method].enabled = event.target.checked; onChange(next);
        }} /><span>啟用此退貨方式</span></label>
        <div className={styles.fields}>{cards[method].fields.map(([key, label, placeholder]) => <label key={key} className={`${styles.field} ${["address", "instructions", "mapUrl"].includes(key) ? styles.full : ""}`}>
          <span>{label}</span>
          {key === "instructions" ? <textarea name={`${method}_${key}`} rows={3} maxLength={1000} placeholder={placeholder} value={settings.destinations[method][key]} onChange={event => {
            const next = structuredClone(settings); next.destinations[method][key] = event.target.value; onChange(next);
          }} /> : <input name={`${method}_${key}`} type={key === "mapUrl" ? "url" : "text"} maxLength={key === "mapUrl" ? 2000 : 1000} placeholder={placeholder} value={settings.destinations[method][key] ?? ""} onChange={event => {
            const next = structuredClone(settings); next.destinations[method][key] = event.target.value; onChange(next);
          }} />}
          {key === "mapUrl" && mapLink ? <a className={styles.mapLink} href={mapLink} target="_blank" rel="noopener noreferrer">開啟地圖 ↗</a> : null}
        </label>)}</div>
      </fieldset>)}
      <fieldset className={styles.card}>
        <legend>退款通知與證明</legend>
        <p className={styles.description}>設定退款完成後的通知與證明顯示。</p>
        <div className={styles.options}>
          <p >退款完成通知請至「08 LINE／Email 通知」設定。</p>
          <label className={styles.option}><input name="proofEnabled" type="checkbox" checked={settings.proofEnabled} onChange={event => onChange({ ...structuredClone(settings), proofEnabled: event.target.checked })} /><span><strong>允許上傳退款證明</strong><small>退款完成後，會員可在會員中心查看退款證明。</small></span></label>
        </div>
      </fieldset>
    </div>
    <p className={styles.footnote}>客戶文字請至會員中心文案管理調整。系統僅記錄已在站外完成的人工退款。</p>
  </section>;
}
