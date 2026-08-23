import {
  ALLOWED_VIDEO_EXTENSIONS,
  CUSTOM_SECTION_VIDEO_LIMITS,
} from "./media";

export const BROWSER_SAFE_H264_TRANSFORMATION = "c_limit,q_auto,vc_h264:high:4.0,w_1920/mp4";
export const BROWSER_SAFE_H264_DERIVED_TRANSFORMATION = "c_limit,q_auto,vc_h264:high:4.0,w_1920";
export const CUSTOM_SECTION_VIDEO_READINESS_DELAYS_MS = [0, 500, 1000, 1500, 2000] as const;

export type CloudinaryVideoReadinessResource = {
  public_id?: unknown;
  resource_type?: unknown;
  type?: unknown;
  format?: unknown;
  bytes?: unknown;
  width?: unknown;
  height?: unknown;
  duration?: unknown;
  derived?: unknown;
};

export type CustomSectionVideoReadiness = {
  duration: number;
  width: number;
  height: number;
};

export class CustomSectionVideoResourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomSectionVideoResourceValidationError";
  }
}

export class CustomSectionVideoProcessingError extends Error {
  readonly reason: "lookup" | "duration" | "h264";

  constructor(reason: "lookup" | "duration" | "h264") {
    super("Custom Section video is still processing");
    this.name = "CustomSectionVideoProcessingError";
    this.reason = reason;
  }
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function inspectCustomSectionVideoReadiness(
  resource: CloudinaryVideoReadinessResource,
  publicId: string,
): CustomSectionVideoReadiness | { processing: "duration" | "h264" } {
  const bytes = positiveNumber(resource.bytes);
  const width = positiveNumber(resource.width);
  const height = positiveNumber(resource.height);
  const format = String(resource.format || "").toLowerCase();
  if (
    resource.public_id !== publicId ||
    resource.resource_type !== "video" ||
    resource.type !== "upload" ||
    !ALLOWED_VIDEO_EXTENSIONS.includes(format as (typeof ALLOWED_VIDEO_EXTENSIONS)[number]) ||
    bytes === undefined || bytes > CUSTOM_SECTION_VIDEO_LIMITS.maxBytes ||
    width === undefined || height === undefined ||
    width > CUSTOM_SECTION_VIDEO_LIMITS.maxDimension ||
    height > CUSTOM_SECTION_VIDEO_LIMITS.maxDimension ||
    width * height > CUSTOM_SECTION_VIDEO_LIMITS.maxPixels
  ) {
    throw new CustomSectionVideoResourceValidationError("Custom Section video resource metadata is invalid");
  }
  const duration = positiveNumber(resource.duration);
  if (duration === undefined) return { processing: "duration" };
  if (duration > CUSTOM_SECTION_VIDEO_LIMITS.maxDurationSeconds) {
    throw new CustomSectionVideoResourceValidationError("Custom Section video duration exceeds the limit");
  }
  const derived = Array.isArray(resource.derived) ? resource.derived : [];
  const h264Ready = derived.some((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const item = candidate as Record<string, unknown>;
    return item.transformation === BROWSER_SAFE_H264_DERIVED_TRANSFORMATION &&
      item.format === "mp4" &&
      positiveNumber(item.bytes) !== undefined;
  });
  return h264Ready ? { duration, width, height } : { processing: "h264" };
}

export async function waitForCustomSectionVideoReadiness({
  publicId,
  lookup,
  wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  delays = CUSTOM_SECTION_VIDEO_READINESS_DELAYS_MS,
}: {
  publicId: string;
  lookup: () => Promise<CloudinaryVideoReadinessResource>;
  wait?: (milliseconds: number) => Promise<void>;
  delays?: readonly number[];
}) {
  let processingReason: CustomSectionVideoProcessingError["reason"] = "lookup";
  for (const delay of delays) {
    if (delay > 0) await wait(delay);
    try {
      const result = inspectCustomSectionVideoReadiness(await lookup(), publicId);
      if (!("processing" in result)) return result;
      processingReason = result.processing;
    } catch (error) {
      if (error instanceof CustomSectionVideoResourceValidationError) throw error;
      processingReason = "lookup";
    }
  }
  throw new CustomSectionVideoProcessingError(processingReason);
}
