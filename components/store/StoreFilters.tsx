import Link from "next/link";
import type { PublicStoreIndex } from "@/lib/storePublicSelectors";
import { storeBrowseHref } from "@/lib/storePublicMetadata";
import styles from "./StorePublic.module.css";

export default function StoreFilters({ model }: { model: PublicStoreIndex }) {
  const section = model.selectedSection;
  const introduction = section ? section.shortDescription.trim() ? section.shortDescription : section.description : "";
  return (
    <div className={styles.filters}>
      <nav className={styles.sectionNav} aria-label="銷售專區">
        <Link className={styles.sectionLink} href="/store" aria-current={model.filterStatus === "valid" && !section ? "page" : undefined}>全部商品</Link>
        {model.sections.map(item => (
          <Link key={item.slug} className={styles.sectionLink}
            href={storeBrowseHref({ sectionSlug: item.slug })}
            aria-current={section?.slug === item.slug ? "page" : undefined}>{item.name}</Link>
        ))}
      </nav>
      {section ? (
        <section className={styles.sectionContext} aria-labelledby="store-section-heading">
          <p className={styles.eyebrow}>銷售專區</p>
          <h2 id="store-section-heading">{section.name}</h2>
          {introduction.trim() ? <p className={styles.sectionDescription}>{introduction}</p> : null}
        </section>
      ) : null}
      {section && model.categories.length > 0 ? (
        <nav className={styles.categoryNav} aria-label="商品分類">
          <Link className={styles.categoryLink} href={storeBrowseHref({ sectionSlug: section.slug })}
            aria-current={model.filterStatus === "valid" && !model.selectedCategory ? "page" : undefined}>全部</Link>
          {model.categories.map(item => (
            <Link key={item.slug} className={styles.categoryLink}
              href={storeBrowseHref({ sectionSlug: section.slug, categorySlug: item.slug })}
              aria-current={model.selectedCategory?.slug === item.slug ? "page" : undefined}>{item.name}</Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
