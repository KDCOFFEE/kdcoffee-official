import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export const runtime = "nodejs";

const cleanPart=(value:string)=>value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/-+/g,"-").replace(/^-+|-+$/g,"");
const safeExt=(file:File)=>path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g,"")||(file.type.startsWith("video/")?".mp4":".jpg");

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "沒有選擇檔案" }, { status: 400 });
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return NextResponse.json({ error: "只接受圖片或影片" }, { status: 400 });
  if (file.size > 40 * 1024 * 1024) return NextResponse.json({ error: "檔案不可超過 40MB" }, { status: 400 });

  const ext=safeExt(file);
  const requested=String(formData.get("desiredName")||"");
  const artworkSlug=cleanPart(String(formData.get("artworkSlug")||"artwork"))||"artwork";
  const assetType=cleanPart(String(formData.get("assetType")||"asset"))||"asset";
  const assetGroup=cleanPart(String(formData.get("assetGroup")||""));
  const isHome003=assetGroup==="home003";
  const isCampaign=assetGroup==="campaign";
  const requestedStem=cleanPart(path.basename(requested,path.extname(requested)));
  const baseStem=requestedStem.replace(/-v\d+$/i,"")||`kdcoffee-${artworkSlug}-${assetType}`;
  const seoStem=isHome003||baseStem.startsWith("kdcoffee-")?baseStem:`kdcoffee-${baseStem}`;
  const uploadDir=isHome003
    ? path.join(process.cwd(),"public","images","home003")
    : isCampaign
      ? path.join(process.cwd(),"public","images","campaigns")
      : path.join(process.cwd(),"public","uploads","artworks",artworkSlug);
  await fs.mkdir(uploadDir,{recursive:true});
  const existing=await fs.readdir(uploadDir).catch(()=>[] as string[]);
  const versionPattern=new RegExp(`^${seoStem.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}-v(\\d+)\\.[a-z0-9]+$`,`i`);
  const versions=existing.map(name=>name.match(versionPattern)).filter(Boolean).map(m=>Number(m?.[1]||0));
  const version=Math.max(0,...versions)+1;
  const fileName=`${seoStem}-v${String(version).padStart(2,"0")}${ext}`;
  await fs.writeFile(path.join(uploadDir,fileName),Buffer.from(await file.arrayBuffer()));
  const publicPath=isHome003
    ? `/images/home003/${fileName}`
    : isCampaign
      ? `/images/campaigns/${fileName}`
      : `/uploads/artworks/${artworkSlug}/${fileName}`;
  return NextResponse.json({ok:true,path:publicPath,fileName,originalFileName:file.name,version});
}
