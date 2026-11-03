import './member-copy-test-bootstrap.mjs';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier, context, nextResolve) {
  if (specifier === 'next/navigation' && context.parentURL?.includes('/GalleryExperience.tsx')) return {url:'data:text/javascript,export function useSearchParams(){return new URLSearchParams(globalThis.__galleryQuery || "");}',shortCircuit:true};
  if (specifier === 'next/image') {
    const resolved = nextResolve('next/image.js', context);
    return {url: 'data:text/javascript,' + encodeURIComponent(`import image from ${JSON.stringify(resolved.url)};export default image.default || image;`), shortCircuit:true};
  }
  return nextResolve(specifier, context);
}});
