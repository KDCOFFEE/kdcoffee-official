import type { StoreProduct, StoreSection } from "./storeTypes";

/** Admin preview only. There is no shared configurable site-brand helper today. */
export function storeSeoPreview(value: Pick<StoreProduct | StoreSection, "name" | "shortDescription" | "description" | "seoTitle" | "seoDescription">) {
  const manualTitle = value.seoTitle?.trim();
  const manualDescription = value.seoDescription?.trim();
  const description = value.shortDescription.trim() || value.description.trim();
  return {
    title: manualTitle || value.name.trim(),
    description: manualDescription || Array.from(description).slice(0, 500).join(""),
    titleIsManual: Boolean(manualTitle),
    descriptionIsManual: Boolean(manualDescription),
  };
}
