import "server-only";

import type { Metadata } from "next";
import {
  storeLandingMetadata as publicLandingMetadata,
  storeProductMetadata as publicProductMetadata,
  type StoreSearchParams,
} from "./storePublicMetadata";
import type { PublicStoreProductReadModel } from "./storePublicReadModel";

/** Search publication is an explicit server capability, independent of commerce. */
export function isStoreSeoPublicEnabled(): boolean {
  return process.env.STORE_SEO_PUBLIC_ENABLED === "true";
}

function applyPublicationGate(metadata: Metadata): Metadata {
  const canonicalIndexable = typeof metadata.robots === "object" && metadata.robots?.index === true;
  return {
    ...metadata,
    robots: { index: isStoreSeoPublicEnabled() && canonicalIndexable, follow: true },
  };
}

/** Server specializations preserve the pure helpers' URL and content policy. */
export function storeLandingMetadata(query: StoreSearchParams = {}): Metadata {
  return applyPublicationGate(publicLandingMetadata(query));
}

export function storeProductMetadata(model: PublicStoreProductReadModel): Metadata {
  return applyPublicationGate(publicProductMetadata(model));
}
