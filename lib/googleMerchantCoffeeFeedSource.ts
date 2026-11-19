import 'server-only';
import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { getLiveWebsiteData } from '@/data/websiteData';
import { getArtworkUploadDir, getAssetsUploadDir, getCampaignUploadDir, getHome003UploadDir, getStorageRootContract } from '@/lib/storagePaths';
import { CUSTOM_SECTION_IMAGE_LIMITS } from '@/lib/media';
import { resolveWorksProductListing } from '@/lib/productListing';
import { resolveProductAsset } from '@/lib/productVisualAssets';
import { buildGoogleMerchantCoffeeFeedDraft, isUnpurchasableMerchantPreview } from './googleMerchantCoffeeFeedCore';
import { inspectGoogleMerchantLiveEvidence, merchantProductImageUrl } from './googleMerchantCoffeeLiveEvidence';
import type { EvidenceProduct, ImageSuggestion } from './googleMerchantCoffeeLiveEvidence';
import type { ExplicitSkuAttestation } from './googleMerchantCoffeeFeedReconciliation';

const MAX_IMAGE_BYTES = CUSTOM_SECTION_IMAGE_LIMITS.maxBytes;
const MAX_FEED_IMAGE_BYTES = 192 * 1024 * 1024;
const IMAGE_READ_CHUNK_BYTES = 64 * 1024;
const VERIFICATION_TIMEOUT_MS = 30_000;
type ImageFile = {file: string; stat: Stats};
type ImageBudget = {remaining: number; buffer: Buffer; deadline: number};

async function readListedCoffee() {
  const live = await getLiveWebsiteData();
  if (!Array.isArray(live?.menu?.products) || live.menu.products.some(product =>
    !product || typeof product !== 'object' || Array.isArray(product) ||
    (product.inMonthlyMenu !== undefined && typeof product.inMonthlyMenu !== 'boolean'))) {
    throw new Error('invalid_coffee_source');
  }
  return resolveWorksProductListing(live.menu.products);
}

export function suggestPhoto(product: unknown): ImageSuggestion | null {
  const candidate = resolveProductAsset(product);
  if (!candidate || !['productPhoto', 'productVisual'].includes(candidate.key)) return null;
  return {path:candidate.path,key:candidate.key};
}

/** Match Next's exact public path first, then the website's named upload routes. */
async function findMerchantImageFile(url: string): Promise<ImageFile | undefined> {
  if (merchantProductImageUrl(url) !== url) return;
  const pathname = new URL(url).pathname;
  const upload = /^\/uploads\/(artworks|assets)\/([A-Za-z0-9-]+)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(pathname);
  const image = /^\/images\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pathname);
  if ((!upload && !image) || !/\.(?:avif|gif|jpe?g|png|webp)$/i.test(pathname)) return;
  const fileName = path.posix.basename(pathname);
  const files = [path.join(process.cwd(), 'public', pathname.slice(1))];
  if (upload) {
    const dir = upload[1] === 'artworks' ? getArtworkUploadDir(upload[2]) : getAssetsUploadDir(upload[2]);
    files.push(path.join(dir, fileName));
  } else if (path.posix.dirname(pathname) === '/images/campaigns') {
    files.push(path.join(getCampaignUploadDir(), fileName));
  } else if (path.posix.dirname(pathname) === '/images/home003') {
    files.push(path.join(getHome003UploadDir(), fileName));
  }
  for (const file of new Set(files)) {
    const stat = await lstat(/* turbopackIgnore: true */ file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) continue;
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_IMAGE_BYTES ||
        await realpath(/* turbopackIgnore: true */ file) !== file) return;
    return {file, stat};
  }
}

function imageUnchanged(before: Stats, stat: Stats) {
  return stat.isFile() && stat.dev === before.dev && stat.ino === before.ino &&
    stat.size === before.size && stat.mtimeMs === before.mtimeMs && stat.ctimeMs === before.ctimeMs;
}

export function checkDeadline(budget: ImageBudget) {
  if (performance.now() >= budget.deadline) throw new Error('merchant_image_verification_timeout');
}

async function merchantProductImageSha256({file, stat}: ImageFile, budget: ImageBudget, url?: string) {
  chargeMerchantImageBytes(budget, stat.size);
  const handle = await open(/* turbopackIgnore: true */ file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!imageUnchanged(stat, await handle.stat())) throw new Error('merchant_image_changed');
    const hash = createHash('sha256');
    let offset = 0;
    while (offset < stat.size) {
      checkDeadline(budget);
      const length = Math.min(budget.buffer.length, stat.size - offset);
      const {bytesRead} = await handle.read(budget.buffer, 0, length, offset);
      if (!bytesRead) throw new Error('merchant_image_changed');
      if (url && offset === 0 && !matchesMerchantImage(url, budget.buffer.subarray(0, bytesRead))) return null;
      hash.update(budget.buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    if (!imageUnchanged(stat, await handle.stat())) throw new Error('merchant_image_changed');
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

export function createMerchantImageBudget() {
  return {remaining:MAX_FEED_IMAGE_BYTES, buffer:Buffer.alloc(IMAGE_READ_CHUNK_BYTES),
    deadline:performance.now() + VERIFICATION_TIMEOUT_MS};
}

export function chargeMerchantImageBytes(budget: ImageBudget, size: number) {
  checkDeadline(budget);
  if (size > budget.remaining) throw new Error('merchant_feed_image_budget_exceeded');
  budget.remaining -= size;
}

export function matchesMerchantImage(url: string, bytes: Buffer) {
  const ext = path.posix.extname(new URL(url).pathname).toLowerCase();
  const tag = (start: number, end: number) => bytes.toString('ascii', start, end);
  if (ext === '.jpg' || ext === '.jpeg') return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (ext === '.png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (ext === '.gif') return ['GIF87a', 'GIF89a'].includes(tag(0, 6));
  if (ext === '.webp') return tag(0, 4) === 'RIFF' && tag(8, 12) === 'WEBP';
  return ext === '.avif' && tag(4, 8) === 'ftyp' && ['avif', 'avis'].includes(tag(8, 12));
}

export async function verifyLocalMerchantProductImage(url: string, budget: ImageBudget) {
  checkDeadline(budget);
  const identity = await findMerchantImageFile(url);
  if (!identity) return null;
  const sha256 = await merchantProductImageSha256(identity, budget, url);
  if (!sha256) return null;
  return { sha256, async recheck() {
    checkDeadline(budget);
    const current = await findMerchantImageFile(url);
    if (!current || current.file !== identity.file || !imageUnchanged(identity.stat, current.stat)) {
      throw new Error('merchant_image_changed');
    }
  } };
}

/** The SAME /works source, no second catalog, no HTTP route, no writes.
 * Merchant output stays blocked until images and checkout are actually approved. */
export async function inspectLiveGoogleMerchantCoffeeDraft() {
  return buildGoogleMerchantCoffeeFeedDraft(await readListedCoffee());
}

/** G.5F.2 evidence: public selector, price/stock fields and ONLY actual product
 * photo candidates. These suggestions never satisfy owner approval automatically. */
export async function inspectLiveGoogleMerchantCoffeeEvidence() {
  return inspectGoogleMerchantLiveEvidence(await readListedCoffee(), suggestPhoto);
}

/** G.5F.3: the same read snapshot for selection and commercial draft. The
 * caller must supply independently verified owner/checkout attestations. */
async function verifyMerchantFeed(listed: Awaited<ReturnType<typeof readListedCoffee>>,
  attestations: readonly ExplicitSkuAttestation[], version: string) {
  const budget = createMerchantImageBudget();
  const approvedUrls = new Set(attestations.map(approval => approval.approvedProductImageUrl));
  const images = new Map<string, {identity: ImageFile; sha256: string}>();
  const photos = new Map<EvidenceProduct, ImageSuggestion | null>(
    listed.filter(product => !isUnpurchasableMerchantPreview(product)).map(product => [product, suggestPhoto(product)]),
  );
  for (const photo of photos.values()) {
    const url = merchantProductImageUrl(photo?.path);
    if (url && approvedUrls.has(url) && !images.has(url)) {
      checkDeadline(budget);
      const identity = await findMerchantImageFile(url);
      if (!identity) throw new Error('merchant_image_unavailable');
      images.set(url, {identity, sha256:(await merchantProductImageSha256(identity, budget))!});
    }
  }
  const { reconcileLiveCoffeeToMerchantFeed } = await import('./googleMerchantCoffeeFeedReconciliation');
  const result = reconcileLiveCoffeeToMerchantFeed(listed, product => {
    const photo = photos.get(product);
    const url = merchantProductImageUrl(photo?.path);
    return photo && url ? {...photo,sha256:images.get(url)?.sha256} : null;
  }, attestations);
  if (result.draft.tsv === null) return result;
  if (sourceVersion(await readListedCoffee(), attestations) !== version) throw new Error('merchant_catalog_changed');
  // Re-resolve the URL after all hashes. A replacement or new static override must fail closed.
  for (const [url, {identity}] of images) {
    checkDeadline(budget);
    const current = await findMerchantImageFile(url);
    if (!current || current.file !== identity.file || !imageUnchanged(identity.stat, current.stat)) {
      throw new Error('merchant_image_changed');
    }
  }
  checkDeadline(budget);
  return result;
}

function sourceVersion(listed: Awaited<ReturnType<typeof readListedCoffee>>, attestations: readonly ExplicitSkuAttestation[]) {
  return createHash('sha256').update(JSON.stringify([process.cwd(), getStorageRootContract(), listed, attestations])).digest('hex');
}

let inFlight: {version: string; result: ReturnType<typeof verifyMerchantFeed>} | undefined;

export async function inspectLiveGoogleMerchantCoffeeReconciliation(
  attestations: readonly ExplicitSkuAttestation[] = [],
) {
  if (getStorageRootContract().source === 'local') throw new Error('persistent_coffee_source_required');
  const listed = await readListedCoffee();
  const version = sourceVersion(listed, attestations);
  if (inFlight) {
    if (inFlight.version !== version) throw new Error('merchant_feed_verification_busy');
    return inFlight.result;
  }
  // Admit one image-verification job per process, with no queue or retained result.
  const result = verifyMerchantFeed(listed, attestations, version).finally(() => { inFlight = undefined; });
  inFlight = {version, result};
  return result;
}
