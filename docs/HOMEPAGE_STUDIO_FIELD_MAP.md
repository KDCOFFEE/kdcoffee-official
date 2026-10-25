# Homepage Content Studio — complete legacy control inventory

Control template families: 97; preserved/mapped: 97; unmapped: 0.

A repeated collection control counts once per template, rather than once per current record. Each original event binding below is retained verbatim or relocated as specified. Canonical data remains homepage.json through the authenticated /api/admin/homepage GET/PUT, version check, file lock and atomic write.

| Owner / control | Original binding (data path) | Public area / destination |
| --- | --- | --- |
| HomepageManager / ImageLibraryPicker | `{(asset) => { setPath(["seo", "shareImage"], { media: localImageMedia(asset.path), alt: asset.alt &#124;&#124; asset.name }); setSeoPickerOpen(false); }}` | hero.desktopMedia/mobileMedia and seo.shareImage asset dialogs → HomepageContentStudio |
| HomepageManager / HeroMediaLibraryPicker | `{(media) => { setPath(["hero", heroPicker === "desktop" ? "desktopMedia" : "mobileMedia"], media); setHeroPicker(null); }}` | hero.desktopMedia/mobileMedia and seo.shareImage asset dialogs → HomepageContentStudio |
| HomepageSectionOrderEditor / Visibility | `{(checked) => setPath([item.key, "enabled"], checked)}` | sectionOrder[] / corresponding section.enabled → public CSS flex order / sectionIsEnabled |
| HomepageNavigationEditor / Visibility | `{(checked) => patch(index, { enabled: checked })}` | navigation[].* → HeaderNavigation |
| HomepageNavigationEditor / input | `{(event) => patch(index, { label: event.target.value })}` | navigation[].* → HeaderNavigation |
| HomepageNavigationEditor / SmartLinkPicker | `{(href) => patch(index, { href })}` | navigation[].* → HeaderNavigation |
| HomepageVisualEditor / input | `{(event) => setColor(key, event.target.value as `#${string}`)}` | visual.colors.* / heroOverlayPreset / cardPresentationPreset → existing stored metadata + legacy style illustration; NO baseline public binding |
| HomepageVisualEditor / select | `{(event) => setPath(["visual", "heroOverlayPreset"], event.target.value)}` | visual.colors.* / heroOverlayPreset / cardPresentationPreset → existing stored metadata + legacy style illustration; NO baseline public binding |
| HomepageVisualEditor / select | `{(event) => setPath(["visual", "cardPresentationPreset"], event.target.value)}` | visual.colors.* / heroOverlayPreset / cardPresentationPreset → existing stored metadata + legacy style illustration; NO baseline public binding |
| HomepageSeoEditor / input | `{(event) => setPath(["seo", "title"], event.target.value)}` | seo.title / description / shareImage → existing stored SEO fields; root metadata currently static |
| HomepageSeoEditor / textarea | `{(event) => setPath(["seo", "description"], event.target.value)}` | seo.title / description / shareImage → existing stored SEO fields; root metadata currently static |
| HomepageSeoEditor / input | `{(event) => setPath(["seo", "shareImage"], { ...shareImage, alt: event.target.value })}` | seo.title / description / shareImage → existing stored SEO fields; root metadata currently static |
| Visibility / input | `{(event) => onChange(event.target.checked)}` | caller-owned enabled field → caller's real section / CTA |
| HomepageCtaVisibility / Visibility | `{checked=>setPath(entry.path,checked)}` | hero, campaigns[], home003.cards[], home006, home010 CTA enabled → resolveHomepageCta |
| ItemActions / Visibility | `{onVisibleChange}` | caller collection item.enabled and order → orderedEnabledItems / real corresponding section |
| SectionMotionEditor / input | `{(event) => update(key, Math.round(Number(event.target.value) * 1000))}` | *.motion six parameters → StudioAnimationFields → presentation.sections.*.base/mobile.animation sparse overlay → same HomepageMotion engine |
| SectionMotionEditor / Visibility | `{(checked) => update("enabled", checked)}` | *.motion six parameters → StudioAnimationFields → presentation.sections.*.base/mobile.animation sparse overlay → same HomepageMotion engine |
| SectionMotionEditor / select | `{(event) => update("preset", event.target.value)}` | *.motion six parameters → StudioAnimationFields → presentation.sections.*.base/mobile.animation sparse overlay → same HomepageMotion engine |
| SectionMotionEditor / input | `{(event) => update("distancePx", Number(event.target.value))}` | *.motion six parameters → StudioAnimationFields → presentation.sections.*.base/mobile.animation sparse overlay → same HomepageMotion engine |
| HeroEditor / Visibility | `{(checked) => setPath(["hero", "enabled"], checked)}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / input | `{(event) => setPath(["hero", "eyebrow"], event.target.value)}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / input | `{(event) => setPath(["hero", "buttonLabel"], event.target.value)}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / input | `{(event) => setPath(["hero", "titleLines"], [event.target.value, value.titleLines?.[1] &#124;&#124; ""])}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / input | `{(event) => setPath(["hero", "titleLines"], [value.titleLines?.[0] &#124;&#124; "", event.target.value])}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / textarea | `{(event) => setPath(["hero", "lead"], event.target.value)}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / input | `{(event) => setPath(["hero", "secondaryLabel"], event.target.value)}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / SmartLinkPicker | `{(link) => setPath(["hero", "buttonHref"], link)}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / SmartLinkPicker | `{(link) => setPath(["hero", "secondaryHref"], link)}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / textarea | `{(event) => setPath(["hero", "trustCues"], event.target.value.split(/\r?\n/u).filter(Boolean))}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / MediaUploader | `{(media) => setPath(["hero", "desktopMedia"], media)}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / MediaUploader | `{(media) => setPath(["hero", "mobileMedia"], media)}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / Visibility | `{(checked) => setPath(["hero", "motionEnabled"], checked)}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / input | `{(event) => updateTiming(key, Number(event.target.value))}` | hero.* → HomepageV3 #top / KdMedia |
| HeroEditor / input | `{(event) => updateTiming(key, Number(event.target.value))}` | hero.* → HomepageV3 #top / KdMedia |
| CampaignEditor / Visibility | `{(checked) => setPath(["campaignSection", "enabled"], checked)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaignSection", "eyebrow"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaignSection", "title"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / textarea | `{(event) => setPath(["campaignSection", "intro"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaignSection", "displayLimit"], Math.max(0, Number(event.target.value)))}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / Visibility | `{(checked) => setPath(["campaigns", index, "enabled"], checked)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaigns", index, "sort"], Number(event.target.value))}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaigns", index, "adminName"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaigns", index, "eyebrow"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaigns", index, "title"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / textarea | `{(event) => setPath(["campaigns", index, "description"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / textarea | `{(event) => setPath(["campaigns", index, "details"], event.target.value.split(/\r?\n/u).filter(Boolean))}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaigns", index, "ctaLabel"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / SmartLinkPicker | `{(link) => setPath(["campaigns", index, "ctaHref"], link)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaigns", index, "secondaryLabel"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / SmartLinkPicker | `{(link) => setPath(["campaigns", index, "secondaryHref"], link)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaigns", index, "startDate"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / input | `{(event) => setPath(["campaigns", index, "endDate"], event.target.value)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| CampaignEditor / MediaUploader | `{(media) => setPath(["campaigns", index, "media"], media)}` | campaignSection.* + campaigns[].* → MonthlyCampaign #monthly-campaign |
| Home002ClosingEditor / Visibility | `{(checked) => setPath(["home002", "closingEnabled"], checked)}` | home002.closingText / closingEnabled → HomepageV3 #home002 |
| Home002ClosingEditor / textarea | `{(event) => setPath(["home002", "closingText"], event.target.value)}` | home002.closingText / closingEnabled → HomepageV3 #home002 |
| ContentSectionEditor / Visibility | `{(checked) => setPath([sectionKey, "enabled"], checked)}` | home002.cards[], home003.cards[], home005.steps[], home007.cards[] → HomepageV3 corresponding section |
| ContentSectionEditor / input | `{(event) => setPath([sectionKey, "title"], event.target.value)}` | home002.cards[], home003.cards[], home005.steps[], home007.cards[] → HomepageV3 corresponding section |
| ContentSectionEditor / textarea | `{(event) => setPath([sectionKey, value.intro !== undefined ? "intro" : "text"], event.target.value)}` | home002.cards[], home003.cards[], home005.steps[], home007.cards[] → HomepageV3 corresponding section |
| ContentSectionEditor / input | `{(event) => setPath([sectionKey, collectionKey, index, "eyebrow"], event.target.value)}` | home002.cards[], home003.cards[], home005.steps[], home007.cards[] → HomepageV3 corresponding section |
| ContentSectionEditor / input | `{(event) => setPath([sectionKey, collectionKey, index, "title"], event.target.value)}` | home002.cards[], home003.cards[], home005.steps[], home007.cards[] → HomepageV3 corresponding section |
| ContentSectionEditor / textarea | `{(event) => setPath([sectionKey, collectionKey, index, "text"], event.target.value)}` | home002.cards[], home003.cards[], home005.steps[], home007.cards[] → HomepageV3 corresponding section |
| ContentSectionEditor / input | `{(event) => setPath([sectionKey, collectionKey, index, "button"], event.target.value)}` | home002.cards[], home003.cards[], home005.steps[], home007.cards[] → HomepageV3 corresponding section |
| ContentSectionEditor / SmartLinkPicker | `{(link) => setPath([sectionKey, collectionKey, index, "href"], link)}` | home002.cards[], home003.cards[], home005.steps[], home007.cards[] → HomepageV3 corresponding section |
| NestedMediaEditor / MediaUploader | `{(media) => setPath([...path, "media"], media)}` | current section/card media, image, mediaItems[] → HomepageMediaCollection / HomepageSceneMedia |
| MediaReferenceEditor / AssetPicker | `{addAsset}` | current mediaItems[] / images[] → existing media collection/gallery renderer |
| MediaReferenceEditor / Visibility | `{(checked) => setPath([...path, index, "enabled"], checked)}` | current mediaItems[] / images[] → existing media collection/gallery renderer |
| MediaReferenceEditor / MediaUploader | `{(media) => setPath([...path, index, "media"], media)}` | current mediaItems[] / images[] → existing media collection/gallery renderer |
| MediaReferenceEditor / YouTubeField | `{(media) => setPath([...path, index, "media"], media)}` | current mediaItems[] / images[] → existing media collection/gallery renderer |
| MediaReferenceEditor / input | `{(event) => setPath([...path, index, "alt"], event.target.value)}` | current mediaItems[] / images[] → existing media collection/gallery renderer |
| MediaReferenceEditor / input | `{(event) => setPath([...path, index, "title"], event.target.value)}` | current mediaItems[] / images[] → existing media collection/gallery renderer |
| MediaReferenceEditor / input | `{(event) => setPath([...path, index, "caption"], event.target.value)}` | current mediaItems[] / images[] → existing media collection/gallery renderer |
| AssetPicker / select | `{(event) => setSelected(event.target.value)}` | selected existing asset → current media/image reference |
| YouTubeField / input | `{(event) => setUrl(event.target.value)}` | current media → KdMedia YouTube renderer |
| Home004Editor / Visibility | `{(checked) => setPath(["home004", "enabled"], checked)}` | home004.* → HomepageV3 #home004; product data remains referenced |
| Home004Editor / input | `{(event) => setPath(["home004", "title"], event.target.value)}` | home004.* → HomepageV3 #home004; product data remains referenced |
| Home004Editor / textarea | `{(event) => setPath(["home004", "intro"], event.target.value)}` | home004.* → HomepageV3 #home004; product data remains referenced |
| Home004Editor / select | `{(event) => setPath(["home004", "productSlugs"], slugs.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}` | home004.* → HomepageV3 #home004; product data remains referenced |
| Home006Editor / Visibility | `{(checked) => setPath(["home006", "enabled"], checked)}` | home006.* → HomepageV3 #home006 |
| Home006Editor / input | `{(event) => setPath(["home006", "title"], event.target.value)}` | home006.* → HomepageV3 #home006 |
| Home006Editor / input | `{(event) => setPath(["home006", "button"], event.target.value)}` | home006.* → HomepageV3 #home006 |
| Home006Editor / textarea | `{(event) => setPath(["home006", "text"], event.target.value)}` | home006.* → HomepageV3 #home006 |
| Home006Editor / textarea | `{(event) => setPath(["home006", "points"], event.target.value.split(/\r?\n/u).filter(Boolean))}` | home006.* → HomepageV3 #home006 |
| Home006Editor / SmartLinkPicker | `{(link) => setPath(["home006", "href"], link)}` | home006.* → HomepageV3 #home006 |
| Home008Editor / Visibility | `{(checked) => setPath(["home008", "enabled"], checked)}` | home008.images[] / mediaItems[] → HomepageStudioGallery #home008 |
| Home008Editor / input | `{(event) => setPath(["home008", "title"], event.target.value)}` | home008.images[] / mediaItems[] → HomepageStudioGallery #home008 |
| Home008Editor / textarea | `{(event) => setPath(["home008", "text"], event.target.value)}` | home008.images[] / mediaItems[] → HomepageStudioGallery #home008 |
| ReviewsEditor / Visibility | `{(checked) => setPath(["home009", "enabled"], checked)}` | home009.* → HomepageV3 #home009 |
| ReviewsEditor / input | `{(event) => setPath(["home009", "title"], event.target.value)}` | home009.* → HomepageV3 #home009 |
| ReviewsEditor / input | `{(event) => setPath(["home009", "intro"], event.target.value)}` | home009.* → HomepageV3 #home009 |
| ReviewsEditor / input | `{(event) => setPath(["home009", "items", index, "name"], event.target.value)}` | home009.* → HomepageV3 #home009 |
| ReviewsEditor / input | `{(event) => setPath(["home009", "items", index, "source"], event.target.value)}` | home009.* → HomepageV3 #home009 |
| ReviewsEditor / textarea | `{(event) => setPath(["home009", "items", index, "text"], event.target.value)}` | home009.* → HomepageV3 #home009 |
| Home010Editor / Visibility | `{(checked) => setPath(["home010", "enabled"], checked)}` | home010.* → HomepageV3 #home010 |
| Home010Editor / input | `{(event) => setPath(["home010", "title"], event.target.value)}` | home010.* → HomepageV3 #home010 |
| Home010Editor / input | `{(event) => setPath(["home010", "button"], event.target.value)}` | home010.* → HomepageV3 #home010 |
| Home010Editor / textarea | `{(event) => setPath(["home010", "text"], event.target.value)}` | home010.* → HomepageV3 #home010 |
| Home010Editor / SmartLinkPicker | `{(link) => setPath(["home010", "href"], link)}` | home010.* → HomepageV3 #home010 |

## Existing presentation field addresses

871 distinct supported presentation addresses, expanded across the actual 11 section capability sets and both sparse branches. These are separate from the 97 legacy control templates; counts are not mixed into a misleading total. Every address is retained in the same canonical schema.

| Data path | Editor area | Renderer |
| --- | --- | --- |
| `presentation.sections.hero.base.text.eyebrow.fontSizePx` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.base.text.eyebrow.fontWeight` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.base.text.eyebrow.color` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.base.text.eyebrow.lineHeight` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.base.text.eyebrow.letterSpacingEm` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.base.text.eyebrow.alignment` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.base.text.eyebrow.maxWidthCh` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.base.text.title.fontSizePx` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.base.text.title.fontWeight` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.base.text.title.color` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.base.text.title.lineHeight` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.base.text.title.letterSpacingEm` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.base.text.title.alignment` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.base.text.title.maxWidthCh` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.base.text.intro.fontSizePx` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.base.text.intro.fontWeight` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.base.text.intro.color` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.base.text.intro.lineHeight` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.base.text.intro.letterSpacingEm` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.base.text.intro.alignment` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.base.text.intro.maxWidthCh` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.base.text.cta.fontSizePx` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.base.text.cta.fontWeight` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.base.text.cta.color` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.base.text.cta.lineHeight` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.base.text.cta.letterSpacingEm` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.base.text.cta.alignment` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.base.text.cta.maxWidthCh` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.base.text.metadata.fontSizePx` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.base.text.metadata.fontWeight` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.base.text.metadata.color` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.base.text.metadata.lineHeight` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.base.text.metadata.letterSpacingEm` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.base.text.metadata.alignment` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.base.text.metadata.maxWidthCh` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.base.layout.contentMaxWidthPx` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.base.layout.paddingTopPx` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.base.layout.paddingBottomPx` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.base.background.mode` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.base.background.color` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.base.visible` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.mobile.overrides.text.eyebrow.fontSizePx` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.mobile.overrides.text.eyebrow.fontWeight` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.mobile.overrides.text.eyebrow.color` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.mobile.overrides.text.eyebrow.lineHeight` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.mobile.overrides.text.eyebrow.letterSpacingEm` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.mobile.overrides.text.eyebrow.alignment` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.mobile.overrides.text.eyebrow.maxWidthCh` | hero | createHomepagePresentationBindings → real hero semantic eyebrow target |
| `presentation.sections.hero.mobile.overrides.text.title.fontSizePx` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.mobile.overrides.text.title.fontWeight` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.mobile.overrides.text.title.color` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.mobile.overrides.text.title.lineHeight` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.mobile.overrides.text.title.letterSpacingEm` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.mobile.overrides.text.title.alignment` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.mobile.overrides.text.title.maxWidthCh` | hero | createHomepagePresentationBindings → real hero semantic title target |
| `presentation.sections.hero.mobile.overrides.text.intro.fontSizePx` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.mobile.overrides.text.intro.fontWeight` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.mobile.overrides.text.intro.color` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.mobile.overrides.text.intro.lineHeight` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.mobile.overrides.text.intro.letterSpacingEm` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.mobile.overrides.text.intro.alignment` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.mobile.overrides.text.intro.maxWidthCh` | hero | createHomepagePresentationBindings → real hero semantic intro target |
| `presentation.sections.hero.mobile.overrides.text.cta.fontSizePx` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.mobile.overrides.text.cta.fontWeight` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.mobile.overrides.text.cta.color` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.mobile.overrides.text.cta.lineHeight` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.mobile.overrides.text.cta.letterSpacingEm` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.mobile.overrides.text.cta.alignment` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.mobile.overrides.text.cta.maxWidthCh` | hero | createHomepagePresentationBindings → real hero semantic cta target |
| `presentation.sections.hero.mobile.overrides.text.metadata.fontSizePx` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.mobile.overrides.text.metadata.fontWeight` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.mobile.overrides.text.metadata.color` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.mobile.overrides.text.metadata.lineHeight` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.mobile.overrides.text.metadata.letterSpacingEm` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.mobile.overrides.text.metadata.alignment` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.mobile.overrides.text.metadata.maxWidthCh` | hero | createHomepagePresentationBindings → real hero semantic metadata target |
| `presentation.sections.hero.mobile.overrides.layout.contentMaxWidthPx` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.mobile.overrides.layout.paddingTopPx` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.mobile.overrides.layout.paddingBottomPx` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.mobile.overrides.background.mode` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.mobile.overrides.background.color` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.mobile.overrides.visible` | hero | createHomepagePresentationBindings → real hero content/section CSS binding |
| `presentation.sections.hero.mobile.overrideEnabled` | hero | Mobile binding activation; OFF retains existing sparse values |
| `presentation.sections.campaignSection.base.text.eyebrow.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.base.text.eyebrow.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.base.text.eyebrow.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.base.text.eyebrow.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.base.text.eyebrow.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.base.text.eyebrow.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.base.text.eyebrow.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.base.text.title.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.base.text.title.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.base.text.title.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.base.text.title.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.base.text.title.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.base.text.title.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.base.text.title.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.base.text.intro.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.base.text.intro.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.base.text.intro.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.base.text.intro.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.base.text.intro.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.base.text.intro.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.base.text.intro.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.base.text.body.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.base.text.body.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.base.text.body.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.base.text.body.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.base.text.body.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.base.text.body.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.base.text.body.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.base.text.cardTitle.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.base.text.cardTitle.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.base.text.cardTitle.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.base.text.cardTitle.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.base.text.cardTitle.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.base.text.cardTitle.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.base.text.cardTitle.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.base.text.cardBody.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.base.text.cardBody.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.base.text.cardBody.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.base.text.cardBody.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.base.text.cardBody.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.base.text.cardBody.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.base.text.cardBody.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.base.text.cta.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.base.text.cta.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.base.text.cta.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.base.text.cta.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.base.text.cta.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.base.text.cta.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.base.text.cta.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.base.text.metadata.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.base.text.metadata.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.base.text.metadata.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.base.text.metadata.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.base.text.metadata.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.base.text.metadata.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.base.text.metadata.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.base.layout.contentMaxWidthPx` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.base.layout.paddingTopPx` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.base.layout.paddingBottomPx` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.base.background.mode` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.base.background.color` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.base.visible` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.mobile.overrides.text.eyebrow.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.mobile.overrides.text.eyebrow.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.mobile.overrides.text.eyebrow.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.mobile.overrides.text.eyebrow.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.mobile.overrides.text.eyebrow.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.mobile.overrides.text.eyebrow.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.mobile.overrides.text.eyebrow.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic eyebrow target |
| `presentation.sections.campaignSection.mobile.overrides.text.title.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.mobile.overrides.text.title.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.mobile.overrides.text.title.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.mobile.overrides.text.title.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.mobile.overrides.text.title.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.mobile.overrides.text.title.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.mobile.overrides.text.title.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic title target |
| `presentation.sections.campaignSection.mobile.overrides.text.intro.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.mobile.overrides.text.intro.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.mobile.overrides.text.intro.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.mobile.overrides.text.intro.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.mobile.overrides.text.intro.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.mobile.overrides.text.intro.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.mobile.overrides.text.intro.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic intro target |
| `presentation.sections.campaignSection.mobile.overrides.text.body.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.mobile.overrides.text.body.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.mobile.overrides.text.body.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.mobile.overrides.text.body.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.mobile.overrides.text.body.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.mobile.overrides.text.body.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.mobile.overrides.text.body.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic body target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardTitle.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardTitle.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardTitle.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardTitle.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardTitle.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardTitle.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardTitle.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardTitle target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardBody.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardBody.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardBody.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardBody.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardBody.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardBody.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.mobile.overrides.text.cardBody.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cardBody target |
| `presentation.sections.campaignSection.mobile.overrides.text.cta.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.mobile.overrides.text.cta.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.mobile.overrides.text.cta.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.mobile.overrides.text.cta.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.mobile.overrides.text.cta.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.mobile.overrides.text.cta.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.mobile.overrides.text.cta.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic cta target |
| `presentation.sections.campaignSection.mobile.overrides.text.metadata.fontSizePx` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.mobile.overrides.text.metadata.fontWeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.mobile.overrides.text.metadata.color` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.mobile.overrides.text.metadata.lineHeight` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.mobile.overrides.text.metadata.letterSpacingEm` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.mobile.overrides.text.metadata.alignment` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.mobile.overrides.text.metadata.maxWidthCh` | campaignSection | createHomepagePresentationBindings → real campaignSection semantic metadata target |
| `presentation.sections.campaignSection.mobile.overrides.layout.contentMaxWidthPx` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.mobile.overrides.layout.paddingTopPx` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.mobile.overrides.layout.paddingBottomPx` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.mobile.overrides.background.mode` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.mobile.overrides.background.color` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.mobile.overrides.visible` | campaignSection | createHomepagePresentationBindings → real campaignSection content/section CSS binding |
| `presentation.sections.campaignSection.mobile.overrideEnabled` | campaignSection | Mobile binding activation; OFF retains existing sparse values |
| `presentation.sections.home002.base.text.title.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.base.text.title.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.base.text.title.color` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.base.text.title.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.base.text.title.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.base.text.title.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.base.text.title.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.base.text.intro.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.base.text.intro.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.base.text.intro.color` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.base.text.intro.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.base.text.intro.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.base.text.intro.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.base.text.intro.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.base.text.cardTitle.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.base.text.cardTitle.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.base.text.cardTitle.color` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.base.text.cardTitle.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.base.text.cardTitle.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.base.text.cardTitle.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.base.text.cardTitle.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.base.text.cardBody.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.base.text.cardBody.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.base.text.cardBody.color` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.base.text.cardBody.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.base.text.cardBody.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.base.text.cardBody.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.base.text.cardBody.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.base.text.closing.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.base.text.closing.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.base.text.closing.color` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.base.text.closing.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.base.text.closing.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.base.text.closing.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.base.text.closing.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.base.text.metadata.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.base.text.metadata.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.base.text.metadata.color` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.base.text.metadata.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.base.text.metadata.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.base.text.metadata.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.base.text.metadata.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.base.layout.contentMaxWidthPx` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.base.layout.paddingTopPx` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.base.layout.paddingBottomPx` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.base.background.mode` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.base.background.color` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.base.visible` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.mobile.overrides.text.title.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.mobile.overrides.text.title.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.mobile.overrides.text.title.color` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.mobile.overrides.text.title.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.mobile.overrides.text.title.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.mobile.overrides.text.title.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.mobile.overrides.text.title.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic title target |
| `presentation.sections.home002.mobile.overrides.text.intro.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.mobile.overrides.text.intro.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.mobile.overrides.text.intro.color` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.mobile.overrides.text.intro.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.mobile.overrides.text.intro.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.mobile.overrides.text.intro.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.mobile.overrides.text.intro.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic intro target |
| `presentation.sections.home002.mobile.overrides.text.cardTitle.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.mobile.overrides.text.cardTitle.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.mobile.overrides.text.cardTitle.color` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.mobile.overrides.text.cardTitle.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.mobile.overrides.text.cardTitle.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.mobile.overrides.text.cardTitle.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.mobile.overrides.text.cardTitle.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic cardTitle target |
| `presentation.sections.home002.mobile.overrides.text.cardBody.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.mobile.overrides.text.cardBody.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.mobile.overrides.text.cardBody.color` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.mobile.overrides.text.cardBody.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.mobile.overrides.text.cardBody.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.mobile.overrides.text.cardBody.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.mobile.overrides.text.cardBody.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic cardBody target |
| `presentation.sections.home002.mobile.overrides.text.closing.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.mobile.overrides.text.closing.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.mobile.overrides.text.closing.color` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.mobile.overrides.text.closing.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.mobile.overrides.text.closing.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.mobile.overrides.text.closing.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.mobile.overrides.text.closing.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic closing target |
| `presentation.sections.home002.mobile.overrides.text.metadata.fontSizePx` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.mobile.overrides.text.metadata.fontWeight` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.mobile.overrides.text.metadata.color` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.mobile.overrides.text.metadata.lineHeight` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.mobile.overrides.text.metadata.letterSpacingEm` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.mobile.overrides.text.metadata.alignment` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.mobile.overrides.text.metadata.maxWidthCh` | home002 | createHomepagePresentationBindings → real home002 semantic metadata target |
| `presentation.sections.home002.mobile.overrides.layout.contentMaxWidthPx` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.mobile.overrides.layout.paddingTopPx` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.mobile.overrides.layout.paddingBottomPx` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.mobile.overrides.background.mode` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.mobile.overrides.background.color` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.mobile.overrides.visible` | home002 | createHomepagePresentationBindings → real home002 content/section CSS binding |
| `presentation.sections.home002.mobile.overrideEnabled` | home002 | Mobile binding activation; OFF retains existing sparse values |
| `presentation.sections.home003.base.text.title.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.base.text.title.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.base.text.title.color` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.base.text.title.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.base.text.title.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.base.text.title.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.base.text.title.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.base.text.intro.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.base.text.intro.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.base.text.intro.color` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.base.text.intro.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.base.text.intro.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.base.text.intro.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.base.text.intro.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.base.text.eyebrow.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.base.text.eyebrow.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.base.text.eyebrow.color` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.base.text.eyebrow.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.base.text.eyebrow.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.base.text.eyebrow.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.base.text.eyebrow.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.base.text.cardTitle.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.base.text.cardTitle.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.base.text.cardTitle.color` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.base.text.cardTitle.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.base.text.cardTitle.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.base.text.cardTitle.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.base.text.cardTitle.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.base.text.cardBody.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.base.text.cardBody.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.base.text.cardBody.color` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.base.text.cardBody.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.base.text.cardBody.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.base.text.cardBody.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.base.text.cardBody.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.base.text.cta.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.base.text.cta.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.base.text.cta.color` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.base.text.cta.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.base.text.cta.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.base.text.cta.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.base.text.cta.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.base.layout.contentMaxWidthPx` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.base.layout.paddingTopPx` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.base.layout.paddingBottomPx` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.base.background.mode` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.base.background.color` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.base.visible` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.mobile.overrides.text.title.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.mobile.overrides.text.title.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.mobile.overrides.text.title.color` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.mobile.overrides.text.title.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.mobile.overrides.text.title.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.mobile.overrides.text.title.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.mobile.overrides.text.title.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic title target |
| `presentation.sections.home003.mobile.overrides.text.intro.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.mobile.overrides.text.intro.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.mobile.overrides.text.intro.color` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.mobile.overrides.text.intro.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.mobile.overrides.text.intro.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.mobile.overrides.text.intro.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.mobile.overrides.text.intro.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic intro target |
| `presentation.sections.home003.mobile.overrides.text.eyebrow.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.mobile.overrides.text.eyebrow.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.mobile.overrides.text.eyebrow.color` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.mobile.overrides.text.eyebrow.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.mobile.overrides.text.eyebrow.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.mobile.overrides.text.eyebrow.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.mobile.overrides.text.eyebrow.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic eyebrow target |
| `presentation.sections.home003.mobile.overrides.text.cardTitle.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.mobile.overrides.text.cardTitle.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.mobile.overrides.text.cardTitle.color` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.mobile.overrides.text.cardTitle.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.mobile.overrides.text.cardTitle.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.mobile.overrides.text.cardTitle.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.mobile.overrides.text.cardTitle.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic cardTitle target |
| `presentation.sections.home003.mobile.overrides.text.cardBody.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.mobile.overrides.text.cardBody.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.mobile.overrides.text.cardBody.color` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.mobile.overrides.text.cardBody.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.mobile.overrides.text.cardBody.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.mobile.overrides.text.cardBody.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.mobile.overrides.text.cardBody.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic cardBody target |
| `presentation.sections.home003.mobile.overrides.text.cta.fontSizePx` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.mobile.overrides.text.cta.fontWeight` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.mobile.overrides.text.cta.color` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.mobile.overrides.text.cta.lineHeight` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.mobile.overrides.text.cta.letterSpacingEm` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.mobile.overrides.text.cta.alignment` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.mobile.overrides.text.cta.maxWidthCh` | home003 | createHomepagePresentationBindings → real home003 semantic cta target |
| `presentation.sections.home003.mobile.overrides.layout.contentMaxWidthPx` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.mobile.overrides.layout.paddingTopPx` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.mobile.overrides.layout.paddingBottomPx` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.mobile.overrides.background.mode` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.mobile.overrides.background.color` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.mobile.overrides.visible` | home003 | createHomepagePresentationBindings → real home003 content/section CSS binding |
| `presentation.sections.home003.mobile.overrideEnabled` | home003 | Mobile binding activation; OFF retains existing sparse values |
| `presentation.sections.home004.base.text.title.fontSizePx` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.base.text.title.fontWeight` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.base.text.title.color` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.base.text.title.lineHeight` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.base.text.title.letterSpacingEm` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.base.text.title.alignment` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.base.text.title.maxWidthCh` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.base.text.intro.fontSizePx` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.base.text.intro.fontWeight` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.base.text.intro.color` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.base.text.intro.lineHeight` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.base.text.intro.letterSpacingEm` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.base.text.intro.alignment` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.base.text.intro.maxWidthCh` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.base.text.cardTitle.fontSizePx` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.base.text.cardTitle.fontWeight` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.base.text.cardTitle.color` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.base.text.cardTitle.lineHeight` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.base.text.cardTitle.letterSpacingEm` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.base.text.cardTitle.alignment` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.base.text.cardTitle.maxWidthCh` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.base.text.cardBody.fontSizePx` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.base.text.cardBody.fontWeight` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.base.text.cardBody.color` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.base.text.cardBody.lineHeight` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.base.text.cardBody.letterSpacingEm` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.base.text.cardBody.alignment` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.base.text.cardBody.maxWidthCh` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.base.text.cta.fontSizePx` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.base.text.cta.fontWeight` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.base.text.cta.color` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.base.text.cta.lineHeight` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.base.text.cta.letterSpacingEm` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.base.text.cta.alignment` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.base.text.cta.maxWidthCh` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.base.layout.contentMaxWidthPx` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.base.layout.paddingTopPx` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.base.layout.paddingBottomPx` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.base.background.mode` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.base.background.color` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.base.visible` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.mobile.overrides.text.title.fontSizePx` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.mobile.overrides.text.title.fontWeight` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.mobile.overrides.text.title.color` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.mobile.overrides.text.title.lineHeight` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.mobile.overrides.text.title.letterSpacingEm` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.mobile.overrides.text.title.alignment` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.mobile.overrides.text.title.maxWidthCh` | home004 | createHomepagePresentationBindings → real home004 semantic title target |
| `presentation.sections.home004.mobile.overrides.text.intro.fontSizePx` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.mobile.overrides.text.intro.fontWeight` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.mobile.overrides.text.intro.color` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.mobile.overrides.text.intro.lineHeight` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.mobile.overrides.text.intro.letterSpacingEm` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.mobile.overrides.text.intro.alignment` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.mobile.overrides.text.intro.maxWidthCh` | home004 | createHomepagePresentationBindings → real home004 semantic intro target |
| `presentation.sections.home004.mobile.overrides.text.cardTitle.fontSizePx` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.mobile.overrides.text.cardTitle.fontWeight` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.mobile.overrides.text.cardTitle.color` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.mobile.overrides.text.cardTitle.lineHeight` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.mobile.overrides.text.cardTitle.letterSpacingEm` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.mobile.overrides.text.cardTitle.alignment` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.mobile.overrides.text.cardTitle.maxWidthCh` | home004 | createHomepagePresentationBindings → real home004 semantic cardTitle target |
| `presentation.sections.home004.mobile.overrides.text.cardBody.fontSizePx` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.mobile.overrides.text.cardBody.fontWeight` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.mobile.overrides.text.cardBody.color` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.mobile.overrides.text.cardBody.lineHeight` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.mobile.overrides.text.cardBody.letterSpacingEm` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.mobile.overrides.text.cardBody.alignment` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.mobile.overrides.text.cardBody.maxWidthCh` | home004 | createHomepagePresentationBindings → real home004 semantic cardBody target |
| `presentation.sections.home004.mobile.overrides.text.cta.fontSizePx` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.mobile.overrides.text.cta.fontWeight` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.mobile.overrides.text.cta.color` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.mobile.overrides.text.cta.lineHeight` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.mobile.overrides.text.cta.letterSpacingEm` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.mobile.overrides.text.cta.alignment` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.mobile.overrides.text.cta.maxWidthCh` | home004 | createHomepagePresentationBindings → real home004 semantic cta target |
| `presentation.sections.home004.mobile.overrides.layout.contentMaxWidthPx` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.mobile.overrides.layout.paddingTopPx` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.mobile.overrides.layout.paddingBottomPx` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.mobile.overrides.background.mode` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.mobile.overrides.background.color` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.mobile.overrides.visible` | home004 | createHomepagePresentationBindings → real home004 content/section CSS binding |
| `presentation.sections.home004.mobile.overrideEnabled` | home004 | Mobile binding activation; OFF retains existing sparse values |
| `presentation.sections.home005.base.text.title.fontSizePx` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.base.text.title.fontWeight` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.base.text.title.color` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.base.text.title.lineHeight` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.base.text.title.letterSpacingEm` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.base.text.title.alignment` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.base.text.title.maxWidthCh` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.base.text.intro.fontSizePx` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.base.text.intro.fontWeight` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.base.text.intro.color` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.base.text.intro.lineHeight` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.base.text.intro.letterSpacingEm` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.base.text.intro.alignment` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.base.text.intro.maxWidthCh` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.base.text.cardTitle.fontSizePx` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.base.text.cardTitle.fontWeight` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.base.text.cardTitle.color` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.base.text.cardTitle.lineHeight` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.base.text.cardTitle.letterSpacingEm` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.base.text.cardTitle.alignment` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.base.text.cardTitle.maxWidthCh` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.base.text.cardBody.fontSizePx` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.base.text.cardBody.fontWeight` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.base.text.cardBody.color` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.base.text.cardBody.lineHeight` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.base.text.cardBody.letterSpacingEm` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.base.text.cardBody.alignment` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.base.text.cardBody.maxWidthCh` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.base.text.metadata.fontSizePx` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.base.text.metadata.fontWeight` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.base.text.metadata.color` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.base.text.metadata.lineHeight` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.base.text.metadata.letterSpacingEm` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.base.text.metadata.alignment` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.base.text.metadata.maxWidthCh` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.base.layout.contentMaxWidthPx` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.base.layout.paddingTopPx` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.base.layout.paddingBottomPx` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.base.background.mode` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.base.background.color` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.base.visible` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.mobile.overrides.text.title.fontSizePx` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.mobile.overrides.text.title.fontWeight` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.mobile.overrides.text.title.color` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.mobile.overrides.text.title.lineHeight` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.mobile.overrides.text.title.letterSpacingEm` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.mobile.overrides.text.title.alignment` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.mobile.overrides.text.title.maxWidthCh` | home005 | createHomepagePresentationBindings → real home005 semantic title target |
| `presentation.sections.home005.mobile.overrides.text.intro.fontSizePx` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.mobile.overrides.text.intro.fontWeight` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.mobile.overrides.text.intro.color` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.mobile.overrides.text.intro.lineHeight` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.mobile.overrides.text.intro.letterSpacingEm` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.mobile.overrides.text.intro.alignment` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.mobile.overrides.text.intro.maxWidthCh` | home005 | createHomepagePresentationBindings → real home005 semantic intro target |
| `presentation.sections.home005.mobile.overrides.text.cardTitle.fontSizePx` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.mobile.overrides.text.cardTitle.fontWeight` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.mobile.overrides.text.cardTitle.color` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.mobile.overrides.text.cardTitle.lineHeight` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.mobile.overrides.text.cardTitle.letterSpacingEm` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.mobile.overrides.text.cardTitle.alignment` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.mobile.overrides.text.cardTitle.maxWidthCh` | home005 | createHomepagePresentationBindings → real home005 semantic cardTitle target |
| `presentation.sections.home005.mobile.overrides.text.cardBody.fontSizePx` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.mobile.overrides.text.cardBody.fontWeight` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.mobile.overrides.text.cardBody.color` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.mobile.overrides.text.cardBody.lineHeight` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.mobile.overrides.text.cardBody.letterSpacingEm` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.mobile.overrides.text.cardBody.alignment` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.mobile.overrides.text.cardBody.maxWidthCh` | home005 | createHomepagePresentationBindings → real home005 semantic cardBody target |
| `presentation.sections.home005.mobile.overrides.text.metadata.fontSizePx` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.mobile.overrides.text.metadata.fontWeight` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.mobile.overrides.text.metadata.color` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.mobile.overrides.text.metadata.lineHeight` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.mobile.overrides.text.metadata.letterSpacingEm` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.mobile.overrides.text.metadata.alignment` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.mobile.overrides.text.metadata.maxWidthCh` | home005 | createHomepagePresentationBindings → real home005 semantic metadata target |
| `presentation.sections.home005.mobile.overrides.layout.contentMaxWidthPx` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.mobile.overrides.layout.paddingTopPx` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.mobile.overrides.layout.paddingBottomPx` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.mobile.overrides.background.mode` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.mobile.overrides.background.color` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.mobile.overrides.visible` | home005 | createHomepagePresentationBindings → real home005 content/section CSS binding |
| `presentation.sections.home005.mobile.overrideEnabled` | home005 | Mobile binding activation; OFF retains existing sparse values |
| `presentation.sections.home006.base.text.title.fontSizePx` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.base.text.title.fontWeight` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.base.text.title.color` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.base.text.title.lineHeight` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.base.text.title.letterSpacingEm` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.base.text.title.alignment` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.base.text.title.maxWidthCh` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.base.text.body.fontSizePx` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.base.text.body.fontWeight` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.base.text.body.color` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.base.text.body.lineHeight` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.base.text.body.letterSpacingEm` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.base.text.body.alignment` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.base.text.body.maxWidthCh` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.base.text.cta.fontSizePx` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.base.text.cta.fontWeight` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.base.text.cta.color` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.base.text.cta.lineHeight` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.base.text.cta.letterSpacingEm` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.base.text.cta.alignment` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.base.text.cta.maxWidthCh` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.base.text.metadata.fontSizePx` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.base.text.metadata.fontWeight` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.base.text.metadata.color` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.base.text.metadata.lineHeight` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.base.text.metadata.letterSpacingEm` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.base.text.metadata.alignment` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.base.text.metadata.maxWidthCh` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.base.layout.contentMaxWidthPx` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.base.layout.paddingTopPx` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.base.layout.paddingBottomPx` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.base.background.mode` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.base.background.color` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.base.visible` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.mobile.overrides.text.title.fontSizePx` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.mobile.overrides.text.title.fontWeight` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.mobile.overrides.text.title.color` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.mobile.overrides.text.title.lineHeight` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.mobile.overrides.text.title.letterSpacingEm` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.mobile.overrides.text.title.alignment` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.mobile.overrides.text.title.maxWidthCh` | home006 | createHomepagePresentationBindings → real home006 semantic title target |
| `presentation.sections.home006.mobile.overrides.text.body.fontSizePx` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.mobile.overrides.text.body.fontWeight` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.mobile.overrides.text.body.color` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.mobile.overrides.text.body.lineHeight` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.mobile.overrides.text.body.letterSpacingEm` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.mobile.overrides.text.body.alignment` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.mobile.overrides.text.body.maxWidthCh` | home006 | createHomepagePresentationBindings → real home006 semantic body target |
| `presentation.sections.home006.mobile.overrides.text.cta.fontSizePx` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.mobile.overrides.text.cta.fontWeight` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.mobile.overrides.text.cta.color` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.mobile.overrides.text.cta.lineHeight` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.mobile.overrides.text.cta.letterSpacingEm` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.mobile.overrides.text.cta.alignment` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.mobile.overrides.text.cta.maxWidthCh` | home006 | createHomepagePresentationBindings → real home006 semantic cta target |
| `presentation.sections.home006.mobile.overrides.text.metadata.fontSizePx` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.mobile.overrides.text.metadata.fontWeight` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.mobile.overrides.text.metadata.color` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.mobile.overrides.text.metadata.lineHeight` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.mobile.overrides.text.metadata.letterSpacingEm` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.mobile.overrides.text.metadata.alignment` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.mobile.overrides.text.metadata.maxWidthCh` | home006 | createHomepagePresentationBindings → real home006 semantic metadata target |
| `presentation.sections.home006.mobile.overrides.layout.contentMaxWidthPx` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.mobile.overrides.layout.paddingTopPx` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.mobile.overrides.layout.paddingBottomPx` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.mobile.overrides.background.mode` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.mobile.overrides.background.color` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.mobile.overrides.visible` | home006 | createHomepagePresentationBindings → real home006 content/section CSS binding |
| `presentation.sections.home006.mobile.overrideEnabled` | home006 | Mobile binding activation; OFF retains existing sparse values |
| `presentation.sections.home007.base.text.title.fontSizePx` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.base.text.title.fontWeight` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.base.text.title.color` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.base.text.title.lineHeight` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.base.text.title.letterSpacingEm` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.base.text.title.alignment` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.base.text.title.maxWidthCh` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.base.text.body.fontSizePx` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.base.text.body.fontWeight` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.base.text.body.color` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.base.text.body.lineHeight` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.base.text.body.letterSpacingEm` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.base.text.body.alignment` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.base.text.body.maxWidthCh` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.base.text.cardTitle.fontSizePx` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.base.text.cardTitle.fontWeight` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.base.text.cardTitle.color` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.base.text.cardTitle.lineHeight` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.base.text.cardTitle.letterSpacingEm` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.base.text.cardTitle.alignment` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.base.text.cardTitle.maxWidthCh` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.base.text.cardBody.fontSizePx` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.base.text.cardBody.fontWeight` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.base.text.cardBody.color` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.base.text.cardBody.lineHeight` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.base.text.cardBody.letterSpacingEm` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.base.text.cardBody.alignment` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.base.text.cardBody.maxWidthCh` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.base.layout.contentMaxWidthPx` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.base.layout.paddingTopPx` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.base.layout.paddingBottomPx` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.base.background.mode` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.base.background.color` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.base.visible` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.mobile.overrides.text.title.fontSizePx` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.mobile.overrides.text.title.fontWeight` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.mobile.overrides.text.title.color` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.mobile.overrides.text.title.lineHeight` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.mobile.overrides.text.title.letterSpacingEm` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.mobile.overrides.text.title.alignment` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.mobile.overrides.text.title.maxWidthCh` | home007 | createHomepagePresentationBindings → real home007 semantic title target |
| `presentation.sections.home007.mobile.overrides.text.body.fontSizePx` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.mobile.overrides.text.body.fontWeight` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.mobile.overrides.text.body.color` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.mobile.overrides.text.body.lineHeight` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.mobile.overrides.text.body.letterSpacingEm` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.mobile.overrides.text.body.alignment` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.mobile.overrides.text.body.maxWidthCh` | home007 | createHomepagePresentationBindings → real home007 semantic body target |
| `presentation.sections.home007.mobile.overrides.text.cardTitle.fontSizePx` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.mobile.overrides.text.cardTitle.fontWeight` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.mobile.overrides.text.cardTitle.color` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.mobile.overrides.text.cardTitle.lineHeight` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.mobile.overrides.text.cardTitle.letterSpacingEm` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.mobile.overrides.text.cardTitle.alignment` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.mobile.overrides.text.cardTitle.maxWidthCh` | home007 | createHomepagePresentationBindings → real home007 semantic cardTitle target |
| `presentation.sections.home007.mobile.overrides.text.cardBody.fontSizePx` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.mobile.overrides.text.cardBody.fontWeight` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.mobile.overrides.text.cardBody.color` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.mobile.overrides.text.cardBody.lineHeight` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.mobile.overrides.text.cardBody.letterSpacingEm` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.mobile.overrides.text.cardBody.alignment` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.mobile.overrides.text.cardBody.maxWidthCh` | home007 | createHomepagePresentationBindings → real home007 semantic cardBody target |
| `presentation.sections.home007.mobile.overrides.layout.contentMaxWidthPx` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.mobile.overrides.layout.paddingTopPx` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.mobile.overrides.layout.paddingBottomPx` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.mobile.overrides.background.mode` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.mobile.overrides.background.color` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.mobile.overrides.visible` | home007 | createHomepagePresentationBindings → real home007 content/section CSS binding |
| `presentation.sections.home007.mobile.overrideEnabled` | home007 | Mobile binding activation; OFF retains existing sparse values |
| `presentation.sections.home008.base.text.title.fontSizePx` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.base.text.title.fontWeight` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.base.text.title.color` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.base.text.title.lineHeight` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.base.text.title.letterSpacingEm` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.base.text.title.alignment` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.base.text.title.maxWidthCh` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.base.text.body.fontSizePx` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.base.text.body.fontWeight` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.base.text.body.color` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.base.text.body.lineHeight` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.base.text.body.letterSpacingEm` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.base.text.body.alignment` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.base.text.body.maxWidthCh` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.base.layout.contentMaxWidthPx` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.base.layout.paddingTopPx` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.base.layout.paddingBottomPx` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.base.background.mode` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.base.background.color` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.base.visible` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.mobile.overrides.text.title.fontSizePx` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.mobile.overrides.text.title.fontWeight` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.mobile.overrides.text.title.color` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.mobile.overrides.text.title.lineHeight` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.mobile.overrides.text.title.letterSpacingEm` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.mobile.overrides.text.title.alignment` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.mobile.overrides.text.title.maxWidthCh` | home008 | createHomepagePresentationBindings → real home008 semantic title target |
| `presentation.sections.home008.mobile.overrides.text.body.fontSizePx` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.mobile.overrides.text.body.fontWeight` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.mobile.overrides.text.body.color` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.mobile.overrides.text.body.lineHeight` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.mobile.overrides.text.body.letterSpacingEm` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.mobile.overrides.text.body.alignment` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.mobile.overrides.text.body.maxWidthCh` | home008 | createHomepagePresentationBindings → real home008 semantic body target |
| `presentation.sections.home008.mobile.overrides.layout.contentMaxWidthPx` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.mobile.overrides.layout.paddingTopPx` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.mobile.overrides.layout.paddingBottomPx` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.mobile.overrides.background.mode` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.mobile.overrides.background.color` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.mobile.overrides.visible` | home008 | createHomepagePresentationBindings → real home008 content/section CSS binding |
| `presentation.sections.home008.mobile.overrideEnabled` | home008 | Mobile binding activation; OFF retains existing sparse values |
| `presentation.sections.home009.base.text.title.fontSizePx` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.base.text.title.fontWeight` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.base.text.title.color` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.base.text.title.lineHeight` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.base.text.title.letterSpacingEm` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.base.text.title.alignment` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.base.text.title.maxWidthCh` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.base.text.intro.fontSizePx` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.base.text.intro.fontWeight` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.base.text.intro.color` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.base.text.intro.lineHeight` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.base.text.intro.letterSpacingEm` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.base.text.intro.alignment` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.base.text.intro.maxWidthCh` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.base.text.cardBody.fontSizePx` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.base.text.cardBody.fontWeight` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.base.text.cardBody.color` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.base.text.cardBody.lineHeight` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.base.text.cardBody.letterSpacingEm` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.base.text.cardBody.alignment` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.base.text.cardBody.maxWidthCh` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.base.text.metadata.fontSizePx` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.base.text.metadata.fontWeight` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.base.text.metadata.color` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.base.text.metadata.lineHeight` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.base.text.metadata.letterSpacingEm` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.base.text.metadata.alignment` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.base.text.metadata.maxWidthCh` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.base.layout.contentMaxWidthPx` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.base.layout.paddingTopPx` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.base.layout.paddingBottomPx` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.base.background.mode` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.base.background.color` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.base.visible` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.mobile.overrides.text.title.fontSizePx` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.mobile.overrides.text.title.fontWeight` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.mobile.overrides.text.title.color` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.mobile.overrides.text.title.lineHeight` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.mobile.overrides.text.title.letterSpacingEm` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.mobile.overrides.text.title.alignment` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.mobile.overrides.text.title.maxWidthCh` | home009 | createHomepagePresentationBindings → real home009 semantic title target |
| `presentation.sections.home009.mobile.overrides.text.intro.fontSizePx` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.mobile.overrides.text.intro.fontWeight` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.mobile.overrides.text.intro.color` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.mobile.overrides.text.intro.lineHeight` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.mobile.overrides.text.intro.letterSpacingEm` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.mobile.overrides.text.intro.alignment` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.mobile.overrides.text.intro.maxWidthCh` | home009 | createHomepagePresentationBindings → real home009 semantic intro target |
| `presentation.sections.home009.mobile.overrides.text.cardBody.fontSizePx` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.mobile.overrides.text.cardBody.fontWeight` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.mobile.overrides.text.cardBody.color` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.mobile.overrides.text.cardBody.lineHeight` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.mobile.overrides.text.cardBody.letterSpacingEm` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.mobile.overrides.text.cardBody.alignment` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.mobile.overrides.text.cardBody.maxWidthCh` | home009 | createHomepagePresentationBindings → real home009 semantic cardBody target |
| `presentation.sections.home009.mobile.overrides.text.metadata.fontSizePx` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.mobile.overrides.text.metadata.fontWeight` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.mobile.overrides.text.metadata.color` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.mobile.overrides.text.metadata.lineHeight` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.mobile.overrides.text.metadata.letterSpacingEm` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.mobile.overrides.text.metadata.alignment` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.mobile.overrides.text.metadata.maxWidthCh` | home009 | createHomepagePresentationBindings → real home009 semantic metadata target |
| `presentation.sections.home009.mobile.overrides.layout.contentMaxWidthPx` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.mobile.overrides.layout.paddingTopPx` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.mobile.overrides.layout.paddingBottomPx` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.mobile.overrides.background.mode` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.mobile.overrides.background.color` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.mobile.overrides.visible` | home009 | createHomepagePresentationBindings → real home009 content/section CSS binding |
| `presentation.sections.home009.mobile.overrideEnabled` | home009 | Mobile binding activation; OFF retains existing sparse values |
| `presentation.sections.home010.base.text.title.fontSizePx` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.base.text.title.fontWeight` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.base.text.title.color` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.base.text.title.lineHeight` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.base.text.title.letterSpacingEm` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.base.text.title.alignment` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.base.text.title.maxWidthCh` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.base.text.body.fontSizePx` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.base.text.body.fontWeight` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.base.text.body.color` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.base.text.body.lineHeight` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.base.text.body.letterSpacingEm` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.base.text.body.alignment` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.base.text.body.maxWidthCh` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.base.text.cta.fontSizePx` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.base.text.cta.fontWeight` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.base.text.cta.color` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.base.text.cta.lineHeight` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.base.text.cta.letterSpacingEm` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.base.text.cta.alignment` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.base.text.cta.maxWidthCh` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.base.layout.contentMaxWidthPx` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.base.layout.paddingTopPx` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.base.layout.paddingBottomPx` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.base.background.mode` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.base.background.color` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.base.visible` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.mobile.overrides.text.title.fontSizePx` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.mobile.overrides.text.title.fontWeight` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.mobile.overrides.text.title.color` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.mobile.overrides.text.title.lineHeight` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.mobile.overrides.text.title.letterSpacingEm` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.mobile.overrides.text.title.alignment` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.mobile.overrides.text.title.maxWidthCh` | home010 | createHomepagePresentationBindings → real home010 semantic title target |
| `presentation.sections.home010.mobile.overrides.text.body.fontSizePx` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.mobile.overrides.text.body.fontWeight` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.mobile.overrides.text.body.color` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.mobile.overrides.text.body.lineHeight` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.mobile.overrides.text.body.letterSpacingEm` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.mobile.overrides.text.body.alignment` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.mobile.overrides.text.body.maxWidthCh` | home010 | createHomepagePresentationBindings → real home010 semantic body target |
| `presentation.sections.home010.mobile.overrides.text.cta.fontSizePx` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.mobile.overrides.text.cta.fontWeight` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.mobile.overrides.text.cta.color` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.mobile.overrides.text.cta.lineHeight` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.mobile.overrides.text.cta.letterSpacingEm` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.mobile.overrides.text.cta.alignment` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.mobile.overrides.text.cta.maxWidthCh` | home010 | createHomepagePresentationBindings → real home010 semantic cta target |
| `presentation.sections.home010.mobile.overrides.layout.contentMaxWidthPx` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.mobile.overrides.layout.paddingTopPx` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.mobile.overrides.layout.paddingBottomPx` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.mobile.overrides.background.mode` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.mobile.overrides.background.color` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.mobile.overrides.visible` | home010 | createHomepagePresentationBindings → real home010 content/section CSS binding |
| `presentation.sections.home010.mobile.overrideEnabled` | home010 | Mobile binding activation; OFF retains existing sparse values |
