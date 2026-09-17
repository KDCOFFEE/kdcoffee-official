import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const drive = await import("../lib/googleDriveMemberBackup");

const backupId = "20260917T010203Z_1234abcd";
const folderId = "1ZjCROB2zWNIXp6E55W5Txs39JpMZRc2x";
const secrets = {
  GOOGLE_DRIVE_CLIENT_ID: "client-id-secret-marker",
  GOOGLE_DRIVE_CLIENT_SECRET: "client-secret-marker",
  GOOGLE_DRIVE_REFRESH_TOKEN: "refresh-token-marker",
  GOOGLE_DRIVE_BACKUP_FOLDER_ID: folderId,
};
const accessToken = "access-token-marker";
const fileId = "drive_file_1234567890";
const fileName = `kdcoffee-member-backup_${backupId}.zip`;
const zipBytes = 4;
const uploadedFile = {
  id: fileId,
  name: fileName,
  size: String(zipBytes),
  createdTime: "2026-09-17T01:05:00.000Z",
  webViewLink: "https://drive.google.com/file/d/drive_file_1234567890/view",
  mimeType: "application/zip",
  parents: [folderId],
  appProperties: { kdBackupId: backupId, kdBackupType: "member-backup" },
  md5Checksum: "098f6bcd4621d373cade4e832627b4f6",
};

let passed = 0;
async function check(name: string, operation: () => void | Promise<void>) {
  await operation();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }, ...init });
}

function fakeVerified() {
  return {
    directory: path.join(process.cwd(), "data", "backups", "members", backupId),
    files: [],
    manifest: {
      backupId,
      status: "verified",
      source: "railway_cron",
      environment: "production",
      gitCommit: "c0d6625-test",
      createdAt: "2026-09-17T01:02:03.000Z",
      counts: { canonicalMembers: 7, orders: 10 },
    },
  } as unknown as import("../lib/memberBackup").VerifiedMemberBackup;
}

function fakeArtifact() {
  return {
    bytes: zipBytes,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2, 3, 4]));
        controller.close();
      },
    }),
  };
}

type CapturedCall = { url: string; init: RequestInit };

function successfulFetcher(options: { duplicate?: boolean; failUpload?: boolean } = {}) {
  const calls: CapturedCall[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") return jsonResponse({ access_token: accessToken, expires_in: 3600 });
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) return jsonResponse({ files: options.duplicate ? [uploadedFile] : [] });
    if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files?") && init.method === "POST") {
      return new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test-session" } });
    }
    if (url.includes("upload_id=test-session") && init.method === "PUT") {
      if (options.failUpload) return jsonResponse({ error: { message: "private google detail" } }, { status: 500 });
      return jsonResponse(uploadedFile);
    }
    if (url.startsWith(`https://www.googleapis.com/drive/v3/files/${fileId}?`)) return jsonResponse(uploadedFile);
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
  return { calls, fetcher };
}

const uploadOptions = (fetcher: typeof fetch) => ({
  environment: secrets,
  fetcher,
  now: new Date("2026-09-17T01:06:00.000Z"),
  resolveVerifiedBackup: async () => fakeVerified(),
  createZipArtifact: async () => fakeArtifact(),
});

await check("readiness reports missing environment names only", () => {
  const readiness = drive.googleDriveMemberBackupReadiness({ GOOGLE_DRIVE_CLIENT_ID: "configured" });
  assert.equal(readiness.configured, false);
  assert.deepEqual(readiness.missing, ["GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_DRIVE_REFRESH_TOKEN", "GOOGLE_DRIVE_BACKUP_FOLDER_ID"]);
});

await check("readiness never exposes credential values", () => {
  const serialized = JSON.stringify(drive.googleDriveMemberBackupReadiness(secrets));
  for (const secret of Object.values(secrets)) assert.doesNotMatch(serialized, new RegExp(secret, "u"));
});

await check("OAuth refresh request is correctly constructed", async () => {
  const mock = successfulFetcher({ duplicate: true });
  await drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(mock.fetcher));
  const token = mock.calls[0];
  assert.equal(token.url, "https://oauth2.googleapis.com/token");
  assert.equal(token.init.method, "POST");
  const body = new URLSearchParams(String(token.init.body));
  assert.equal(body.get("client_id"), secrets.GOOGLE_DRIVE_CLIENT_ID);
  assert.equal(body.get("client_secret"), secrets.GOOGLE_DRIVE_CLIENT_SECRET);
  assert.equal(body.get("refresh_token"), secrets.GOOGLE_DRIVE_REFRESH_TOKEN);
  assert.equal(body.get("grant_type"), "refresh_token");
});

await check("OAuth failure is sanitized", async () => {
  const fetcher: typeof fetch = async () => jsonResponse({ error: "invalid_grant", detail: secrets.GOOGLE_DRIVE_REFRESH_TOKEN }, { status: 400 });
  await assert.rejects(
    () => drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(fetcher)),
    (error: unknown) => error instanceof drive.GoogleDriveMemberBackupError && error.code === "oauth-refresh-failed" && !JSON.stringify(error).includes(secrets.GOOGLE_DRIVE_REFRESH_TOKEN),
  );
});

await check("Authorization token never appears in thrown error payload", async () => {
  const fetcher: typeof fetch = async (input) => {
    if (String(input) === "https://oauth2.googleapis.com/token") return jsonResponse({ access_token: accessToken });
    throw new Error(`network failed with ${accessToken}`);
  };
  await assert.rejects(
    () => drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(fetcher)),
    (error: unknown) => error instanceof drive.GoogleDriveMemberBackupError && !error.message.includes(accessToken) && !JSON.stringify(error).includes(accessToken),
  );
});

await check("configured folder ID is used for lookup and upload metadata", async () => {
  const mock = successfulFetcher();
  await drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(mock.fetcher));
  const lookup = new URL(mock.calls[1].url);
  assert.match(lookup.searchParams.get("q") ?? "", new RegExp(folderId, "u"));
  const metadata = JSON.parse(String(mock.calls[2].init.body));
  assert.deepEqual(metadata.parents, [folderId]);
});

await check("arbitrary folder override is ignored", async () => {
  const mock = successfulFetcher();
  await drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, { ...uploadOptions(mock.fetcher), folderId: "attacker-folder" } as never);
  const metadata = JSON.parse(String(mock.calls[2].init.body));
  assert.deepEqual(metadata.parents, [folderId]);
  assert.doesNotMatch(JSON.stringify(metadata), /attacker-folder/u);
});

await check("only a canonically verified backup can upload", async () => {
  let fetchCount = 0;
  await assert.rejects(() => drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, {
    ...uploadOptions(async () => { fetchCount += 1; return new Response(); }),
    resolveVerifiedBackup: async () => { throw new Error("checksum mismatch"); },
  }), (error: unknown) => error instanceof drive.GoogleDriveMemberBackupError && error.code === "verification-failed");
  assert.equal(fetchCount, 0);
});

await check("path traversal and arbitrary identifiers are rejected before lookup", async () => {
  let resolved = false;
  await assert.rejects(() => drive.uploadVerifiedMemberBackupToGoogleDrive("../../private.zip", {
    ...uploadOptions(async () => new Response()),
    resolveVerifiedBackup: async () => { resolved = true; return fakeVerified(); },
  }), (error: unknown) => error instanceof drive.GoogleDriveMemberBackupError && error.code === "verification-failed");
  assert.equal(resolved, false);
});

await check("upload metadata includes canonical appProperties", async () => {
  const mock = successfulFetcher();
  await drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(mock.fetcher));
  const metadata = JSON.parse(String(mock.calls[2].init.body));
  assert.equal(metadata.name, fileName);
  assert.equal(metadata.mimeType, "application/zip");
  assert.deepEqual(metadata.appProperties, {
    kdBackupId: backupId,
    kdBackupType: "member-backup",
    kdSource: "railway_cron",
    kdEnvironment: "production",
    kdGitCommit: "c0d6625-test",
    kdCreatedAt: "2026-09-17T01:02:03.000Z",
    kdMemberCount: "7",
    kdOrderCount: "10",
  });
});

await check("successful resumable upload returns verified safe metadata", async () => {
  const mock = successfulFetcher();
  const result = await drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(mock.fetcher));
  assert.deepEqual(result, {
    status: "uploaded",
    driveFileId: fileId,
    name: fileName,
    size: zipBytes,
    createdTime: uploadedFile.createdTime,
    webViewLink: uploadedFile.webViewLink,
    md5Checksum: uploadedFile.md5Checksum,
    backupId,
    uploadedAt: "2026-09-17T01:06:00.000Z",
  });
  assert.equal(mock.calls[3].init.method, "PUT");
  assert.equal(new Headers(mock.calls[3].init.headers).get("Content-Length"), String(zipBytes));
});

await check("duplicate canonical backup is detected idempotently", async () => {
  const mock = successfulFetcher({ duplicate: true });
  const result = await drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(mock.fetcher));
  assert.equal(result.status, "already-uploaded");
  assert.equal(result.driveFileId, fileId);
});

await check("duplicate detection performs no upload initialization", async () => {
  const mock = successfulFetcher({ duplicate: true });
  await drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(mock.fetcher));
  assert.equal(mock.calls.length, 2);
  assert.equal(mock.calls.some((call) => call.url.startsWith("https://www.googleapis.com/upload/")), false);
});

await check("concurrent requests for the same backup share one upload", async () => {
  const mock = successfulFetcher();
  const first = drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(mock.fetcher));
  const second = drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(mock.fetcher));
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(left, right);
  assert.equal(mock.calls.filter((call) => call.url.includes("uploadType=resumable") && call.init.method === "POST").length, 1);
});

await check("upload failure is sanitized", async () => {
  const mock = successfulFetcher({ failUpload: true });
  await assert.rejects(() => drive.uploadVerifiedMemberBackupToGoogleDrive(backupId, uploadOptions(mock.fetcher)), (error: unknown) => error instanceof drive.GoogleDriveMemberBackupError && error.code === "upload-failed" && !error.message.includes("private google detail"));
});

await check("scheduled upload failure keeps local backup and skips pruning", async () => {
  const calls: string[] = [];
  await assert.rejects(() => drive.runScheduledMemberBackupOffsiteWorkflow({
    createBackup: async () => { calls.push("create"); return { manifest: fakeVerified().manifest, path: fakeVerified().directory } as never; },
    uploadBackup: async () => { calls.push("upload"); throw new drive.GoogleDriveMemberBackupError("upload-failed", "safe failure"); },
    pruneBackups: async () => { calls.push("prune"); return { retentionDays: 90, removed: [] }; },
  }), (error: unknown) => error instanceof drive.GoogleDriveMemberBackupError && error.backupId === backupId);
  assert.deepEqual(calls, ["create", "upload"]);
});

await check("cron pruning runs only after verified offsite success", async () => {
  const calls: string[] = [];
  await drive.runScheduledMemberBackupOffsiteWorkflow({
    createBackup: async () => { calls.push("create"); return { manifest: fakeVerified().manifest, path: fakeVerified().directory } as never; },
    uploadBackup: async () => { calls.push("upload"); return { status: "uploaded", backupId } as never; },
    pruneBackups: async () => { calls.push("prune"); return { retentionDays: 90, removed: [] }; },
  });
  assert.deepEqual(calls, ["create", "upload", "prune"]);
});

await check("manual Admin backup remains local-only and no-prune", async () => {
  const source = await readFile(path.join(process.cwd(), "app/api/admin/member-backups/route.ts"), "utf8");
  assert.doesNotMatch(source, /GoogleDrive|uploadVerified|pruneMemberBackups/u);
  assert.match(source, /source: "manual_admin"/u);
});

await check("I1 reuses canonical backup verification and ZIP generation", async () => {
  const source = await readFile(path.join(process.cwd(), "lib/googleDriveMemberBackup.ts"), "utf8");
  assert.match(source, /getVerifiedMemberBackupForDownload/u);
  assert.match(source, /createMemberBackupZipArtifact/u);
  assert.doesNotMatch(source, /fs\.readFile|createReadStream|path\.join/u);
});

assert.equal(passed, 19);
console.log(`\nPHASE J.5D.5B-I1: ${passed}/19 PASS`);
