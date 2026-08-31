import { promises as fs } from "fs";
import Link from "next/link";
import { redirect } from "next/navigation";

import MembershipRulesManager from "@/components/admin/MembershipRulesManager";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { readMembershipRulesStore } from "@/lib/membershipBusinessRules";
import { getWebsiteDataFile } from "@/lib/storagePaths";

import "./membership.css";
import "@/components/admin/AdminRuleHelp.css";
import "@/components/admin/MembershipRulesDisplayFix.css";

export const dynamic = "force-dynamic";

export default async function AdminMembershipPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const [store, website] = await Promise.all([
    readMembershipRulesStore(),
    fs.readFile(getWebsiteDataFile(), "utf8").then((content) => JSON.parse(content)),
  ]);
  const products = Array.isArray(website?.menu?.products)
    ? website.menu.products.filter((product: Record<string, unknown>) => typeof product.slug === "string" && typeof product.name === "string").map((product: Record<string, unknown>) => ({ id: String(product.slug), name: String(product.name) }))
    : [];
  const active = store.versions.at(-1);
  if (!active) throw new Error("會員商務設定版本遺失");

  return <main className="admin-page membership-rules-page">
    <nav className="admin-breadcrumb"><Link href="/admin">← 返回營運中心</Link><span>會員／商業設定</span></nav>
    <MembershipRulesManager initialRevision={store.revision} initialVersion={active.rulesVersion} initialRules={active.rules} products={products} />
  </main>;
}
