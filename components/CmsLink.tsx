import Link from "next/link";
import type { ReactNode } from "react";
import { resolveCmsLink, type CmsLinkRegistryInput, type CmsLinkValue } from "@/lib/cmsLinks";

export default function CmsLink({ value, registry, className, children, ...props }: { value: CmsLinkValue; registry?: CmsLinkRegistryInput; className?: string; children: ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  const resolved = resolveCmsLink(value, registry);
  if (!resolved.valid || !resolved.href) return <span {...props} className={`${className || ""} is-disabled`.trim()} aria-disabled="true">{children}</span>;
  const tabProps = (resolved.newTab ?? resolved.external) ? { target: "_blank", rel: "noopener noreferrer" } : {};
  if (/^(?:tel:|mailto:)/u.test(resolved.href) || resolved.external) return <a {...props} className={className} href={resolved.href} {...tabProps}>{children}</a>;
  return <Link {...props} className={className} href={resolved.href} {...tabProps}>{children}</Link>;
}
