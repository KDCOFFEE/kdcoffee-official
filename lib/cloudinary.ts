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
  const resource = (await cloudinary.api.resource(publicId, {
    resource_type: "video",
    type: "upload",
  })) as CloudinaryVideoResource;

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
    throw new Error("Cloudinary video validation failed");
  }

  const posterUrl = cloudinary.url(publicId, {
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
  });

  const deliveryUrl = cloudinary.url(publicId, {
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
  });

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
