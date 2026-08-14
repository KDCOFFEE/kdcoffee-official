"use client";

import { useState } from "react";

import type {
  OrderTimelineAudience,
  OrderTimelineEntry,
  OrderTimelineEntryType,
} from "@/lib/orderTimeline";

const ENTRY_LABELS: Record<OrderTimelineEntryType, string> = {
  order_created: "成立",
  status_change: "進度",
  customer_notification: "通知",
  customer_message: "詢問",
  admin_message: "回覆",
  cancellation: "取消",
  inventory_warning: "庫存警告",
  inventory_return: "庫存回補",
};

const ENTRY_MARKERS: Record<OrderTimelineEntryType, string> = {
  order_created: "✓",
  status_change: "→",
  customer_notification: "◎",
  customer_message: "?",
  admin_message: "↩",
  cancellation: "×",
  inventory_warning: "!",
  inventory_return: "↺",
};

const CONVERSATION_ENTRY_TYPES = new Set<OrderTimelineEntryType>([
  "customer_message",
  "admin_message",
]);

const DETAIL_ENTRY_TYPES = new Set<OrderTimelineEntryType>([
  "status_change",
  "customer_notification",
  "cancellation",
  "inventory_warning",
  "inventory_return",
]);

function displayTime(entry: OrderTimelineEntry) {
  if (!entry.timestampValid) return "時間未知";
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(entry.createdAt));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}/${value("month")}/${value("day")} ${value("hour")}:${value("minute")}`;
}

export default function OrderTimeline({
  entries,
  audience,
}: {
  entries: OrderTimelineEntry[];
  audience: OrderTimelineAudience;
}) {
  const [missingPhotos, setMissingPhotos] = useState<string[]>([]);
  const displayEntries = entries.filter((entry) => !CONVERSATION_ENTRY_TYPES.has(entry.type));

  return (
    <section className={`order-timeline ${audience}`} aria-labelledby={`${audience}-timeline-title`}>
      <div className="order-timeline-heading">
        <div>
          <p className="eyebrow dark">ORDER TIMELINE</p>
          <h2 id={`${audience}-timeline-title`}>訂單動態</h2>
        </div>
        <span>{displayEntries.length} 筆</span>
      </div>
      <ol className="order-timeline-list">
        {displayEntries.map((entry) => {
          const photoMissing = entry.photoUrl ? missingPhotos.includes(entry.id) : false;
          const hasDetails = DETAIL_ENTRY_TYPES.has(entry.type) && Boolean(entry.description || entry.photoUrl);
          return (
            <li className={`order-timeline-entry ${entry.tone || "default"}`} key={entry.id}>
              <span className="order-timeline-marker" aria-hidden="true">
                {ENTRY_MARKERS[entry.type]}
              </span>
              <div className="order-timeline-content">
                <div className="order-timeline-row">
                  <div className="order-timeline-title">
                    <span>{ENTRY_LABELS[entry.type]}</span>
                    <h3>{entry.title}</h3>
                    {entry.photoUrl ? <small>📷 附照片</small> : null}
                  </div>
                  <time dateTime={entry.timestampValid ? entry.createdAt : undefined}>
                    {displayTime(entry)}
                  </time>
                </div>
                {hasDetails ? (
                  <details className="order-timeline-details">
                    <summary>查看詳情</summary>
                    <div>
                      {entry.description ? <p>{entry.description}</p> : null}
                      {entry.photoUrl && !photoMissing ? (
                        <a
                          className="order-timeline-photo"
                          href={entry.photoUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            src={entry.photoUrl}
                            alt="KD Coffee 訂單準備照片"
                            loading="lazy"
                            onError={() => setMissingPhotos((current) =>
                              current.includes(entry.id) ? current : [...current, entry.id]
                            )}
                          />
                          <span>查看照片</span>
                        </a>
                      ) : null}
                      {entry.photoUrl && photoMissing ? (
                        <p className="order-timeline-photo-missing" role="status">
                          照片目前無法載入
                        </p>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
