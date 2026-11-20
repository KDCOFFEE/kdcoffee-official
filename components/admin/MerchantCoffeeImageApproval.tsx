"use client";

import { useEffect, useId, useState } from "react";
import type { MerchantCoffeeImageSlot } from "@/lib/merchantCoffeeImageSelection";

type Candidate = { slot: MerchantCoffeeImageSlot; url: string; sha256: string; approved: boolean };
type Inspection = {
  sku: { id: string; label: string } | null;
  images: Candidate[];
  hasApproval: boolean;
  version: number;
};

const labels = { productPhoto: "商品實拍照", productVisual: "商品主視覺" };

async function requestApproval(slug: string, action: string, fields?: Record<string, unknown>) {
  const response = await fetch("/api/admin/products", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "merchantImageApproval", slug, action, ...fields }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Merchant 圖片操作失敗。");
  return result;
}

export default function MerchantCoffeeImageApproval({ slug, productName, disabled }: {
  slug: string;
  productName: string;
  disabled: boolean;
}) {
  const radioGroup = useId();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [candidateSlot, setCandidateSlot] = useState<MerchantCoffeeImageSlot | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (disabled) return;
    let active = true;
    setInspection(null);
    setCandidateSlot(null);
    setError("");
    requestApproval(slug, "inspect").then((result: Inspection) => {
      if (active) setInspection(result);
    }, (failure: Error) => {
      if (active) setError(failure.message);
    });
    return () => { active = false; };
  }, [slug, disabled, revision]);

  const candidate = inspection?.images.find(image => image.slot === candidateSlot);
  const previewUrl = candidate ? `${new URL(candidate.url).pathname}?sha256=${candidate.sha256}` : null;
  const canApprove = Boolean(inspection?.sku && candidate && previewStatus === "ready");
  const update = async (action: "approve" | "revoke") => {
    if (disabled || pending || !inspection) return;
    const { sku, version } = inspection;
    if (action === "approve" && !canApprove) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await requestApproval(slug, action, {
        version, ...(action === "approve" && sku && candidate ? {
          skuId: sku.id, slot: candidate.slot, url: candidate.url, sha256: candidate.sha256,
        } : {}),
      });
      setNotice(action === "approve" ? "已核准 Merchant 圖片。" : "已撤銷 Merchant 圖片核准。");
      setInspection(null);
      setRevision(value => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Merchant 圖片操作失敗。");
      setInspection(null);
    } finally {
      setPending(false);
    }
  };

  if (inspection && !inspection.sku && !inspection.hasApproval && !notice) return null;

  return (
    <section className="cms-panel">
      <h3>Google Merchant 商品圖片</h3>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error} <button type="button" disabled={disabled || pending}
        onClick={() => setRevision(value => value + 1)}>重新讀取</button></p> : null}
      {disabled ? <p>請先儲存商品變更，再核准或撤銷圖片。</p> : null}
      {!disabled && !inspection && !error ? <p role="status">讀取已儲存的 SKU 與圖片…</p> : null}
      {!disabled && inspection ? <>
        <p><strong>{productName}</strong></p>
        <p>{inspection.sku
          ? <>半磅咖啡豆 227g · {inspection.sku.label} · SKU <code>{inspection.sku.id}</code></>
          : "找不到唯一且可驗證的半磅咖啡豆 SKU。"}</p>
        {inspection.hasApproval && !inspection.images.some(image => image.approved)
          ? <p>現有核准已失效，可以撤銷或重新核准。</p> : null}
        {!inspection.hasApproval ? <p>尚未核准 Merchant 商品圖片。</p> : null}
        {inspection.images.length ? <fieldset disabled={pending}>
          <legend>選擇既有商品圖片</legend>
          {inspection.images.map(image => (
            <div key={image.slot}>
              <label>
                <input name={radioGroup} type="radio" checked={image.slot === candidateSlot}
                  onChange={() => {
                    setPreviewStatus("loading");
                    setCandidateSlot(image.slot);
                  }}/>
                {labels[image.slot]}{image.approved ? "（已核准）" : ""}
              </label>
            </div>
          ))}
        </fieldset> : inspection.sku ? <p>目前沒有符合 Merchant 驗證規則的商品圖片。</p> : null}
        {candidate && previewUrl ? (
          <figure key={candidate.slot + previewUrl}>
            {/* Show the source directly so the preview does not use image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={`${productName}－${labels[candidate.slot]}`}
              style={{ display: "block", maxWidth: "100%", maxHeight: 260, objectFit: "contain" }}
              onLoad={() => setPreviewStatus("ready")} onError={() => setPreviewStatus("failed")}/>
            <figcaption>
              {previewStatus === "failed" ? <p role="alert">圖片預覽載入失敗。 <button type="button"
                onClick={() => setRevision(value => value + 1)}>重新讀取</button></p> : null}
              <a href={previewUrl} target="_blank" rel="noreferrer">開啟原圖</a>
              <p>SHA-256 <code style={{ overflowWrap: "anywhere" }}>{candidate.sha256}</code></p>
            </figcaption>
          </figure>
        ) : null}
        <div className="cms-toolbar-actions">
          <button type="button" disabled={pending || !canApprove} onClick={() => void update("approve")}>核准所選圖片</button>
          {inspection.hasApproval ? <button type="button" disabled={pending}
            onClick={() => void update("revoke")}>撤銷此商品的圖片核准</button> : null}
        </div>
      </> : null}
    </section>
  );
}
