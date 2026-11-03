/** Resolve only against the already-filtered public Gallery projection. */
export function resolveGalleryActiveIndex(works: readonly { slug: string }[], requested: unknown) {
  const index = typeof requested === 'string' ? works.findIndex(work => work.slug === requested) : -1;
  return index < 0 ? 0 : index;
}

export function galleryWorkLocation(href: string, slug: string) {
  const url = new URL(href, 'https://www.kdcoffee1962.com');
  url.searchParams.set('work', slug);
  return url.pathname + url.search + url.hash;
}
