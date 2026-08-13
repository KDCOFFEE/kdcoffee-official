import "server-only";

import {
  destroyCloudinaryCleanupVideo,
  listCloudinaryCleanupVideoPage,
  lookupCloudinaryCleanupVideo,
  type CloudinaryCleanupVideoResource,
} from "@/lib/cloudinary";
import {
  getCloudinaryVideoUsage,
  getReferencedCloudinaryVideoPublicIds,
  type CloudinaryMediaReference,
} from "@/lib/cloudinaryMediaUsage";
import { withFileLock } from "@/lib/jsonFileStore";
import { CLOUDINARY_VIDEO_FOLDER } from "@/lib/media";
import { getHomepageDataFile, getWebsiteDataFile } from "@/lib/storagePaths";

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_SCAN_PAGES = 100;
export const MAX_CLEANUP_DELETE_COUNT = 20;

const MANAGED_PUBLIC_ID = new RegExp(
  `^${CLOUDINARY_VIDEO_FOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`,
  "i",
);

export type CloudinaryCleanupAsset = CloudinaryCleanupVideoResource & {
  status: "used" | "orphan";
  canDelete: boolean;
  displayName: string;
  references: CloudinaryMediaReference[];
};

export type CloudinaryCleanupScan = {
  assets: CloudinaryCleanupAsset[];
  total: number;
  used: number;
  orphan: number;
  deletable: number;
};

export type CloudinaryCleanupDeleteResult = {
  publicId: string;
  status: "deleted" | "skipped_in_use" | "failed";
};

export function isManagedCloudinaryVideoPublicId(value: unknown): value is string {
  return typeof value === "string" && MANAGED_PUBLIC_ID.test(value.trim());
}

function safeDisplayName(publicId: string) {
  const name = publicId.slice(`${CLOUDINARY_VIDEO_FOLDER}/`.length);
  return name.length > 18 ? `${name.slice(0, 8)}…${name.slice(-6)}` : name;
}

function oldEnoughToDelete(createdAt: string | undefined, now: number) {
  if (!createdAt) return false;
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && timestamp <= now - ONE_HOUR_MS;
}

export async function scanCloudinaryCleanupVideos(
  now = Date.now(),
): Promise<CloudinaryCleanupScan> {
  const usage = await getCloudinaryVideoUsage();
  const referenced = usage.referencedPublicIds;
  const resources: CloudinaryCleanupVideoResource[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;

  for (let pageNumber = 0; pageNumber < MAX_SCAN_PAGES; pageNumber += 1) {
    const page = await listCloudinaryCleanupVideoPage(cursor);
    resources.push(...page.resources);
    if (!page.nextCursor) {
      cursor = undefined;
      break;
    }
    if (cursors.has(page.nextCursor)) {
      throw new Error("Cloudinary pagination cursor repeated");
    }
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  if (cursor) throw new Error("Cloudinary cleanup scan exceeded the page limit");

  const assets = resources.map((resource): CloudinaryCleanupAsset => {
    const status = referenced.has(resource.publicId) ? "used" : "orphan";
    const canDelete =
      status === "orphan" &&
      isManagedCloudinaryVideoPublicId(resource.publicId) &&
      resource.resourceType === "video" &&
      resource.deliveryType === "upload" &&
      oldEnoughToDelete(resource.createdAt, now);
    return {
      ...resource,
      status,
      canDelete,
      displayName: safeDisplayName(resource.publicId),
      references: usage.referencesByPublicId.get(resource.publicId) || [],
    };
  });
  const used = assets.filter((asset) => asset.status === "used").length;
  const orphan = assets.length - used;
  return {
    assets,
    total: assets.length,
    used,
    orphan,
    deletable: assets.filter((asset) => asset.canDelete).length,
  };
}

export async function deleteCloudinaryOrphanVideos(
  publicIds: string[],
): Promise<CloudinaryCleanupDeleteResult[]> {
  const results: CloudinaryCleanupDeleteResult[] = [];
  for (const publicId of publicIds) {
    const referencedBeforeLookup = await getReferencedCloudinaryVideoPublicIds();
    if (referencedBeforeLookup.has(publicId)) {
      results.push({ publicId, status: "skipped_in_use" });
      continue;
    }

    try {
      const resource = await lookupCloudinaryCleanupVideo(publicId);
      const validResource =
        resource.publicId === publicId &&
        resource.resourceType === "video" &&
        resource.deliveryType === "upload" &&
        isManagedCloudinaryVideoPublicId(resource.publicId) &&
        oldEnoughToDelete(resource.createdAt, Date.now());
      if (!validResource) {
        results.push({ publicId, status: "failed" });
        continue;
      }

      const status = await withFileLock(
        getHomepageDataFile(),
        () => withFileLock(
          getWebsiteDataFile(),
          async (): Promise<CloudinaryCleanupDeleteResult["status"]> => {
            const referencedImmediatelyBeforeDelete =
              await getReferencedCloudinaryVideoPublicIds();
            if (referencedImmediatelyBeforeDelete.has(publicId)) {
              return "skipped_in_use";
            }
            return await destroyCloudinaryCleanupVideo(publicId)
              ? "deleted"
              : "failed";
          },
        ),
      );
      results.push({ publicId, status });
    } catch {
      results.push({ publicId, status: "failed" });
    }
  }
  return results;
}
