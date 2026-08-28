import { createHash } from "node:crypto";

import type { FulfillmentEmailEventType } from "./fulfillmentTypes";

export type FulfillmentEmailEvidence = {
  from: string;
  subject: string;
  text: string;
  messageId?: string;
  receivedAt?: string;
};

export type ParsedFulfillmentEvidence = {
  recognized: boolean;
  provider: "seven_eleven_email";
  eventType?: FulfillmentEmailEventType;
  externalOrderId?: string;
  externalShipmentId?: string;
  eventTimestamp: string;
  sourceFingerprint: string;
  reason?: "wrong_sender" | "unrecognized_subject" | "missing_order_reference" | "body_mismatch";
};

const TRUSTED_SENDER = "no-reply@sp88.com";
const EXTERNAL_ORDER_PATTERN = /\bCM[A-Z0-9]{8,20}\b/i;
const EXTERNAL_SHIPMENT_PATTERN = /\bE[A-Z0-9]{7,20}\b/i;

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function senderAddress(value: string) {
  const match = value.toLowerCase().match(/<([^>]+)>/);
  return clean(match?.[1] || value, 200).toLowerCase();
}

function fingerprint(evidence: FulfillmentEmailEvidence) {
  const stable = evidence.messageId
    ? `message:${clean(evidence.messageId, 300)}`
    : [senderAddress(evidence.from), clean(evidence.subject, 300), clean(evidence.text, 20_000)].join("\n");
  return createHash("sha256").update(stable).digest("hex");
}

export function parseSevenElevenEmail(evidence: FulfillmentEmailEvidence): ParsedFulfillmentEvidence {
  const subject = clean(evidence.subject, 300);
  const body = clean(evidence.text, 20_000);
  const result: ParsedFulfillmentEvidence = {
    recognized: false,
    provider: "seven_eleven_email",
    eventTimestamp: Number.isFinite(Date.parse(String(evidence.receivedAt || "")))
      ? new Date(String(evidence.receivedAt)).toISOString()
      : new Date().toISOString(),
    sourceFingerprint: fingerprint(evidence),
  };
  if (senderAddress(evidence.from) !== TRUSTED_SENDER) return { ...result, reason: "wrong_sender" };

  const subjectOrder = subject.match(EXTERNAL_ORDER_PATTERN)?.[0]?.toUpperCase();
  const bodyOrder = body.match(EXTERNAL_ORDER_PATTERN)?.[0]?.toUpperCase();
  const externalOrderId = subjectOrder || bodyOrder;
  if (!externalOrderId) return { ...result, reason: "missing_order_reference" };
  if (subjectOrder && bodyOrder && subjectOrder !== bodyOrder) return { ...result, reason: "body_mismatch" };

  let eventType: FulfillmentEmailEventType | undefined;
  if (/賣貨便[：:]訂單成立通知/.test(subject) && /訂單/.test(body)) eventType = "order_created";
  if (/賣貨便[：:]賣家完成寄貨訂單通知/.test(subject) && /寄貨|交寄|交貨便/.test(body)) eventType = "shipped";
  if (/賣貨便[：:]您的訂單\(CM[A-Z0-9]{8,20}\)已送達/i.test(subject) && /送達|門市|取貨/.test(body)) eventType = "arrived_at_pickup_store";
  if (/賣貨便[：:]買家完成取貨訂單通知/.test(subject) && /完成取貨|買家.*取貨/.test(body)) eventType = "completed";
  if (!eventType) return { ...result, externalOrderId, reason: "unrecognized_subject" };

  return {
    ...result,
    recognized: true,
    eventType,
    externalOrderId,
    externalShipmentId: body.match(EXTERNAL_SHIPMENT_PATTERN)?.[0]?.toUpperCase(),
  };
}
