import ProductVisualMedia from "@/components/commerce/ProductVisualMedia";

export default function Home004ProductMedia({ src = "", alt, imageId }: { src?: string; alt: string; imageId: string }) {
  return <div className="v3-media">
    <ProductVisualMedia
      src={src}
      alt={alt}
      fallback={<div className="v3-media-placeholder"><b>{imageId}</b><span>作品圖片準備中</span></div>}
    />
  </div>;
}
