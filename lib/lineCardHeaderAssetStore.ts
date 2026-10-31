import 'server-only';
import {getAssetLibrary} from './assets';
import {assertAssetImageAvailable} from './assetImages';
import {isLineCardHeaderAsset} from './lineCardHeaderAssets';
import {LINE_CARD_IMAGE_LIMITS,ImageSafetyError} from './websiteImages';
/** Caller must authorize Owner before this read/decoder boundary. No mutation or new storage. */
export async function readLineCardHeaderAssets(){
 const library=await getAssetLibrary();const result=[];
 for(const asset of library.assets.filter(isLineCardHeaderAsset)){
  try{await assertAssetImageAvailable(asset.path,true,LINE_CARD_IMAGE_LIMITS);result.push(asset);}catch{/* Missing or unsafe assets never enter preview. */}
 }
 return result;
}
export async function requireLineCardHeaderAsset(id:string){
 const asset=(await getAssetLibrary()).assets.find(asset=>asset.id===id&&isLineCardHeaderAsset(asset));
 if(!asset)throw new ImageSafetyError('所選素材不存在或已停用，請重新選擇。');
 await assertAssetImageAvailable(asset.path,true,LINE_CARD_IMAGE_LIMITS);return asset;
}
