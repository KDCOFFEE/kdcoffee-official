# Smart Link destination registry contract

H.2C9A resolves all CMS-owned links through `lib/cmsLinks.ts`. Existing string values remain readable and are not migrated until an owner changes that field.

H.2C9B Page Builder must pass published pages to `buildCmsDestinationRegistry`, `resolveCmsLink`, and `SmartLinkPicker` using this contract:

```ts
type PublishedCmsPage = {
  id: string;        // stable identifier; does not change when the title changes
  title: string;     // human-facing Chinese destination label
  href: string;      // canonical public path, beginning with /
  published: boolean;
};
```

Only published pages with safe canonical paths enter the registry. Smart Link stores `{ type: "page", target: page.id }`, not the slug or title. If a page is unpublished or removed, Admin preserves and warns about the saved id; the storefront renders that CTA non-clickable. The Page Builder remains the source of truth for page publication state and canonical paths.
