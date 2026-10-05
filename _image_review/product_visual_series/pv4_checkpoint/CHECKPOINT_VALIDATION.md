# PV.4 checkpoint validation

2026-10-05 · local project · no deployment. Next.js 16.2.10 / local docs checked. Validation commands rerun in this PV.4 turn.

| CHECK | RESULT | COMMAND / EVIDENCE |
| --- | --- | --- |
| TypeScript | PASS; exit 0 | node node_modules/next/dist/bin/next typegen; then node node_modules/typescript/bin/tsc --noEmit --incremental false |
| Cart | PASS | node --experimental-strip-types --import ./scripts/member-auth-test-bootstrap.mjs scripts/test-order-checkout-regression.ts |
| Checkout | PASS | Same existing order/cart/checkout regression, output: Order/cart/checkout regression PASS |
| Mini-cart | **60/60 PASS** | node --experimental-strip-types scripts/test-phase-product-ordering-mini-cart.mts |
| Works / Product shape and safety | **24/24 PASS** | Existing PD.1A validate-data.cjs: canonical / shape / Admin loader / pricing rejection / images / empty SKU metadata / listing / roast rules |
| Approved composite reproduction | **8/8 PASS** | node _image_review/product_visual_series/pv4_checkpoint/REPRODUCE_APPROVED_FINALS.cjs; reconstructed in memory, exact final PNG/WebP SHA-256 and layer/shadow pixels match, no images written |
| Working original 23 semantic comparison | PASS | Deep equality including order vs PD.1A before snapshot; original 46 sale SKUs unchanged |
| Planned staged original 23 semantic comparison | PASS | Deep equality including order vs HEAD 435b878; all other top-level/menu fields equal HEAD |
| New staged records | PASS | Exact equality with current P00024/P00025 records; stock=0; no price field, no SKU field, empty purchase/skus, unpublished/unavailable |
| Protected working files | PASS | SHA-256 equality for 743 website/data/source/config files captured before PV.4 |
| Source / background / approved final files | PASS | Hashes checked against PV.3A/PV.3B and approved manifest; no image pixel modifications |

Admin visibility here is validated through the existing Admin data loader; existing UI proof was established in PD.1A. Public listing remains unchanged. Forged regular and custom-roast checkout for both drafts rejected before pricing. Known direct detail URLs are not private: unpublished means excluded from public listings and unavailable for purchase.

Existing commerce addProduct requires at least one SKU (lib/productCommerceUpdates.ts); a SKU requires an integer price >=0. The canonical CoffeeArtwork base record can exist with purchase=[] / skus=[] and no price. No commerce activation, fake price, fake SKU, schema changes, pricing/inventory logic changes or activation changes were made.

The Git index is prepared from committed HEAD plus only the two authorized records; unrelated earlier working JSON changes remain unstaged. Four existing public media files are necessary dependencies of those draft records, not website replacement by approved final images.

[Approved hashes / geometry / balance](APPROVED_ASSET_MANIFEST.json) · [Exact selected files](CHECKPOINT_FILE_SELECTION.md) · [Owner Approval](../PRODUCT_VISUAL_APPROVAL_V1.md)
