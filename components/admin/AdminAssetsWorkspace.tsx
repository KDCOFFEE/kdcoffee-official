"use client";

import { useState } from "react";

import AssetManager from "@/components/admin/AssetManager";
import CloudinaryVideoManager from "@/components/admin/CloudinaryVideoManager";

type AssetsTab = "brand" | "cloudinary";

export default function AdminAssetsWorkspace() {
  const [activeTab, setActiveTab] = useState<AssetsTab>("brand");

  return (
    <div className="admin-assets-workspace">
      <header className="admin-assets-heading">
        <p className="eyebrow dark">KD MEDIA &amp; ASSET LIBRARY</p>
        <h1>媒體與品牌資產管理</h1>
        <p>集中管理 KD Coffee 品牌素材、網站圖片與 Cloudinary 影片資產。</p>
      </header>

      <div className="admin-assets-tabs" role="tablist" aria-label="媒體與品牌資產分類">
        <button
          type="button"
          id="admin-assets-brand-tab"
          role="tab"
          aria-selected={activeTab === "brand"}
          aria-controls="admin-assets-brand-panel"
          className={activeTab === "brand" ? "active" : ""}
          onClick={() => setActiveTab("brand")}
        >
          品牌資產
        </button>
        <button
          type="button"
          id="admin-assets-cloudinary-tab"
          role="tab"
          aria-selected={activeTab === "cloudinary"}
          aria-controls="admin-assets-cloudinary-panel"
          className={activeTab === "cloudinary" ? "active" : ""}
          onClick={() => setActiveTab("cloudinary")}
        >
          Cloudinary 影片
        </button>
      </div>

      {activeTab === "brand" ? (
        <section
          id="admin-assets-brand-panel"
          role="tabpanel"
          aria-labelledby="admin-assets-brand-tab"
        >
          <AssetManager />
        </section>
      ) : (
        <section
          id="admin-assets-cloudinary-panel"
          role="tabpanel"
          aria-labelledby="admin-assets-cloudinary-tab"
        >
          <CloudinaryVideoManager />
        </section>
      )}
    </div>
  );
}
