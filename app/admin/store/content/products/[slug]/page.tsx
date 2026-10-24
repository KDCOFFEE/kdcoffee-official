import { forbidden, redirect, notFound } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import { readGiftCmsEditor } from "@/lib/giftCmsAdmin";
import { GiftCmsNotFoundError } from "@/lib/giftCmsStore";
import { isStoreProductSlug } from "@/lib/storePublicMetadata";
import GiftCmsEditor from "@/components/admin/GiftCmsEditor";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function GiftProductEditor({ params }: { params: Promise<{ slug: string }> }) {
  const session = await readAdminSession(); if (!session) redirect("/admin/login"); if (session.role !== "owner") forbidden();
  const { slug } = await params; if (!isStoreProductSlug(slug)) notFound();
  try { return <GiftCmsEditor key={slug} initial={await readGiftCmsEditor(slug, true)} />; } catch (error) { if (error instanceof GiftCmsNotFoundError) notFound(); throw error; }
}
