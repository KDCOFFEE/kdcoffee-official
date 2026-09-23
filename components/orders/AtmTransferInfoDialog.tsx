"use client";

import { useEffect, useMemo, useState } from "react";

export type AtmTransferInfoDialogData = {
  bankName: string;
  bankCode: string;
  branchName?: string | null;
  accountName: string;
  accountNumber: string;
  instructions?: string | null;
  bankbookImageUrl?: string | null;
  showBankbookImage?: boolean;
};

function fallbackCopy(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    fallbackCopy(value);
  }
}

export default function AtmTransferInfoDialog({
  data,
  triggerLabel = "查看 ATM 匯款資訊",
}: {
  data: AtmTransferInfoDialogData;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"bankCode" | "accountNumber" | "all" | "">("");

  const copyAllText = useMemo(() => {
    const lines = [
      "KD Coffee ATM 匯款資訊",
      `銀行：${data.bankName}`,
      `銀行代碼：${data.bankCode}`,
      data.branchName ? `分行：${data.branchName}` : "",
      `戶名：${data.accountName}`,
      `帳號：${data.accountNumber}`,
      data.instructions ? `付款說明：${data.instructions}` : "",
    ];
    return lines.filter(Boolean).join("\n");
  }, [data]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function copy(value: string, field: "bankCode" | "accountNumber" | "all") {
    await copyText(value);
    setCopied(field);
    window.setTimeout(() => setCopied(""), 1600);
  }

  const triggerStyle = {
    appearance: "none" as const,
    border: "1px solid #4b3022",
    borderRadius: 999,
    background: "#4b3022",
    color: "#fffdf8",
    padding: "10px 16px",
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1.2,
    cursor: "pointer",
  };
  const copyButtonStyle = {
    appearance: "none" as const,
    border: "1px solid #cdb9a5",
    borderRadius: 999,
    background: "#fffdf9",
    color: "#3f2a1f",
    padding: "7px 11px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  };

  return (
    <>
      <button type="button" style={triggerStyle} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {open ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(34, 24, 18, 0.48)",
            display: "grid",
            placeItems: "center",
            padding: 18,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="atm-transfer-dialog-title"
            style={{
              width: "min(560px, 100%)",
              maxHeight: "min(760px, calc(100vh - 36px))",
              overflowY: "auto",
              background: "#fffdf9",
              border: "1px solid #dfd1c3",
              borderRadius: 24,
              boxShadow: "0 24px 70px rgba(48, 32, 22, 0.28)",
              padding: "22px 20px 20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, letterSpacing: ".16em", color: "#8a6f57", fontWeight: 700 }}>ATM TRANSFER</p>
                <h2 id="atm-transfer-dialog-title" style={{ margin: "6px 0 0", fontSize: 24, color: "#2d211a" }}>ATM 匯款資訊</h2>
              </div>
              <button
                type="button"
                aria-label="關閉 ATM 匯款資訊"
                onClick={() => setOpen(false)}
                style={{
                  appearance: "none",
                  border: "1px solid #dfd1c3",
                  borderRadius: 999,
                  background: "#fff",
                  color: "#5b4638",
                  width: 36,
                  height: 36,
                  cursor: "pointer",
                  fontSize: 20,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginTop: 18, border: "1px solid #eadfd4", borderRadius: 18, overflow: "hidden" }}>
              {[
                ["銀行", data.bankName, null],
                ["銀行代碼", data.bankCode, "bankCode"],
                ...(data.branchName ? [["分行", data.branchName, null]] : []),
                ["戶名", data.accountName, null],
                ["帳號", data.accountNumber, "accountNumber"],
              ].map(([label, value, field]) => (
                <div
                  key={`${label}-${value}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "88px minmax(0, 1fr) auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "13px 14px",
                    borderBottom: label === "帳號" ? "none" : "1px solid #efe6dc",
                    background: "#fffaf4",
                  }}
                >
                  <span style={{ color: "#826954", fontSize: 13 }}>{label}</span>
                  <strong style={{ color: "#2f221a", fontSize: 16, wordBreak: "break-all" }}>{value}</strong>
                  {field === "bankCode" ? (
                    <button type="button" style={copyButtonStyle} onClick={() => void copy(data.bankCode, "bankCode")}>
                      {copied === "bankCode" ? "✓ 已複製" : "複製"}
                    </button>
                  ) : field === "accountNumber" ? (
                    <button type="button" style={copyButtonStyle} onClick={() => void copy(data.accountNumber, "accountNumber")}>
                      {copied === "accountNumber" ? "✓ 已複製" : "複製帳號"}
                    </button>
                  ) : <span aria-hidden="true" />}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void copy(copyAllText, "all")}
              style={{ ...triggerStyle, width: "100%", marginTop: 14, padding: "12px 16px" }}
            >
              {copied === "all" ? "✓ 全部匯款資料已複製" : "複製全部匯款資料"}
            </button>

            {data.instructions ? (
              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 14, background: "#f6f0e8", color: "#594438", lineHeight: 1.65 }}>
                {data.instructions}
              </div>
            ) : null}

            {data.showBankbookImage && data.bankbookImageUrl ? (
              <div style={{ marginTop: 18 }}>
                <strong style={{ display: "block", color: "#3c2b21", marginBottom: 10 }}>存簿資訊</strong>
                <img
                  src={data.bankbookImageUrl}
                  alt="KD Coffee ATM 存簿資訊"
                  style={{ width: "100%", height: "auto", borderRadius: 14, border: "1px solid #eadfd4", display: "block" }}
                />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <a href={data.bankbookImageUrl} target="_blank" rel="noreferrer" style={{ ...copyButtonStyle, textDecoration: "none" }}>查看存簿圖片</a>
                  <a href={data.bankbookImageUrl} download="KD-Coffee-ATM-bankbook" style={{ ...copyButtonStyle, textDecoration: "none" }}>下載存簿圖片</a>
                </div>
              </div>
            ) : null}

            <p style={{ margin: "18px 2px 0", color: "#765f4e", fontSize: 13, lineHeight: 1.7 }}>
              完成轉帳後，請回到訂單詳情回報「匯款帳號末五碼」與匯款時間，方便 KD Coffee 核對實際入帳。
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}
