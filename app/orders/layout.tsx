import { readPointDisplayName } from "@/lib/pointDisplayNameStore";
import type { ReactNode } from "react";
import MemberCenterCopyProvider from "@/components/member/MemberCenterCopyProvider";
import { readMemberCenterCopy } from "@/lib/memberCenterCopyStore";

export const dynamic = "force-dynamic";
export default async function OrdersLayout({ children }: { children: ReactNode }) {
  const [copy, pointDisplayName] = await Promise.all([readMemberCenterCopy(), readPointDisplayName()]);
  return <MemberCenterCopyProvider initialOverrides={copy.overrides} initialPointDisplayName={pointDisplayName}>{children}</MemberCenterCopyProvider>;
}
