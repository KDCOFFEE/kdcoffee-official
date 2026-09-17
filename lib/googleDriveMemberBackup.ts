import {
  createMemberBackup,
  createMemberBackupZipArtifact,
  getVerifiedMemberBackupForDownload,
  isValidMemberBackupId,
  listMemberBackups,
  type MemberBackupManifest,
  type MemberBackupSummary,
  type MemberBackupZipArtifact,
  type VerifiedMemberBackup,
} from "./memberBackup";
import {
  applyLocalCronRetention,
  ensureAutomaticBackupStorage,
  planGoogleDriveMemberBackupRetention,
  readMemberBackupStorageMetrics,
  type DriveRetentionPlan,
  type LocalRetentionResult,
  type MemberBackupStorageMetrics,
} from "./memberBackupRetention";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const ZIP_MIME_TYPE = "application/zip";
const DRIVE_FILE_FIELDS = "id,name,size,createdTime,webViewLink,mimeType,parents,appProperties,md5Checksum";
const DRIVE_ENV_NAMES = [
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "GOOGLE_DRIVE_REFRESH_TOKEN",
  "GOOGLE_DRIVE_BACKUP_FOLDER_ID",
] as const;

type DriveEnvName = (typeof DRIVE_ENV_NAMES)[number];
type DriveEnvironment = Readonly<Record<string, string | undefined>>;
type Fetcher = typeof fetch;

export type GoogleDriveMemberBackupFailureCode =
  | "not-configured"
  | "verification-failed"
  | "oauth-refresh-failed"
  | "folder-unavailable"
  | "upload-init-failed"
  | "upload-failed";

export class GoogleDriveMemberBackupError extends Error {
  readonly code: GoogleDriveMemberBackupFailureCode;
  readonly googleStatus?: number;
  readonly backupId?: string;

  constructor(
    code: GoogleDriveMemberBackupFailureCode,
    message: string,
    options: ErrorOptions & { googleStatus?: number; backupId?: string } = {},
  ) {
    super(message, options);
    this.name = "GoogleDriveMemberBackupError";
    this.code = code;
    this.googleStatus = options.googleStatus;
    this.backupId = options.backupId;
  }
}

export type GoogleDriveBackupMetadata = {
  status: "uploaded" | "already-uploaded";
  driveFileId: string;
  name: string;
  size: number;
  createdTime: string | null;
  webViewLink: string | null;
  md5Checksum: string | null;
  backupId: string;
  uploadedAt: string;
};

const uploadInFlight = new Map<string, Promise<GoogleDriveBackupMetadata>>();

type DriveFile = {
  id: string;
  name: string;
  size: number;
  createdTime: string | null;
  webViewLink: string | null;
  md5Checksum: string | null;
  mimeType: string;
  parents: string[];
  appProperties: Record<string, string>;
};

export function googleDriveMemberBackupReadiness(environment: DriveEnvironment = process.env) {
  const missing = DRIVE_ENV_NAMES.filter((name) => !environment[name]?.trim());
  return { configured: missing.length === 0, missing };
}

function configuredEnvironment(environment: DriveEnvironment) {
  const readiness = googleDriveMemberBackupReadiness(environment);
  if (!readiness.configured) {
    throw new GoogleDriveMemberBackupError("not-configured", `Google Drive offsite backup is not configured (${readiness.missing.join(", ")})`);
  }
  const values = Object.fromEntries(DRIVE_ENV_NAMES.map((name) => [name, environment[name]!.trim()])) as Record<DriveEnvName, string>;
  if (!/^[A-Za-z0-9_-]{10,200}$/u.test(values.GOOGLE_DRIVE_BACKUP_FOLDER_ID)) {
    throw new GoogleDriveMemberBackupError("not-configured", "Google Drive backup folder configuration is invalid");
  }
  return values;
}

async function timedFetch(fetcher: Fetcher, input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch (error) {
    throw error instanceof GoogleDriveMemberBackupError
      ? error
      : new Error(error instanceof Error && error.name === "AbortError" ? "Google request timed out" : "Google request failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function jsonObject(response: Response) {
  const value: unknown = await response.json().catch(() => null);
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function refreshAccessToken(fetcher: Fetcher, environment: Record<DriveEnvName, string>) {
  const response = await timedFetch(fetcher, GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: environment.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: environment.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: environment.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  }, 15_000).catch((error) => {
    throw new GoogleDriveMemberBackupError("oauth-refresh-failed", "Google OAuth refresh request failed", { cause: error });
  });
  if (!response.ok) {
    throw new GoogleDriveMemberBackupError("oauth-refresh-failed", "Google OAuth refresh was rejected", { googleStatus: response.status });
  }
  const payload = await jsonObject(response);
  if (!payload || typeof payload.access_token !== "string" || !payload.access_token) {
    throw new GoogleDriveMemberBackupError("oauth-refresh-failed", "Google OAuth refresh response was invalid", { googleStatus: response.status });
  }
  return payload.access_token;
}

function escapeDriveQuery(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function parseDriveFile(value: unknown): DriveFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const file = value as Record<string, unknown>;
  const size = Number(file.size);
  if (typeof file.id !== "string" || !/^[A-Za-z0-9_-]{10,200}$/u.test(file.id) || typeof file.name !== "string" || !Number.isSafeInteger(size) || size < 0) return null;
  const parents = Array.isArray(file.parents) ? file.parents.filter((item): item is string => typeof item === "string") : [];
  const appProperties = file.appProperties && typeof file.appProperties === "object" && !Array.isArray(file.appProperties)
    ? Object.fromEntries(Object.entries(file.appProperties).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  const webViewLink = typeof file.webViewLink === "string" && file.webViewLink.startsWith("https://drive.google.com/") ? file.webViewLink : null;
  return {
    id: file.id,
    name: file.name,
    size,
    createdTime: typeof file.createdTime === "string" ? file.createdTime : null,
    webViewLink,
    md5Checksum: typeof file.md5Checksum === "string" ? file.md5Checksum : null,
    mimeType: typeof file.mimeType === "string" ? file.mimeType : "",
    parents,
    appProperties,
  };
}

function expectedFileName(backupId: string) {
  return `kdcoffee-member-backup_${backupId}.zip`;
}

function matchesCanonicalBackup(file: DriveFile, input: { backupId: string; folderId: string; name: string; bytes: number }) {
  return file.name === input.name
    && file.size === input.bytes
    && file.mimeType === ZIP_MIME_TYPE
    && file.parents.includes(input.folderId)
    && file.appProperties.kdBackupId === input.backupId
    && file.appProperties.kdBackupType === "member-backup";
}

async function findExistingDriveFile(input: {
  fetcher: Fetcher;
  accessToken: string;
  folderId: string;
  backupId: string;
  name: string;
  bytes: number;
}) {
  const query = `'${escapeDriveQuery(input.folderId)}' in parents and trashed = false and appProperties has { key='kdBackupId' and value='${escapeDriveQuery(input.backupId)}' } and appProperties has { key='kdBackupType' and value='member-backup' }`;
  const url = new URL(GOOGLE_DRIVE_FILES_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("fields", `files(${DRIVE_FILE_FIELDS})`);
  const response = await timedFetch(input.fetcher, url.toString(), {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  }, 20_000).catch((error) => {
    throw new GoogleDriveMemberBackupError("folder-unavailable", "Google Drive backup folder lookup failed", { cause: error });
  });
  if (!response.ok) throw new GoogleDriveMemberBackupError("folder-unavailable", "Google Drive backup folder is unavailable", { googleStatus: response.status });
  const payload = await jsonObject(response);
  if (!payload || !Array.isArray(payload.files)) throw new GoogleDriveMemberBackupError("folder-unavailable", "Google Drive folder lookup response was invalid", { googleStatus: response.status });
  const candidates = payload.files.map(parseDriveFile).filter((file): file is DriveFile => Boolean(file));
  const matching = candidates.filter((file) => matchesCanonicalBackup(file, input));
  if (matching.length > 1) throw new GoogleDriveMemberBackupError("verification-failed", "Multiple Drive files claim the same canonical backup identity");
  if (matching.length === 1) return matching[0];
  if (candidates.some((file) => file.appProperties.kdBackupId === input.backupId)) {
    throw new GoogleDriveMemberBackupError("verification-failed", "Existing Drive backup identity does not match the verified local ZIP");
  }
  return null;
}

async function resolveVerifiedDriveIdentity(
  backupId: string,
  options: {
    fetcher?: Fetcher;
    environment?: DriveEnvironment;
    testOnlyAllowNonProduction?: boolean;
    resolveVerifiedBackup?: (backupId: string) => Promise<VerifiedMemberBackup>;
    createZipArtifact?: (verified: VerifiedMemberBackup) => Promise<MemberBackupZipArtifact>;
  } = {},
) {
  if (!isValidMemberBackupId(backupId)) throw new GoogleDriveMemberBackupError("verification-failed", "Member backup ID is invalid");
  const environment = configuredEnvironment(options.environment ?? process.env);
  const fetcher = options.fetcher ?? fetch;
  const resolveVerified = options.resolveVerifiedBackup ?? ((id: string) => getVerifiedMemberBackupForDownload(id, { testOnlyAllowNonProduction: options.testOnlyAllowNonProduction }));
  let verified: VerifiedMemberBackup;
  try { verified = await resolveVerified(backupId); }
  catch (error) { throw new GoogleDriveMemberBackupError("verification-failed", "Local member backup is not verified", { cause: error, backupId }); }
  if (verified.manifest.backupId !== backupId || verified.manifest.status !== "verified") {
    throw new GoogleDriveMemberBackupError("verification-failed", "Local member backup identity is invalid", { backupId });
  }
  const artifact = await (options.createZipArtifact ?? createMemberBackupZipArtifact)(verified).catch((error) => {
    throw new GoogleDriveMemberBackupError("verification-failed", "Verified member backup ZIP could not be generated", { cause: error, backupId });
  });
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1) throw new GoogleDriveMemberBackupError("verification-failed", "Verified member backup ZIP size is invalid", { backupId });
  return { environment, fetcher, verified, artifact };
}

export async function findVerifiedMemberBackupOnGoogleDrive(
  backupId: string,
  options: Parameters<typeof resolveVerifiedDriveIdentity>[1] = {},
) {
  const resolved = await resolveVerifiedDriveIdentity(backupId, options);
  const accessToken = await refreshAccessToken(resolved.fetcher, resolved.environment);
  const name = expectedFileName(backupId);
  const file = await findExistingDriveFile({
    fetcher: resolved.fetcher,
    accessToken,
    folderId: resolved.environment.GOOGLE_DRIVE_BACKUP_FOLDER_ID,
    backupId,
    name,
    bytes: resolved.artifact.bytes,
  });
  return file ? safeResult(file, "already-uploaded", backupId, new Date().toISOString()) : null;
}

async function listDriveFolderFiles(input: { fetcher: Fetcher; accessToken: string; folderId: string }) {
  const files: unknown[] = [];
  let pageToken = "";
  do {
    const url = new URL(GOOGLE_DRIVE_FILES_URL);
    url.searchParams.set("q", `'${escapeDriveQuery(input.folderId)}' in parents and trashed = false`);
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("fields", `nextPageToken,files(${DRIVE_FILE_FIELDS})`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await timedFetch(input.fetcher, url.toString(), {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    }, 20_000).catch((error) => {
      throw new GoogleDriveMemberBackupError("folder-unavailable", "Google Drive retention inventory lookup failed", { cause: error });
    });
    if (!response.ok) throw new GoogleDriveMemberBackupError("folder-unavailable", "Google Drive retention inventory is unavailable", { googleStatus: response.status });
    const payload = await jsonObject(response);
    if (!payload || !Array.isArray(payload.files)) throw new GoogleDriveMemberBackupError("folder-unavailable", "Google Drive retention inventory response was invalid", { googleStatus: response.status });
    files.push(...payload.files);
    pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : "";
  } while (pageToken);
  return files;
}

function retentionIdentity(file: DriveFile, folderId: string) {
  const backupId = file.appProperties.kdBackupId ?? "";
  if (!file.parents.includes(folderId)) return { valid: false as const, reason: "wrong-folder" };
  if (file.appProperties.kdBackupType !== "member-backup") return { valid: false as const, reason: "missing-or-wrong-backup-type" };
  if (!isValidMemberBackupId(backupId)) return { valid: false as const, reason: "invalid-backup-id" };
  if (file.name !== expectedFileName(backupId)) return { valid: false as const, reason: "filename-identity-mismatch" };
  if (file.mimeType !== ZIP_MIME_TYPE || file.size < 1) return { valid: false as const, reason: "invalid-zip-metadata" };
  if (file.appProperties.kdSource !== "railway_cron") return { valid: false as const, reason: "non-cron-or-legacy-source" };
  if (file.appProperties.kdEnvironment !== "production") return { valid: false as const, reason: "non-production-environment" };
  if (!file.appProperties.kdGitCommit || !file.appProperties.kdCreatedAt) return { valid: false as const, reason: "incomplete-system-metadata" };
  if (!file.createdTime || !Number.isFinite(Date.parse(file.createdTime))) return { valid: false as const, reason: "invalid-created-time" };
  return { valid: true as const, backupId };
}

export async function getGoogleDriveMemberBackupRetentionPlan(options: {
  fetcher?: Fetcher;
  environment?: DriveEnvironment;
  now?: Date;
  localBackups?: MemberBackupSummary[];
  testOnlyAllowNonProduction?: boolean;
} = {}): Promise<DriveRetentionPlan> {
  const environment = configuredEnvironment(options.environment ?? process.env);
  const fetcher = options.fetcher ?? fetch;
  const accessToken = await refreshAccessToken(fetcher, environment);
  const rawFiles = await listDriveFolderFiles({ fetcher, accessToken, folderId: environment.GOOGLE_DRIVE_BACKUP_FOLDER_ID });
  const ignoredUnknown: DriveRetentionPlan["ignoredUnknown"] = [];
  const parsed: Array<{ file: DriveFile; backupId: string }> = [];
  for (const raw of rawFiles) {
    const file = parseDriveFile(raw);
    if (!file) {
      const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      ignoredUnknown.push({
        driveFileId: typeof record.id === "string" ? record.id : null,
        name: typeof record.name === "string" ? record.name : null,
        reason: "malformed-metadata",
      });
      continue;
    }
    const identity = retentionIdentity(file, environment.GOOGLE_DRIVE_BACKUP_FOLDER_ID);
    if (!identity.valid) {
      ignoredUnknown.push({ driveFileId: file.id, name: file.name, reason: identity.reason });
      continue;
    }
    parsed.push({ file, backupId: identity.backupId });
  }
  const identityCounts = new Map<string, number>();
  for (const item of parsed) identityCounts.set(item.backupId, (identityCounts.get(item.backupId) ?? 0) + 1);
  const candidates = parsed.flatMap((item) => {
    if (identityCounts.get(item.backupId) !== 1) {
      ignoredUnknown.push({ driveFileId: item.file.id, name: item.file.name, reason: "duplicate-canonical-identity" });
      return [];
    }
    return [{ driveFileId: item.file.id, backupId: item.backupId, name: item.file.name, createdTime: item.file.createdTime! }];
  });
  const localBackups = options.localBackups ?? await listMemberBackups({ testOnlyAllowNonProduction: options.testOnlyAllowNonProduction });
  return planGoogleDriveMemberBackupRetention({
    candidates,
    ignoredUnknown,
    protectedLocalBackupIds: localBackups.map((backup) => backup.backupId),
    now: options.now,
  });
}

async function readDriveFile(input: { fetcher: Fetcher; accessToken: string; fileId: string }) {
  const url = new URL(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(input.fileId)}`);
  url.searchParams.set("fields", DRIVE_FILE_FIELDS);
  const response = await timedFetch(input.fetcher, url.toString(), {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  }, 20_000).catch((error) => {
    throw new GoogleDriveMemberBackupError("verification-failed", "Google Drive upload verification request failed", { cause: error });
  });
  if (!response.ok) throw new GoogleDriveMemberBackupError("verification-failed", "Google Drive uploaded file could not be verified", { googleStatus: response.status });
  const file = parseDriveFile(await jsonObject(response));
  if (!file) throw new GoogleDriveMemberBackupError("verification-failed", "Google Drive uploaded file metadata was invalid", { googleStatus: response.status });
  return file;
}

async function uploadResumable(input: {
  fetcher: Fetcher;
  accessToken: string;
  folderId: string;
  backupId: string;
  manifest: MemberBackupManifest;
  name: string;
  artifact: MemberBackupZipArtifact;
}) {
  const metadata = {
    name: input.name,
    parents: [input.folderId],
    mimeType: ZIP_MIME_TYPE,
    appProperties: {
      kdBackupId: input.backupId,
      kdBackupType: "member-backup",
      kdSource: input.manifest.source,
      kdEnvironment: input.manifest.environment,
      kdGitCommit: input.manifest.gitCommit,
      kdCreatedAt: input.manifest.createdAt,
      kdMemberCount: String(input.manifest.counts.canonicalMembers),
      kdOrderCount: String(input.manifest.counts.orders),
    },
  };
  const initUrl = new URL(GOOGLE_DRIVE_UPLOAD_URL);
  initUrl.searchParams.set("uploadType", "resumable");
  initUrl.searchParams.set("fields", DRIVE_FILE_FIELDS);
  const initResponse = await timedFetch(input.fetcher, initUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": ZIP_MIME_TYPE,
      "X-Upload-Content-Length": String(input.artifact.bytes),
    },
    body: JSON.stringify(metadata),
  }, 20_000).catch((error) => {
    throw new GoogleDriveMemberBackupError("upload-init-failed", "Google Drive resumable upload initialization failed", { cause: error });
  });
  if (!initResponse.ok) throw new GoogleDriveMemberBackupError("upload-init-failed", "Google Drive resumable upload initialization was rejected", { googleStatus: initResponse.status });
  const location = initResponse.headers.get("location");
  let uploadUrl: URL;
  try { uploadUrl = new URL(location ?? ""); }
  catch { throw new GoogleDriveMemberBackupError("upload-init-failed", "Google Drive resumable upload location was invalid"); }
  if (uploadUrl.protocol !== "https:" || uploadUrl.hostname !== "www.googleapis.com") {
    throw new GoogleDriveMemberBackupError("upload-init-failed", "Google Drive resumable upload location was not trusted");
  }
  const uploadInit = {
    method: "PUT",
    headers: { "Content-Type": ZIP_MIME_TYPE, "Content-Length": String(input.artifact.bytes) },
    body: input.artifact.body as BodyInit,
    duplex: "half",
  } satisfies RequestInit & { duplex: "half" };
  const uploadResponse = await timedFetch(input.fetcher, uploadUrl.toString(), uploadInit, 120_000).catch((error) => {
    throw new GoogleDriveMemberBackupError("upload-failed", "Google Drive ZIP upload failed", { cause: error });
  });
  if (!uploadResponse.ok) throw new GoogleDriveMemberBackupError("upload-failed", "Google Drive ZIP upload was rejected", { googleStatus: uploadResponse.status });
  const uploaded = parseDriveFile(await jsonObject(uploadResponse));
  if (!uploaded) throw new GoogleDriveMemberBackupError("verification-failed", "Google Drive upload response did not contain valid file metadata", { googleStatus: uploadResponse.status });
  return uploaded;
}

function safeResult(file: DriveFile, status: GoogleDriveBackupMetadata["status"], backupId: string, uploadedAt: string): GoogleDriveBackupMetadata {
  return { status, driveFileId: file.id, name: file.name, size: file.size, createdTime: file.createdTime, webViewLink: file.webViewLink, md5Checksum: file.md5Checksum, backupId, uploadedAt };
}

async function uploadVerifiedMemberBackupToGoogleDriveOnce(
  backupId: string,
  options: {
    fetcher?: Fetcher;
    environment?: DriveEnvironment;
    now?: Date;
    testOnlyAllowNonProduction?: boolean;
    resolveVerifiedBackup?: (backupId: string) => Promise<VerifiedMemberBackup>;
    createZipArtifact?: (verified: VerifiedMemberBackup) => Promise<MemberBackupZipArtifact>;
  } = {},
) {
  if (!isValidMemberBackupId(backupId)) throw new GoogleDriveMemberBackupError("verification-failed", "Member backup ID is invalid");
  const environment = configuredEnvironment(options.environment ?? process.env);
  const fetcher = options.fetcher ?? fetch;
  const resolveVerified = options.resolveVerifiedBackup ?? ((id: string) => getVerifiedMemberBackupForDownload(id, { testOnlyAllowNonProduction: options.testOnlyAllowNonProduction }));
  let verified: VerifiedMemberBackup;
  try { verified = await resolveVerified(backupId); }
  catch (error) { throw new GoogleDriveMemberBackupError("verification-failed", "Local member backup is not verified", { cause: error, backupId }); }
  if (verified.manifest.backupId !== backupId || verified.manifest.status !== "verified") {
    throw new GoogleDriveMemberBackupError("verification-failed", "Local member backup identity is invalid", { backupId });
  }
  const artifact = await (options.createZipArtifact ?? createMemberBackupZipArtifact)(verified).catch((error) => {
    throw new GoogleDriveMemberBackupError("verification-failed", "Verified member backup ZIP could not be generated", { cause: error, backupId });
  });
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1) throw new GoogleDriveMemberBackupError("verification-failed", "Verified member backup ZIP size is invalid", { backupId });
  const accessToken = await refreshAccessToken(fetcher, environment);
  const name = expectedFileName(backupId);
  const existing = await findExistingDriveFile({ fetcher, accessToken, folderId: environment.GOOGLE_DRIVE_BACKUP_FOLDER_ID, backupId, name, bytes: artifact.bytes });
  const uploadedAt = (options.now ?? new Date()).toISOString();
  if (existing) return safeResult(existing, "already-uploaded", backupId, uploadedAt);
  const uploaded = await uploadResumable({ fetcher, accessToken, folderId: environment.GOOGLE_DRIVE_BACKUP_FOLDER_ID, backupId, manifest: verified.manifest, name, artifact });
  const confirmed = await readDriveFile({ fetcher, accessToken, fileId: uploaded.id });
  if (!matchesCanonicalBackup(confirmed, { backupId, folderId: environment.GOOGLE_DRIVE_BACKUP_FOLDER_ID, name, bytes: artifact.bytes })) {
    throw new GoogleDriveMemberBackupError("verification-failed", "Google Drive file metadata does not match the verified local backup", { backupId });
  }
  return safeResult(confirmed, "uploaded", backupId, uploadedAt);
}

export function uploadVerifiedMemberBackupToGoogleDrive(
  backupId: string,
  options: Parameters<typeof uploadVerifiedMemberBackupToGoogleDriveOnce>[1] = {},
) {
  if (!isValidMemberBackupId(backupId)) {
    return Promise.reject(new GoogleDriveMemberBackupError("verification-failed", "Member backup ID is invalid"));
  }
  const active = uploadInFlight.get(backupId);
  if (active) return active;
  const operation = uploadVerifiedMemberBackupToGoogleDriveOnce(backupId, options);
  uploadInFlight.set(backupId, operation);
  void operation.finally(() => {
    if (uploadInFlight.get(backupId) === operation) uploadInFlight.delete(backupId);
  }).catch(() => undefined);
  return operation;
}

export async function runScheduledMemberBackupOffsiteWorkflow(options: {
  createBackup?: typeof createMemberBackup;
  uploadBackup?: typeof uploadVerifiedMemberBackupToGoogleDrive;
  preflightStorage?: () => Promise<LocalRetentionResult | null>;
  pruneBackups?: () => Promise<LocalRetentionResult | unknown>;
  driveRetentionPlan?: () => Promise<DriveRetentionPlan | null>;
  finalStorage?: () => Promise<MemberBackupStorageMetrics | null>;
} = {}) {
  const createBackup = options.createBackup ?? createMemberBackup;
  const uploadBackup = options.uploadBackup ?? uploadVerifiedMemberBackupToGoogleDrive;
  const customCreate = Boolean(options.createBackup);
  const verifyOffsite = async (backup: MemberBackupSummary) => Boolean(await findVerifiedMemberBackupOnGoogleDrive(backup.backupId));
  const preflightStorage = options.preflightStorage
    ?? (customCreate ? async () => null : () => ensureAutomaticBackupStorage({ verifyOffsite }));
  const pruneBackups = options.pruneBackups
    ?? (customCreate ? async () => ({ removed: [] }) : () => applyLocalCronRetention({ verifyOffsite }));
  const driveRetentionPlan = options.driveRetentionPlan
    ?? (customCreate ? async () => null : () => getGoogleDriveMemberBackupRetentionPlan());
  const finalStorage = options.finalStorage
    ?? (customCreate ? async () => null : () => readMemberBackupStorageMetrics());
  const preflight = await preflightStorage();
  const local = await createBackup({ source: "railway_cron" });
  let offsite: GoogleDriveBackupMetadata;
  try { offsite = await uploadBackup(local.manifest.backupId); }
  catch (error) {
    if (error instanceof GoogleDriveMemberBackupError) {
      throw new GoogleDriveMemberBackupError(error.code, error.message, { cause: error, googleStatus: error.googleStatus, backupId: local.manifest.backupId });
    }
    throw new GoogleDriveMemberBackupError("upload-failed", "Google Drive offsite backup failed", { cause: error, backupId: local.manifest.backupId });
  }
  const retention = await pruneBackups();
  let driveRetention: DriveRetentionPlan | { dryRun: true; status: "unavailable"; code: GoogleDriveMemberBackupFailureCode } | null;
  try { driveRetention = await driveRetentionPlan(); }
  catch (error) {
    driveRetention = {
      dryRun: true,
      status: "unavailable",
      code: error instanceof GoogleDriveMemberBackupError ? error.code : "verification-failed",
    };
  }
  const storage = await finalStorage();
  return { local, offsite, preflight, retention, driveRetention, storage };
}
