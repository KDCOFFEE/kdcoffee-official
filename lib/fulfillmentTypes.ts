export const fulfillmentStates = [
  "order_created",
  "preparing",
  "shipped",
  "in_transit",
  "arrived_at_pickup_store",
  "ready_for_store_pickup",
  "completed",
  "suspected_uncollected",
  "uncollected",
  "cancelled",
  "exception_requires_review",
] as const;

export type FulfillmentState = (typeof fulfillmentStates)[number];
export type FulfillmentSource = "seven_eleven_email" | "admin" | "system" | "future_integration";
export type FulfillmentEmailEventType = "order_created" | "shipped" | "arrived_at_pickup_store" | "completed";

export const fulfillmentStateLabels: Record<FulfillmentState, string> = {
  order_created: "訂單成立",
  preparing: "準備中",
  shipped: "已交寄",
  in_transit: "配送中",
  arrived_at_pickup_store: "已到店",
  ready_for_store_pickup: "可以取貨",
  completed: "已完成取貨",
  suspected_uncollected: "疑似逾期未取",
  uncollected: "未取貨",
  cancelled: "已取消",
  exception_requires_review: "需要人工確認",
};

export type FulfillmentEvent = {
  eventId: string;
  orderId: string;
  state: FulfillmentState;
  source: FulfillmentSource;
  sourceFingerprint: string;
  sourceReference?: string;
  externalOrderId?: string;
  externalShipmentId?: string;
  occurredAt: string;
  recordedAt: string;
  actor?: string;
  note?: string;
  revision: number;
};

export type FulfillmentRecord = {
  orderId: string;
  currentState: FulfillmentState;
  revision: number;
  externalOrderId?: string;
  externalShipmentId?: string;
  arrivedAt?: string;
  pickupDeadline?: string;
  events: FulfillmentEvent[];
  createdAt: string;
  updatedAt: string;
};

export type FulfillmentReviewItem = {
  reviewId: string;
  reason: "unknown_order" | "ambiguous_mapping" | "malformed_evidence" | "deadline_expired";
  externalOrderId?: string;
  externalShipmentId?: string;
  recognizedEvent?: FulfillmentEmailEventType;
  sourceFingerprint: string;
  message: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt?: string;
};

export type FulfillmentStore = {
  schemaVersion: 1;
  revision: number;
  records: Record<string, FulfillmentRecord>;
  reviews: FulfillmentReviewItem[];
  processedFingerprints: Record<string, { eventId?: string; reviewId?: string; orderId?: string }>;
  consequenceStatus: Record<string, "pending" | "completed" | "failed">;
  createdAt: string;
  updatedAt: string;
};

export type LogisticsSettings = {
  schemaVersion: 1;
  revision: number;
  notificationEmail: string;
  automaticTrackingEnabled: boolean;
  pickupDeadlineDays: number;
  expiryPolicy: "manual_review" | "confirm_uncollected";
  trackedEvents: {
    orderCreated: boolean;
    shipped: boolean;
    arrived: boolean;
    completed: boolean;
  };
  gmailConnection: {
    status: "not_connected" | "connected" | "error";
    lastSyncedAt: string | null;
    recentProcessedCount: number;
    reviewCount: number;
  };
  updatedAt: string;
};
