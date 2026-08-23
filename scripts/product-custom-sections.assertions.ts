import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getProductCustomSectionAnimationAttributes,
  productCustomSectionAnchor,
  resolveProductCustomSectionSlot,
  sortProductCustomSections,
} from "../lib/productCustomSections";
import {
  ProductCustomSectionsValidationError,
  normalizeProductCustomSections,
  resolveProductCustomSections,
} from "../lib/productCustomSectionsValidation";
import {
  customSectionLayoutLabels,
  customSectionAnimationEffectLabels,
  customSectionAnimationTriggerLabels,
  customSectionPlacementLabels,
} from "../components/admin/productCustomSectionAdminLabels";

const CS1 = "cs-11111111-1111-4111-8111-111111111111";
const CS2 = "cs-22222222-2222-4222-8222-222222222222";
const FI1 = "fi-11111111-1111-4111-8111-111111111111";
const FI2 = "fi-22222222-2222-4222-8222-222222222222";
const FI3 = "fi-33333333-3333-4333-8333-333333333333";
const textSection = { id: CS1, adminName: "Story", enabled: true, type: "text", placement: "after_profile", order: 20, layout: "standard", content: { eyebrow: "STORY", heading: "A heading", body: "A body" } };
const featureItems = [
  { id: FI1, title: "One", body: "First", icon: "flavor" },
  { id: FI2, title: "Two", body: "Second", icon: "origin" },
  { id: FI3, title: "Three", body: "Third", icon: "process" },
];
const featuresSection = { id: CS2, adminName: "Proofs", enabled: true, type: "features", placement: "page_bottom", order: 40, layout: "grid", content: { heading: "Proofs", items: featureItems } };

// A. Missing data remains migration-free.
assert.deepEqual(normalizeProductCustomSections(undefined), []);
assert.deepEqual(resolveProductCustomSections(undefined), []);
// B–C. Enabled and disabled records are preserved; runtime filtering is explicit.
assert.equal(normalizeProductCustomSections([textSection])[0].enabled, true);
const disabled = normalizeProductCustomSections([{ ...textSection, enabled: false, content: {} }]);
assert.equal(disabled[0].enabled, false);
assert.equal(disabled.filter((section) => section.enabled).length, 0);
// D. Same-slot ordering is deterministic by order, then stable ID.
const ordered = sortProductCustomSections(normalizeProductCustomSections([{ ...textSection, order: 10 }, { ...featuresSection, placement: "after_profile", order: 10 }]));
assert.deepEqual(ordered.map((section) => section.id), [CS1, CS2]);
// E. Editing labels does not alter identity or anchor.
const renamed = normalizeProductCustomSections([{ ...textSection, adminName: "Renamed", content: { ...textSection.content, heading: "Changed" } }])[0];
assert.equal(renamed.id, CS1);
assert.equal(productCustomSectionAnchor(renamed.id), `custom-${CS1}`);
// F–I. Type, unknown-field stripping, count and duplicate section guards.
assert.throws(() => normalizeProductCustomSections([{ ...textSection, type: "media" }]), ProductCustomSectionsValidationError);
assert.deepEqual(normalizeProductCustomSections([{ ...textSection, unknown: "discard", content: { ...textSection.content, rawHtml: "discard" } }]), [textSection]);
assert.throws(() => normalizeProductCustomSections(Array.from({ length: 11 }, (_, index) => ({ ...textSection, id: `cs-${String(index).padStart(8, "0")}-1111-4111-8111-111111111111` }))), ProductCustomSectionsValidationError);
assert.throws(() => normalizeProductCustomSections([textSection, textSection]), ProductCustomSectionsValidationError);
// J–L. Feature item acceptance and collection identity guards.
assert.equal(normalizeProductCustomSections([featuresSection])[0].type, "features");
assert.throws(() => normalizeProductCustomSections([{ ...featuresSection, content: { items: [...featureItems, ...featureItems, featureItems[0]] } }]), ProductCustomSectionsValidationError);
assert.throws(() => normalizeProductCustomSections([{ ...featuresSection, content: { items: [featureItems[0], featureItems[0]] } }]), ProductCustomSectionsValidationError);
// M. Optional blank copy is stripped safely.
assert.deepEqual(normalizeProductCustomSections([{ ...textSection, enabled: false, content: { eyebrow: " ", heading: " ", body: " " } }])[0].content, {});
// N. Animation limits are normalized and child animation is not accepted.
const animated = normalizeProductCustomSections([{ ...textSection, animation: { enabled: true, effect: "invalid", durationMs: 99999, delayMs: -50, children: { left: { effect: "fade" } } } }])[0];
assert.equal(animated.animation?.effect, "fade");
assert.equal(animated.animation?.durationMs, 1500);
assert.equal(animated.animation?.delayMs, 0);
assert.equal(animated.animation?.children, undefined);
// O. Custom-section normalization cannot mutate commerce data.
const commerce = { price: 700, skus: [{ id: "sku-1", price: 700, stock: 4 }] };
const commerceBefore = JSON.stringify(commerce);
normalizeProductCustomSections([textSection]);
assert.equal(JSON.stringify(commerce), commerceBefore);
// P. Resolution is product-agnostic and requires no slug allowlist.
const futureProduct = { slug: "coffee-created-next-year", productCustomSections: [featuresSection] };
assert.equal(resolveProductCustomSections(futureProduct.productCustomSections)[0].id, CS2);

// G.3C.1 A. Enabled centered TEXT resolves without changing its controlled layout.
const centered = normalizeProductCustomSections([{ ...textSection, placement: "after_clean_roasting", order: 1, layout: "centered" }])[0];
assert.equal(centered.type, "text");
assert.equal(centered.layout, "centered");
assert.equal(centered.placement, "after_clean_roasting");
// G.3C.1 B. Disabled content remains stored but is absent from the frontend slot plan.
assert.equal(resolveProductCustomSectionSlot(disabled, "after_profile").length, 0);
assert.deepEqual(resolveProductCustomSectionSlot([centered], "after_clean_roasting").map((section) => section.id), [CS1]);
// G.3C.1 C. Centered is text alignment, never a viewport-height template.
const customCss = readFileSync("app/globals.css", "utf8").split("/* Product custom sections:")[1].split(".custom-product-section-manager")[0];
assert.match(customCss, /\.custom-product-section\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;/u);
assert.doesNotMatch(customCss, /100(?:vh|svh|dvh)/u);
// G.3C.1 D. Animation-off content has no hidden-state opt-in or reveal dependency.
const disabledWithAnimation = normalizeProductCustomSections([{ ...textSection, animation: { enabled: false, trigger: "viewport", effect: "fade" } }])[0];
assert.deepEqual(getProductCustomSectionAnimationAttributes(disabledWithAnimation), {});
const rendererSource = readFileSync("components/commerce/CustomProductSectionRenderer.tsx", "utf8");
assert.doesNotMatch(rendererSource, /data-section-reveal/u);
// G.3C.1 E. Enabled animation keeps the existing G.1B managed attributes.
const enabledForAnimation = normalizeProductCustomSections([{ ...textSection, animation: { enabled: true, trigger: "viewport", effect: "fade", threshold: "slight" } }])[0];
const enabledAnimationAttributes = getProductCustomSectionAnimationAttributes(enabledForAnimation);
assert.equal(enabledAnimationAttributes["data-product-animation-managed"], "true");
assert.equal(enabledAnimationAttributes["data-product-animation-enabled"], "true");
assert.equal(enabledAnimationAttributes["data-product-animation-trigger"], "viewport");
// G.3C.1 F–G. Visible-copy edits never change stable identity.
assert.equal(renamed.id, centered.id);
assert.equal(productCustomSectionAnchor(renamed.id), productCustomSectionAnchor(centered.id));
// G.3C.1 H–I. Localized labels are presentation-only; stored enums stay canonical.
assert.equal(customSectionPlacementLabels[centered.placement], "乾淨的烘焙之後");
assert.equal(centered.placement, "after_clean_roasting");
assert.equal(customSectionLayoutLabels[centered.layout], "置中文案");
assert.equal(centered.layout, "centered");
// G.3C.1 J–K. Commerce remains immutable and a legacy product still resolves empty.
assert.equal(JSON.stringify(commerce), commerceBefore);
assert.deepEqual(resolveProductCustomSections({ slug: "legacy-product" }), []);

// G.3C.1A A–B. Traditional Chinese labels remain presentation for canonical enums.
assert.equal(Object.entries(customSectionAnimationEffectLabels).find(([, label]) => label === "淡入")?.[0], "fade");
assert.equal(Object.entries(customSectionAnimationTriggerLabels).find(([, label]) => label === "捲動到此區塊時")?.[0], "viewport");
// G.3C.1A C–I. Disabled emits nothing; enabled configurations preserve exact G.1B attributes.
const fadeSection = normalizeProductCustomSections([{ ...textSection, animation: { enabled: true, trigger: "viewport", effect: "fade", durationMs: 500, delayMs: 120, threshold: "quarter", once: true } }])[0];
const fadeAttributes = getProductCustomSectionAnimationAttributes(fadeSection);
assert.equal(fadeAttributes["data-product-animation-managed"], "true");
assert.equal(fadeAttributes["data-product-animation-enabled"], "true");
assert.equal(fadeAttributes["data-product-animation-effect"], "fade");
assert.equal(fadeAttributes["data-product-animation-trigger"], "viewport");
assert.equal(fadeAttributes["data-product-animation-threshold"], "0.25");
assert.equal(fadeAttributes["data-product-animation-once"], "true");
assert.equal((fadeAttributes.style as Record<string, string>)["--product-animation-duration"], "500ms");
assert.equal((fadeAttributes.style as Record<string, string>)["--product-animation-delay"], "120ms");
const slideUpSection = normalizeProductCustomSections([{ ...textSection, animation: { enabled: true, trigger: "viewport", effect: "slide-up", durationMs: 700, delayMs: 0, threshold: "half", once: false } }])[0];
const slideUpAttributes = getProductCustomSectionAnimationAttributes(slideUpSection);
assert.equal(slideUpAttributes["data-product-animation-effect"], "slide-up");
assert.equal(slideUpAttributes["data-product-animation-threshold"], "0.5");
assert.equal(slideUpAttributes["data-product-animation-once"], "false");
// G.3C.1A J–K. Legacy reveal stays absent and visible base CSS does not override managed state.
assert.doesNotMatch(rendererSource, /data-section-reveal/u);
const customSectionBaseRule = customCss.match(/\.custom-product-section\s*\{([^}]*)\}/u)?.[1] || "";
assert.doesNotMatch(customSectionBaseRule, /opacity|transform/u);
assert.match(customCss, /data-product-animation-enabled="true"[^}]*is-product-animation-ready:not\(\.is-product-animation-active\)[^{]*\{\s*opacity:\s*0/u);
// G.3C.1A L. Animation helpers remain editorial-only.
assert.equal(JSON.stringify(commerce), commerceBefore);

console.log("Product custom section assertions passed.");
