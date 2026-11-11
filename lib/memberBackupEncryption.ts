import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";

import type { MemberBackupZipArtifact, VerifiedMemberBackup } from "./memberBackup";
import { createMemberBackupZipArtifact } from "./memberBackup";

export const MEMBER_BACKUP_ENVELOPE_FORMAT = "KDCOFFEE-KDCBAK-CMS-1" as const;

export type EncryptedMemberBackupArtifact = {
  format: typeof MEMBER_BACKUP_ENVELOPE_FORMAT;
  backupId: string;
  name: string;
  bytes: number;
  sha256: string;
  plaintextZipSha256: string;
  keyId: string;
  body: Uint8Array;
};

function sha256(value: Uint8Array) { return createHash("sha256").update(value).digest("hex"); }

async function readArtifact(artifact: MemberBackupZipArtifact) {
  const reader = artifact.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function encryptCms(input: Uint8Array, certificatePath: string, opensslPath: string) {
  return await new Promise<Buffer>((resolve, reject) => {
    const process = spawn(opensslPath, ["cms", "-encrypt", "-binary", "-aes-256-gcm", "-outform", "DER", "-recip", certificatePath, "-keyopt", "rsa_padding_mode:oaep", "-keyopt", "rsa_oaep_md:sha256", "-keyopt", "rsa_mgf1_md:sha256"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const output: Buffer[] = []; const errors: Buffer[] = [];
    process.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    process.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    process.once("error", () => reject(new Error("Member backup encryption tool could not start")));
    process.once("close", (code) => {
      if (code !== 0) return reject(new Error(`Member backup encryption failed (OpenSSL exit ${code ?? -1})`));
      const encrypted = Buffer.concat(output);
      if (encrypted.length < 32 || errors.length > 0 && Buffer.concat(errors).length > 8192) return reject(new Error("Member backup encryption output is invalid"));
      resolve(encrypted);
    });
    process.stdin.end(input);
  });
}

export function memberBackupEncryptionEnabled(environment: Readonly<Record<string, string | undefined>> = process.env) {
  return environment.KD_MEMBER_BACKUP_ENCRYPTION_ENABLED === "true";
}

export async function createEncryptedMemberBackupArtifact(verified: VerifiedMemberBackup, options: {
  certificatePath: string;
  opensslPath: string;
  createZipArtifact?: typeof createMemberBackupZipArtifact;
}): Promise<EncryptedMemberBackupArtifact> {
  const certificate = await fs.readFile(options.certificatePath);
  if (!certificate.includes(Buffer.from("-----BEGIN CERTIFICATE-----"))) throw new Error("Member backup encryption certificate is not PEM X.509");
  const zip = await (options.createZipArtifact ?? createMemberBackupZipArtifact)(verified);
  const plaintext = await readArtifact(zip);
  if (plaintext.length !== zip.bytes || plaintext.length < 22) throw new Error("Verified member backup ZIP bytes are invalid");
  const encrypted = await encryptCms(plaintext, options.certificatePath, options.opensslPath);
  return {
    format: MEMBER_BACKUP_ENVELOPE_FORMAT,
    backupId: verified.manifest.backupId,
    name: `kdcoffee-member-backup_${verified.manifest.backupId}.kdcbak`,
    bytes: encrypted.length,
    sha256: sha256(encrypted),
    plaintextZipSha256: sha256(plaintext),
    keyId: sha256(certificate).slice(0, 32),
    body: encrypted,
  };
}
