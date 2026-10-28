import "server-only";
import { assertAssetImageAvailable } from "./assetImages";
import { ImageSafetyError } from "./websiteImages";
import { DEFAULT_SERVICE_HERO, type ServiceHero } from "./customerServiceHero";
import { ServiceValidationError } from "./customerServiceContent";
import { isMeaningfulAssetText } from "./assetMetadata";

/** Presentation fallback only; validation and file resolution belong to the shared Asset system. */
export async function assertServiceHeroAvailable(hero: ServiceHero, inspect = true) {
  if (hero.src === DEFAULT_SERVICE_HERO.src) return;
  try { await assertAssetImageAvailable(hero.src, inspect); }
  catch (error) { if (error instanceof ImageSafetyError) throw new ServiceValidationError(error.message); throw error; }
}
export async function resolveServiceHero(hero?: ServiceHero | null): Promise<ServiceHero> {
  if (!hero) return { ...DEFAULT_SERVICE_HERO };
  try { await assertServiceHeroAvailable(hero, false); return { ...hero, alt: isMeaningfulAssetText(hero.alt) ? hero.alt : "" }; }
  catch (error) { if (error instanceof ServiceValidationError || (error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_SERVICE_HERO }; throw error; }
}
