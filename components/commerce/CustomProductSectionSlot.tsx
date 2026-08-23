import { Fragment, type ReactNode } from "react";
import type { ProductSectionPlacement } from "@/lib/productPageSections";
import { resolveProductCustomSectionSlot, type ProductCustomSection } from "@/lib/productCustomSections";
import CustomProductSectionRenderer from "./CustomProductSectionRenderer";

type SystemSection = {
  id: string;
  placement: ProductSectionPlacement;
  order: number;
  node: ReactNode;
};

export default function CustomProductSectionSlot({
  placement,
  sections,
  systemSections,
}: {
  placement: ProductSectionPlacement;
  sections: readonly ProductCustomSection[];
  systemSections: readonly SystemSection[];
}) {
  const entries = [
    ...resolveProductCustomSectionSlot(sections, placement).map((section) => ({
      id: section.id,
      order: section.order,
      node: <CustomProductSectionRenderer section={section} />,
    })),
    ...systemSections.filter((section) => section.node && section.placement === placement),
  ].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

  return entries.map((entry) => <Fragment key={entry.id}>{entry.node}</Fragment>);
}
