import type {AssetRecord} from './assets';
import {isLocalAssetImagePath} from './media';
/** Only normal public Asset Library raster references; never private attachments or external URLs. */
export function isLineCardHeaderAsset(asset:AssetRecord):boolean {
 return asset.status==='active' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/.test(asset.id) && isLocalAssetImagePath(asset.path) && /^\/uploads\/assets\/[a-z0-9-]+\/[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(asset.path);
}
export function resolveLineCardHeaderAsset(id:string|undefined,assets:readonly AssetRecord[]=[]){return id?assets.find(asset=>asset.id===id&&isLineCardHeaderAsset(asset)):undefined;}
