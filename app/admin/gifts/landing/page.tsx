import { forbidden, redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import { readGiftCmsEditor } from "@/lib/giftCmsAdmin";
import GiftCmsEditor from "@/components/admin/GiftCmsEditor";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function GiftLandingEditor() {
  const session = await readAdminSession(); if (!session) redirect("/admin/login"); if (session.role !== "owner") forbidden();
  return <GiftCmsEditor initial={await readGiftCmsEditor()} />;
}
