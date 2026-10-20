import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import WorksArtworkWorkspace, { WorkspaceProblem } from "@/components/admin/works/WorksArtworkWorkspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "作品唯讀管理", robots: { index: false, follow: false } };

export default async function AdminArtworkPage(props: { params: Promise<{ slug: string }> }) {
  const session = await readAdminSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "owner") return <WorkspaceProblem status={403} />;
  const { slug } = await props.params;
  return <WorksArtworkWorkspace key={slug} slug={slug} />;
}
