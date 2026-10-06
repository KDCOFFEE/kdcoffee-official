import type { ReactNode } from "react";
import MemberCenterCopyProvider from "@/components/member/MemberCenterCopyProvider";
import { readMemberCenterCopy } from "@/lib/memberCenterCopyStore";

export const dynamic = "force-dynamic";
export default async function CheckoutLayout({ children }: { children: ReactNode }) {
  const copy = await readMemberCenterCopy();
  return <MemberCenterCopyProvider initialOverrides={copy.overrides}>{children}</MemberCenterCopyProvider>;
}
