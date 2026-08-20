import type { ReactNode } from "react";

type ProductPageEntranceProps = {
  children: ReactNode;
};

export default function ProductPageEntrance({ children }: ProductPageEntranceProps) {
  return (
    <div className="product-page-entrance">
      {children}
    </div>
  );
}
