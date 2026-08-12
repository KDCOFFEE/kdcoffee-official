import "server-only";

import { v2 as cloudinary } from "cloudinary";

import {
  ALLOWED_VIDEO_EXTENSIONS,
  CLOUDINARY_VIDEO_FOLDER,
  type CloudinaryMediaUsage,
  type MediaAsset,
  VIDEO_UPLOAD_LIMITS,
} from "@/lib/media";

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
};

export type CloudinaryFinalizeStage =
  | "admin_api_lookup"
  | "resource_validation"
  | "delivery_url"
  | "poster_url"
  | "unknown";

export type CloudinaryFinalizeErrorCode =
  | "FINALIZE_LOOKUP_FAILED"
  | "FINALIZE_RESOURCE_INVALID"
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
  };
};

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

export function createSignedVideoUpload(publicId: string): SignedVideoUpload {
  const { cloudName, apiKey, apiSecret } = configureCloudinary();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: `${CLOUDINARY_VIDEO_FOLDER}/${publicId}`,
    allowed_formats: ALLOWED_VIDEO_EXTENSIONS.join(","),
    overwrite: "false",
    timestamp,
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

function cleanNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
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
    duration: cleanNumber(resource.duration),
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
  const duration = cleanNumber(resource.duration);
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
    duration > 0 &&
    duration <= limits.maxDurationSeconds &&
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
                    : duration <= 0 ? "DURATION_MISSING"
                      : duration > limits.maxDurationSeconds ? "DURATION_LIMIT_EXCEEDED"
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

  const resourceDetails = safeResourceDetails(resource);
  let deliveryUrl: string;
  try {
    deliveryUrl = verifiedDeliveryUrl(cloudinary.url(publicId, {
      resource_type: "video",
      type: "upload",
      secure: true,
      format: "mp4",
      transformation: [
        {
          width: 1920,
          crop: "limit",
          quality: "auto",
          video_codec: "auto",
        },
      ],
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
    duration,
    format,
    bytes,
  };
}
