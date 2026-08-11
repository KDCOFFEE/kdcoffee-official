# KD Coffee Studio v15.0.0 Developer Edition

## Scope
This is a stability foundation release. It does not require LINE Login for shopping and does not add new storefront features.

## Changes
- Strengthened click and touch behavior for global navigation, hero actions, work cards, product options, cart actions and checkout links.
- Decorative overlays no longer intercept pointer events.
- Checkout explicitly states that customers can purchase without LINE Login.
- Launcher updated to v5.2.0.
- Removed automatic full-project backup before every update.
- PATCH updates temporarily preserve only modified files and restore them when the PATCH fails.
- FULL updates require an explicit `FULL` confirmation. Manual full backup remains available.

## First test after extraction
1. Delete `.next` if it exists.
2. Run `npm install` only when `node_modules` is missing.
3. Start the site from Launcher.
4. Hard refresh the desktop browser; reopen the page on mobile.
5. Test `/works`, product options, Add to Cart, Buy Now and guest Checkout.
