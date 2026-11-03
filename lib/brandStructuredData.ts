import { BRAND_NAME, BRAND_DESCRIPTION, canonicalPublicUrl } from "./socialMetadata";

export function brandStructuredData() {
  const url = canonicalPublicUrl("/");
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": `${url}#organization`, name: BRAND_NAME, alternateName: "KD Coffee", url, description: BRAND_DESCRIPTION },
    { "@type": "WebSite", "@id": `${url}#website`, name: BRAND_NAME, url, inLanguage: "zh-Hant", publisher: { "@id": `${url}#organization` } },
  ] };
}

export function workStructuredData(product: { slug: string; name: string }, description: string, image: string) {
  const url = canonicalPublicUrl(`/works/${encodeURIComponent(product.slug)}`);
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "Product", "@id": `${url}#product`, name: product.name, description, image, url, brand: { "@type": "Brand", name: BRAND_NAME } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: BRAND_NAME, item: canonicalPublicUrl("/") },
      { "@type": "ListItem", position: 2, name: "咖啡作品", item: canonicalPublicUrl("/works") },
      { "@type": "ListItem", position: 3, name: product.name, item: url },
    ] },
  ] };
}

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
