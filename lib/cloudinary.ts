import "server-only";

import { v2 as cloudinary } from "cloudinary";

import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
  CLOUDINARY_IMAGE_FOLDER,
  CLOUDINARY_VIDEO_FOLDER,
  CUSTOM_SECTION_IMAGE_LIMITS,
  type CloudinaryMediaUsage,
  type MediaAsset,
  VIDEO_UPLOAD_LIMITS,
} from "@/lib/media";
import {
  buildCustomSectionMediaPublicId,
  customSectionMediaPublicIdPrefix,
  nextAvailableCustomSectionMediaSequence,
  type CustomSectionMediaType,
} from "@/lib/customSectionMediaNaming";
import {
  CustomSectionVideoProcessingError,
  CustomSectionVideoResourceValidationError,
  waitForCustomSectionVideoReadiness,
} from "@/lib/cloudinaryVideoReadiness";
import {
  buildProductMediaPublicId,
  nextAvailableProductMediaSequence,
  productMediaPublicIdPrefix,
  type ProductMediaPurpose,
} from "@/lib/productMediaNaming";

type CloudinaryCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

type CloudinaryVideoResource = {
  public_id?: unknown;
  resource_type?: unknown;
  type?: unknown;
  secure_url?: unknown;
  format?: unknown;
  bytes?: unknown;
  width?: unknown;
  height?: unknown;
  duration?: unknown;
  created_at?: unknown;
  derived?: unknown;
};

const WEB_VIDEO_TRANSFORMATION = {
  width: 1920,
  crop: "limit",
  quality: "auto",
  video_codec: { codec: "h264", profile: "high", level: "4.0" },
} as const;

const WEB_VIDEO_EAGER_TRANSFORMATION =
  "c_limit,q_auto,vc_h264:high:4.0,w_1920/mp4";

export type CloudinaryCleanupVideoResource = {
  publicId: string;
  resourceType: string;
  deliveryType: string;
  createdAt?: string;
  bytes?: number;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  posterUrl?: string;
};

export type CloudinaryCleanupVideoPage = {
  resources: CloudinaryCleanupVideoResource[];
  nextCursor?: string;
};

export type CloudinaryFinalizeStage =
  | "admin_api_lookup"
  | "processing"
  | "resource_validation"
  | "delivery_url"
  | "poster_url"
  | "unknown";

export type CloudinaryFinalizeErrorCode =
  | "FINALIZE_LOOKUP_FAILED"
  | "FINALIZE_RESOURCE_INVALID"
  | "FINALIZE_PROCESSING"
  | "FINALIZE_DELIVERY_URL_FAILED"
  | "FINALIZE_POSTER_URL_FAILED"
  | "FINALIZE_UNKNOWN";

type CloudinarySafeResourceDetails = {
  resourceType?: string;
  format?: string;
  bytes?: number;
  duration?: number;
};

export class CloudinaryFinalizeError extends Error {
  readonly stage: CloudinaryFinalizeStage;
  readonly errorCode: CloudinaryFinalizeErrorCode;
  readonly sourceErrorName: string;
  readonly httpCode?: number;
  readonly cloudinaryErrorCode?: string;
  readonly resource: CloudinarySafeResourceDetails;

  constructor({
    stage,
    errorCode,
    message,
    sourceErrorName = "Error",
    httpCode,
    cloudinaryErrorCode,
    resource = {},
  }: {
    stage: CloudinaryFinalizeStage;
    errorCode: CloudinaryFinalizeErrorCode;
    message: string;
    sourceErrorName?: string;
    httpCode?: number;
    cloudinaryErrorCode?: string;
    resource?: CloudinarySafeResourceDetails;
  }) {
    super(message);
    this.name = "CloudinaryFinalizeError";
    this.stage = stage;
    this.errorCode = errorCode;
    this.sourceErrorName = sourceErrorName;
    this.httpCode = httpCode;
    this.cloudinaryErrorCode = cloudinaryErrorCode;
    this.resource = resource;
  }
}

export type SignedVideoUpload = {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  timestamp: number;
  signature: string;
  params: {
    public_id: string;
    allowed_formats: string;
    overwrite: string;
    timestamp: number;
    eager?: string;
  };
};

export type SignedMediaUpload = SignedVideoUpload;

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("Cloudinary is not configured");
  }
  return value;
}

function configureCloudinary(): CloudinaryCredentials {
  const credentials = {
    cloudName: requiredEnvironmentValue("CLOUDINARY_CLOUD_NAME"),
    apiKey: requiredEnvironmentValue("CLOUDINARY_API_KEY"),
    apiSecret: requiredEnvironmentValue("CLOUDINARY_API_SECRET"),
  };

  cloudinary.config({
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
    secure: true,
    signature_algorithm: "sha256",
  });

  return credentials;
}

function signedVideoUpload(
  publicId: string,
  { cloudName, apiKey, apiSecret }: CloudinaryCredentials,
  eagerWebVideo = false,
): SignedVideoUpload {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: `${CLOUDINARY_VIDEO_FOLDER}/${publicId}`,
    allowed_formats: ALLOWED_VIDEO_EXTENSIONS.join(","),
    overwrite: "false",
    timestamp,
    ...(eagerWebVideo ? { eager: WEB_VIDEO_EAGER_TRANSFORMATION } : {}),
  };

  return {
    cloudName,
    apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`,
    timestamp,
    signature: cloudinary.utils.api_sign_request(params, apiSecret),
    params,
  };
}

function signedImageUpload(
  publicId: string,
  { cloudName, apiKey, apiSecret }: CloudinaryCredentials,
): SignedMediaUpload {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: `${CLOUDINARY_IMAGE_FOLDER}/${publicId}`,
    allowed_formats: ALLOWED_IMAGE_EXTENSIONS.join(","),
    overwrite: "false",
    timestamp,
  };
  return {
    cloudName,
    apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    timestamp,
    signature: cloudinary.utils.api_sign_request(params, apiSecret),
    params,
  };
}

export function createSignedVideoUpload(publicId: string): SignedVideoUpload {
  return signedVideoUpload(publicId, configureCloudinary());
}

export async function createSignedProductVideoUpload({
  productSlug,
  mediaPurpose,
  reservedPublicIds = [],
}: {
  productSlug: string;
  mediaPurpose: ProductMediaPurpose;
  reservedPublicIds?: string[];
}): Promise<SignedVideoUpload> {
  const credentials = configureCloudinary();
  const prefix = `${CLOUDINARY_VIDEO_FOLDER}/${productMediaPublicIdPrefix({ productSlug, mediaPurpose })}`;
  const existingPublicIds = new Set(reservedPublicIds);
  let nextCursor: string | undefined;

  do {
    const result = await cloudinary.api.resources({
      resource_type: "video",
      type: "upload",
      prefix,
      max_results: 100,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    }) as Record<string, unknown>;
    if (Array.isArray(result.resources)) {
      for (const resource of result.resources) {
        if (!resource || typeof resource !== "object" || Array.isArray(resource)) continue;
        const publicId = String((resource as CloudinaryVideoResource).public_id || "").trim();
        if (publicId.startsWith(prefix)) existingPublicIds.add(publicId);
      }
    }
    nextCursor = typeof result.next_cursor === "string" && result.next_cursor.trim()
      ? result.next_cursor.trim()
      : undefined;
  } while (nextCursor);

  const sequence = nextAvailableProductMediaSequence({
    productSlug,
    mediaPurpose,
    existingPublicIds,
  });
  const publicId = buildProductMediaPublicId({ productSlug, mediaPurpose, sequence });
  return signedVideoUpload(publicId, credentials, true);
}

export async function createSignedCustomSectionMediaUpload({
  productSlug,
  sectionId,
  mediaType,
  reservedPublicIds = [],
}: {
  productSlug: string;
  sectionId: string;
  mediaType: CustomSectionMediaType;
  reservedPublicIds?: string[];
}): Promise<SignedMediaUpload> {
  const credentials = configureCloudinary();
  const folder = mediaType === "image" ? CLOUDINARY_IMAGE_FOLDER : CLOUDINARY_VIDEO_FOLDER;
  const prefix = `${folder}/${customSectionMediaPublicIdPrefix({ productSlug, sectionId, mediaType })}`;
  const existingPublicIds = new Set(reservedPublicIds);
  let nextCursor: string | undefined;
  do {
    const result = await cloudinary.api.resources({
      resource_type: mediaType,
      type: "upload",
      prefix,
      max_results: 100,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    }) as Record<string, unknown>;
    if (Array.isArray(result.resources)) {
      for (const resource of result.resources) {
        if (!resource || typeof resource !== "object" || Array.isArray(resource)) continue;
        const publicId = String((resource as CloudinaryVideoResource).public_id || "").trim();
        if (publicId.startsWith(prefix)) existingPublicIds.add(publicId);
      }
    }
    nextCursor = typeof result.next_cursor === "string" && result.next_cursor.trim()
      ? result.next_cursor.trim()
      : undefined;
  } while (nextCursor);
  const sequence = nextAvailableCustomSectionMediaSequence({
    productSlug,
    sectionId,
    mediaType,
    existingPublicIds,
  });
  const publicId = buildCustomSectionMediaPublicId({ productSlug, sectionId, mediaType, sequence });
  return mediaType === "image"
    ? signedImageUpload(publicId, credentials)
    : signedVideoUpload(publicId, credentials, true);
}

function cleanNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function cleanOptionalDuration(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function errorRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeCode(value: unknown) {
  const code = typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
  return /^[a-z0-9_.:-]{1,80}$/i.test(code) ? code : undefined;
}

function safeHttpCode(value: unknown) {
  const code = Number(value);
  return Number.isInteger(code) && code >= 100 && code <= 599 ? code : undefined;
}

export function safeCloudinaryErrorMessage(error: unknown, publicId = "") {
  const record = errorRecord(error);
  const nested = errorRecord(record.error);
  const rawMessage = error instanceof Error
    ? error.message
    : typeof record.message === "string"
      ? record.message
      : typeof nested.message === "string"
        ? nested.message
        : "Cloudinary request failed";
  let message = rawMessage.slice(0, 500);
  const sensitiveValues = [
    process.env.CLOUDINARY_API_SECRET,
    process.env.CLOUDINARY_API_KEY,
    publicId,
  ].filter((value): value is string => Boolean(value));
  for (const value of sensitiveValues) {
    message = message.split(value).join("[redacted]");
  }
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/(["']?)(api_key|api_secret|signature|timestamp)\1\s*[:=]\s*(["'])?[^\s,;}]+\3/gi, "$2=[redacted]");
}

function lookupFailure(error: unknown, publicId: string) {
  const record = errorRecord(error);
  const nested = errorRecord(record.error);
  return new CloudinaryFinalizeError({
    stage: "admin_api_lookup",
    errorCode: "FINALIZE_LOOKUP_FAILED",
    message: safeCloudinaryErrorMessage(error, publicId),
    sourceErrorName: safeCode(error instanceof Error ? error.name : record.name) || "Error",
    httpCode: safeHttpCode(record.http_code ?? nested.http_code),
    cloudinaryErrorCode: safeCode(record.code ?? nested.code),
  });
}

function safeResourceDetails(resource: CloudinaryVideoResource): CloudinarySafeResourceDetails {
  return {
    resourceType: safeCode(resource.resource_type),
    format: safeCode(resource.format),
    bytes: cleanNumber(resource.bytes),
    duration: cleanOptionalDuration(resource.duration),
  };
}

function verifiedDeliveryUrl(url: string, cloudName: string) {
  if (!isExpectedSecureVideoUrl(url, cloudName)) {
    throw new Error("Generated Cloudinary delivery URL was invalid");
  }
  return url;
}

function isExpectedSecureVideoUrl(value: string, cloudName: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      url.pathname.startsWith(`/${cloudName}/video/upload/`)
    );
  } catch {
    return false;
  }
}

function isExpectedSecureImageUrl(value: string, cloudName: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      url.pathname.startsWith(`/${cloudName}/image/upload/`)
    );
  } catch {
    return false;
  }
}

export async function verifyCloudinaryImage(publicId: string): Promise<MediaAsset> {
  const { cloudName } = configureCloudinary();
  let resource: CloudinaryVideoResource;
  try {
    resource = (await cloudinary.api.resource(publicId, {
      resource_type: "image",
      type: "upload",
    })) as CloudinaryVideoResource;
  } catch (error) {
    throw lookupFailure(error, publicId);
  }
  const verifiedPublicId = String(resource.public_id || "");
  const format = String(resource.format || "").toLowerCase();
  const bytes = cleanNumber(resource.bytes);
  const width = cleanNumber(resource.width);
  const height = cleanNumber(resource.height);
  const valid =
    verifiedPublicId === publicId &&
    verifiedPublicId.startsWith(`${CLOUDINARY_IMAGE_FOLDER}/`) &&
    resource.resource_type === "image" &&
    resource.type === "upload" &&
    ALLOWED_IMAGE_EXTENSIONS.includes(format as (typeof ALLOWED_IMAGE_EXTENSIONS)[number]) &&
    bytes > 0 && bytes <= CUSTOM_SECTION_IMAGE_LIMITS.maxBytes &&
    width > 0 && height > 0 &&
    width <= CUSTOM_SECTION_IMAGE_LIMITS.maxDimension &&
    height <= CUSTOM_SECTION_IMAGE_LIMITS.maxDimension &&
    width * height <= CUSTOM_SECTION_IMAGE_LIMITS.maxPixels;
  if (!valid) {
    throw new CloudinaryFinalizeError({
      stage: "resource_validation",
      errorCode: "FINALIZE_RESOURCE_INVALID",
      message: "Cloudinary resource did not pass image validation",
      sourceErrorName: "CloudinaryResourceValidationError",
      cloudinaryErrorCode: "IMAGE_RESOURCE_INVALID",
      resource: safeResourceDetails(resource),
    });
  }
  let deliveryUrl: string;
  try {
    deliveryUrl = cloudinary.url(publicId, {
      resource_type: "image",
      type: "upload",
      secure: true,
      transformation: [{ width: 2400, crop: "limit", quality: "auto", fetch_format: "auto" }],
    });
    if (!isExpectedSecureImageUrl(deliveryUrl, cloudName)) throw new Error("Generated Cloudinary image URL was invalid");
  } catch (error) {
    throw new CloudinaryFinalizeError({
      stage: "delivery_url",
      errorCode: "FINALIZE_DELIVERY_URL_FAILED",
      message: safeCloudinaryErrorMessage(error, publicId),
      sourceErrorName: safeCode(error instanceof Error ? error.name : "") || "Error",
      resource: safeResourceDetails(resource),
    });
  }
  return {
    type: "image",
    url: deliveryUrl,
    provider: "cloudinary",
    publicId: verifiedPublicId,
    width,
    height,
    format,
    bytes,
  };
}

export async function verifyCloudinaryCustomSectionMedia(
  publicId: string,
  mediaType: CustomSectionMediaType,
) {
  if (mediaType === "image") return verifyCloudinaryImage(publicId);
  configureCloudinary();
  let readiness;
  try {
    readiness = await waitForCustomSectionVideoReadiness({
      publicId,
      lookup: async () => await cloudinary.api.resource(publicId, {
        resource_type: "video",
        type: "upload",
        media_metadata: true,
      }) as CloudinaryVideoResource,
    });
  } catch (error) {
    if (error instanceof CustomSectionVideoProcessingError) {
      throw new CloudinaryFinalizeError({
        stage: "processing",
        errorCode: "FINALIZE_PROCESSING",
        message: "Cloudinary video processing did not finish within the bounded verification window",
        sourceErrorName: error.name,
        cloudinaryErrorCode: `PROCESSING_${error.reason.toUpperCase()}`,
      });
    }
    if (error instanceof CustomSectionVideoResourceValidationError) {
      throw new CloudinaryFinalizeError({
        stage: "resource_validation",
        errorCode: "FINALIZE_RESOURCE_INVALID",
        message: error.message,
        sourceErrorName: error.name,
        cloudinaryErrorCode: "CUSTOM_SECTION_VIDEO_INVALID",
      });
    }
    throw error;
  }
  const media = await verifyCloudinaryVideo(publicId, "product");
  if (
    media.width !== readiness.width ||
    media.height !== readiness.height
  ) {
    throw new CloudinaryFinalizeError({
      stage: "resource_validation",
      errorCode: "FINALIZE_RESOURCE_INVALID",
      message: "Cloudinary video metadata changed during verification",
      sourceErrorName: "CloudinaryResourceValidationError",
      cloudinaryErrorCode: "RESOURCE_METADATA_MISMATCH",
    });
  }
  return { ...media, duration: readiness.duration };
}

function cleanupVideoResource(
  resource: CloudinaryVideoResource,
  cloudName: string,
): CloudinaryCleanupVideoResource {
  const publicId = String(resource.public_id || "").trim();
  let posterUrl: string | undefined;
  if (publicId) {
    const candidate = cloudinary.url(publicId, {
      resource_type: "video",
      type: "upload",
      secure: true,
      format: "jpg",
      transformation: [
        { width: 720, crop: "limit", quality: "auto", fetch_format: "auto" },
      ],
    });
    if (isExpectedSecureVideoUrl(candidate, cloudName)) posterUrl = candidate;
  }
  const createdAt = typeof resource.created_at === "string"
    ? resource.created_at.trim()
    : "";
  const duration = cleanOptionalDuration(resource.duration);
  return {
    publicId,
    resourceType: String(resource.resource_type || ""),
    deliveryType: String(resource.type || ""),
    ...(createdAt ? { createdAt } : {}),
    ...(cleanNumber(resource.bytes) > 0 ? { bytes: cleanNumber(resource.bytes) } : {}),
    ...(String(resource.format || "").trim() ? { format: String(resource.format).toLowerCase() } : {}),
    ...(cleanNumber(resource.width) > 0 ? { width: cleanNumber(resource.width) } : {}),
    ...(cleanNumber(resource.height) > 0 ? { height: cleanNumber(resource.height) } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(posterUrl ? { posterUrl } : {}),
  };
}

export async function listCloudinaryCleanupVideoPage(
  nextCursor?: string,
): Promise<CloudinaryCleanupVideoPage> {
  const { cloudName } = configureCloudinary();
  const result = await cloudinary.api.resources({
    resource_type: "video",
    type: "upload",
    prefix: `${CLOUDINARY_VIDEO_FOLDER}/`,
    max_results: 100,
    ...(nextCursor ? { next_cursor: nextCursor } : {}),
  }) as Record<string, unknown>;
  const resources = Array.isArray(result.resources)
    ? result.resources
        .filter((resource): resource is CloudinaryVideoResource => Boolean(resource) && typeof resource === "object")
        .map((resource) => cleanupVideoResource(resource, cloudName))
        .filter((resource) => resource.publicId.startsWith(`${CLOUDINARY_VIDEO_FOLDER}/`))
    : [];
  const cursor = typeof result.next_cursor === "string"
    ? result.next_cursor.trim()
    : "";
  return { resources, ...(cursor ? { nextCursor: cursor } : {}) };
}

export async function lookupCloudinaryCleanupVideo(
  publicId: string,
): Promise<CloudinaryCleanupVideoResource> {
  const { cloudName } = configureCloudinary();
  const resource = await cloudinary.api.resource(publicId, {
    resource_type: "video",
    type: "upload",
  }) as CloudinaryVideoResource;
  return cleanupVideoResource(resource, cloudName);
}

export async function destroyCloudinaryCleanupVideo(publicId: string) {
  configureCloudinary();
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "video",
    type: "upload",
    invalidate: true,
  }) as Record<string, unknown>;
  return result.result === "ok";
}

export async function verifyCloudinaryVideo(
  publicId: string,
  usage: CloudinaryMediaUsage,
): Promise<MediaAsset> {
  const { cloudName } = configureCloudinary();
  let resource: CloudinaryVideoResource;
  try {
    resource = (await cloudinary.api.resource(publicId, {
      resource_type: "video",
      type: "upload",
    })) as CloudinaryVideoResource;
  } catch (error) {
    throw lookupFailure(error, publicId);
  }

  const verifiedPublicId = String(resource.public_id || "");
  const format = String(resource.format || "").toLowerCase();
  const url = String(resource.secure_url || "");
  const bytes = cleanNumber(resource.bytes);
  const duration = cleanOptionalDuration(resource.duration);
  const width = cleanNumber(resource.width);
  const height = cleanNumber(resource.height);
  const limits = VIDEO_UPLOAD_LIMITS[usage];

  const valid =
    verifiedPublicId === publicId &&
    verifiedPublicId.startsWith(`${CLOUDINARY_VIDEO_FOLDER}/`) &&
    resource.resource_type === "video" &&
    resource.type === "upload" &&
    ALLOWED_VIDEO_EXTENSIONS.includes(
      format as (typeof ALLOWED_VIDEO_EXTENSIONS)[number],
    ) &&
    bytes > 0 &&
    bytes <= limits.maxBytes &&
    (duration === undefined || duration <= limits.maxDurationSeconds) &&
    isExpectedSecureVideoUrl(url, cloudName);

  if (!valid) {
    const validationCode =
      verifiedPublicId !== publicId ? "PUBLIC_ID_MISMATCH"
        : !verifiedPublicId.startsWith(`${CLOUDINARY_VIDEO_FOLDER}/`) ? "PUBLIC_ID_PREFIX_INVALID"
          : resource.resource_type !== "video" ? "RESOURCE_TYPE_INVALID"
            : resource.type !== "upload" ? "DELIVERY_TYPE_INVALID"
              : !ALLOWED_VIDEO_EXTENSIONS.includes(format as (typeof ALLOWED_VIDEO_EXTENSIONS)[number]) ? "FORMAT_INVALID"
                : bytes <= 0 ? "BYTES_MISSING"
                  : bytes > limits.maxBytes ? "BYTES_LIMIT_EXCEEDED"
                    : duration !== undefined && duration > limits.maxDurationSeconds ? "DURATION_LIMIT_EXCEEDED"
                        : "SECURE_URL_INVALID";
    throw new CloudinaryFinalizeError({
      stage: "resource_validation",
      errorCode: "FINALIZE_RESOURCE_INVALID",
      message: "Cloudinary resource did not pass video validation",
      sourceErrorName: "CloudinaryResourceValidationError",
      cloudinaryErrorCode: validationCode,
      resource: safeResourceDetails(resource),
    });
  }

  if (duration === undefined) {
    console.warn(JSON.stringify({
      event: "cloudinary_duration_missing",
      resourceType: safeCode(resource.resource_type),
      format: safeCode(resource.format),
      bytes,
    }));
  }

  const resourceDetails = safeResourceDetails(resource);
  let deliveryUrl: string;
  try {
    deliveryUrl = verifiedDeliveryUrl(cloudinary.url(publicId, {
      resource_type: "video",
      type: "upload",
      secure: true,
      format: "mp4",
      transformation: [WEB_VIDEO_TRANSFORMATION],
    }), cloudName);
  } catch (error) {
    throw new CloudinaryFinalizeError({
      stage: "delivery_url",
      errorCode: "FINALIZE_DELIVERY_URL_FAILED",
      message: safeCloudinaryErrorMessage(error, publicId),
      sourceErrorName: safeCode(error instanceof Error ? error.name : "") || "Error",
      resource: resourceDetails,
    });
  }

  let posterUrl: string;
  try {
    posterUrl = verifiedDeliveryUrl(cloudinary.url(publicId, {
      resource_type: "video",
      type: "upload",
      secure: true,
      format: "jpg",
      transformation: [
        {
          width: 1600,
          crop: "limit",
          quality: "auto",
          fetch_format: "auto",
        },
      ],
    }), cloudName);
  } catch (error) {
    throw new CloudinaryFinalizeError({
      stage: "poster_url",
      errorCode: "FINALIZE_POSTER_URL_FAILED",
      message: safeCloudinaryErrorMessage(error, publicId),
      sourceErrorName: safeCode(error instanceof Error ? error.name : "") || "Error",
      resource: resourceDetails,
    });
  }

  return {
    type: "video",
    url: deliveryUrl,
    provider: "cloudinary",
    publicId: verifiedPublicId,
    posterUrl,
    width,
    height,
    ...(duration !== undefined ? { duration } : {}),
    format,
    bytes,
  };
}
