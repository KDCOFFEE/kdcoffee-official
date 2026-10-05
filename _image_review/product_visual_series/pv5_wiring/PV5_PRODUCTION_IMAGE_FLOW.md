# PV.5 Production image flow — safe card wiring

Base: 5026097097ac8ad935be7a4e722050e790edb9a1. Railway service kdcoffee-official / production / CLI deployment. This document describes the validated candidate and isolated runtime, not a completed live migration.

## Canonical chain

Railway storage root /data → /data/store/website-data.json → menu.products[i].assets.productVisual.path and pageLayout.listAsset → lib/productVisualAssets.ts resolveListAsset → existing ProductVisualMedia / Home004ProductMedia → /uploads/artworks/<slug>/<file> → Next public-static match (when the exact repository file exists), otherwise the existing app/uploads/artworks/[artworkSlug]/[fileName]/route.ts → /data/uploads/artworks/<slug>/<file>.

data/websiteData.ts getLiveWebsiteData and Admin products use storagePaths.getWebsiteDataFile. With KD_DATA_DIR=/data or RAILWAY_VOLUME_MOUNT_PATH=/data, canonical data and the upload route handler's filesystem source come from the mounted volume. Repository public/data is only the local-development fallback. The actual eight HTTP requests were served by Next public-static files (Cache-Control public,max-age=0), not the volume handler (which returns max-age=3600). The volume route was separately called with the real storage root and verified 8/8 status/hash. Existing public-file precedence is preserved; no routing redesign. Both promoted repository bytes and copied volume bytes equal the approved master. bootstrap/store/*.json seeds absent volume files; persistentStorageInit does not replace existing files. bootstrap/store/website-data.json still has 23 products. A deploy does not merge this patch automatically.

The new patch manifest lives in bootstrap/patches, outside STORE_SEED_FILES. It is read only by the explicit migration script. It is not imported by application startup. Eight promoted WebPs are under public/uploads/artworks; four already-committed legacy media files support the two new drafts. No new runtime URL or source import refers to _image_review, a review server, a drive-letter path, or Owner cloud-drive originals.

| PAGE / COMPONENT | DATA / RESOLVER | FALLBACK / ACTUAL ROLE | PV.5 DECISION |
| --- | --- | --- | --- |
| /works — app/works/page.tsx | getLiveWebsiteData → resolveWorksProductListing → resolveListAsset → ProductVisualMedia | Selected listAsset → artworkCover → mainVisual → cover → poster | Use new master in eligible 4:5 cards |
| Homepage HOME004 — HomepageV3.tsx | Live products + existing HOME004 productSlugs → resolveHome004Recommendations → resolveListAsset → Home004ProductMedia | Same listing precedence; availability filtering unchanged | Use new master only in configured eligible cards; current seed shows Davinci and Raphael, third recommendation stays Turner |
| /works/[slug] product stage | resolveProductAsset → productPath → product-photo img | Selected productAsset → productPhoto → mainVisual → cover → poster | STOP new master here: retain pageLayout.productAsset exactly |
| /works/[slug] Hero | resolveHeroAsset / existing hero media → existing wide-hero-stage | Selected heroAsset → assets.hero; existing presentation/fallback preserved | Never replace Hero |
| /works/[slug] artwork chapter | resolveStaticProductImage | artworkCover → mainVisual → cover → poster | Preserve artwork image |
| Related — RelatedProductsSection | resolveListAsset(item,{allowProductVisual:false}) → ProductVisualMedia | When new role selected, retain artworkCover / legacy listing fallback | STOP: wide clipping needs layout-specific variant |
| /monthly-menu and download image mapping | resolveListAsset(product,{allowProductVisual:false}) | Retain existing artwork listing image | STOP: thumbnail does not preserve master package bounds |
| Page Builder Products | resolveListAsset(product,{allowProductVisual:false}) → Home004ProductMedia | Preserve old artwork source across configurable variants | DEFER: variants not activated; need per-preset QA/variant |
| Admin Works preview | readWorksPageAdminState → previewProducts.listMedia → WorksPagePreview | Public-list eligibility unchanged, 4:5 media | Use new master in five currently eligible approved cards |
| Admin ProductManager Assets | Generic assets.productVisual + new assetTypes entry | Existing metadata/path resolution; explicit full-image preview link | Eight records have approved asset; small 16:9 asset thumbnail STOP, full 4:5 link provided |
| Admin Overview / Hero / label | Existing static artwork and original assets | All original asset keys kept | No replacement |

## Asset roles and precedence

assets.hero = wide artwork / product-page Hero. assets.artworkCover = artistic cover. assets.mainVisual = legacy compatibility artwork. assets.productPhoto = real package photograph or existing real-package composite. assets.productVisual = byte-identical Owner-approved 1600×2000 commercial master. A new role does not rename, delete or overwrite any original role. No new productPhoto/Hero selection is made.

Only assets.productVisual is added and pageLayout.listAsset changes on the eight approved records. pageLayout.productAsset, heroAsset, galleryAssets, showGallery, showRelatedWorks, copy, order, prices, sale SKUs and inventory are retained. The resolver opt-out only changes behavior when the selected role is productVisual; pre-existing roles behave as before.

## Per-product current sources and decisions

| PRODUCT | OLD LIST / THUMB | HERO (UNCHANGED) | PRODUCT STAGE (UNCHANGED) | ARTWORK (UNCHANGED) | PACKAGE PHOTO (UNCHANGED) |
| --- | --- | --- | --- | --- | --- |
| P00001 喬托・初醒 | /uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-artwork-cover-v01.webp | /uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-hero-desktop-v01.webp | 無 | /uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-artwork-cover-v01.webp | 無 |
| P00002 達文西盛宴 | /uploads/artworks/davinci-feast/kdcoffee-davinci-feast-artwork-cover-v01.webp | 無 | /uploads/artworks/davinci-feast/kdcoffee-davinci-feast-main-visual-v02.webp | /uploads/artworks/davinci-feast/kdcoffee-davinci-feast-artwork-cover-v01.webp | 無 |
| P00003 莫內花語 | /uploads/artworks/monet-floral/kdcoffee-monet-floral-artwork-cover-v01.webp | 無 | /uploads/artworks/monet-floral/kdcoffee-monet-floral-main-visual-v02.webp | /uploads/artworks/monet-floral/kdcoffee-monet-floral-artwork-cover-v01.webp | 無 |
| P00005 范戴克・騎士 | /uploads/artworks/vandyck-knight/kdcoffee-vandyck-knight-artwork-cover-v01.webp | 無 | 無 | /uploads/artworks/vandyck-knight/kdcoffee-vandyck-knight-artwork-cover-v01.webp | 無 |
| P00009 林布蘭・奇蹟 | /uploads/artworks/rembrandt-miracle/kdcoffee-rembrandt-miracle-artwork-cover-v01.webp | 無 | 無 | /uploads/artworks/rembrandt-miracle/kdcoffee-rembrandt-miracle-artwork-cover-v01.webp | 無 |
| P00007 拉斐爾之吻 | /uploads/artworks/raphael-kiss/kdcoffee-raphael-kiss-artwork-cover-v01.webp | 無 | /uploads/artworks/raphael-kiss/kdcoffee-raphael-kiss-main-visual-v02.webp | /uploads/artworks/raphael-kiss/kdcoffee-raphael-kiss-artwork-cover-v01.webp | 無 |
| P00024 艾克・柔影 | /uploads/artworks/eyck-soft-shadow/kdcoffee-eyck-soft-shadow-product-photo-v01.webp | /uploads/artworks/eyck-soft-shadow/kdcoffee-eyck-soft-shadow-product-photo-v01.webp | /uploads/artworks/eyck-soft-shadow/kdcoffee-eyck-soft-shadow-product-photo-v01.webp | 無 | /uploads/artworks/eyck-soft-shadow/kdcoffee-eyck-soft-shadow-product-photo-v01.webp |
| P00025 拉圖爾・曙光 | /uploads/artworks/la-tour-dawn/kdcoffee-la-tour-dawn-product-photo-v01.webp | /uploads/artworks/la-tour-dawn/kdcoffee-la-tour-dawn-product-photo-v01.webp | /uploads/artworks/la-tour-dawn/kdcoffee-la-tour-dawn-product-photo-v01.webp | 無 | /uploads/artworks/la-tour-dawn/kdcoffee-la-tour-dawn-product-photo-v01.webp |

| PRODUCT | FIELD / SELECTOR | PRODUCTION URL | SHA256 |
| --- | --- | --- | --- |
| P00001 喬托・初醒 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-product-visual-v01.webp | 18c84ecbb1d192c664c24c973fd8dde830ee5608366c627078eca522f419c73c |
| P00002 達文西盛宴 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/davinci-feast/kdcoffee-davinci-feast-product-visual-v01.webp | 25bf104203f0cf1bf50f7742e3ca1a1b701210ea5f43756d941d0f287f5c7357 |
| P00003 莫內花語 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/monet-floral/kdcoffee-monet-floral-product-visual-v01.webp | e03424252767a4a5ac0b9ab1d63c6d9da6d1ee1a1d79eea430e6ee526368b715 |
| P00005 范戴克・騎士 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/vandyck-knight/kdcoffee-vandyck-knight-product-visual-v01.webp | 7297762dbbf4708ef4375a320a877fac143917bba0c104e233c2af2bc4b9c76a |
| P00009 林布蘭・奇蹟 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/rembrandt-miracle/kdcoffee-rembrandt-miracle-product-visual-v01.webp | e4f9d9f604f6317f1649d44b267909551487d52fce9440f230a0e51eec363d40 |
| P00007 拉斐爾之吻 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/raphael-kiss/kdcoffee-raphael-kiss-product-visual-v01.webp | 0adb9045568fc57e3369272c96e341f740a56a33ce433caad803a78cf6fedd73 |
| P00024 艾克・柔影 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/eyck-soft-shadow/kdcoffee-eyck-soft-shadow-product-visual-v01.webp | c1d976a8f52d82c44c0520b02ba5ffb6bda1f49d20ed557d8d033dc2295df5f3 |
| P00025 拉圖爾・曙光 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/la-tour-dawn/kdcoffee-la-tour-dawn-product-visual-v01.webp | 1a0fc08f6343cd0e4b73433f324ba8b2ca8f13b59d9bfc782c7d93e141cd729e |

P00009 Rembrandt remains hidden and is not listed; detail returns expected 404. P00024/P00025 remain unpublished, unlisted and unpurchasable. Their direct detail pages remain 200 with the original productPhoto-selected Hero and real label gallery; no approved master is forced into that wide Hero. Actual live eligibility is evaluated from live data, not changed by the migration.
