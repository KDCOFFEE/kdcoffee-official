import type { ReactNode } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import styles from "@/components/store/StorePublic.module.css";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div id="top" className={styles.shell}>
      <a className={styles.skipLink} href="#store-main">跳至商店內容</a>
      <Header />
      {children}
      <Footer />
    </div>
  );
}
