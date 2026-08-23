import {
  getProductCustomSectionAnimationAttributes,
  productCustomSectionAnchor,
  type ProductCustomFeatureIcon,
  type ProductCustomSection,
} from "@/lib/productCustomSections";

const iconPaths: Record<ProductCustomFeatureIcon, string> = {
  flavor: "M12 3c3 3 5 6 5 9a5 5 0 0 1-10 0c0-3 2-6 5-9Zm-3 9c1 0 2-.5 3-1.5 1 1 2 1.5 3 1.5",
  origin: "M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  process: "M4 7h12M8 3 4 7l4 4m12 6H8m8-4 4 4-4 4",
  roast: "M12 21c4-2 6-5 6-9 0-3-2-7-6-9-4 2-6 6-6 9 0 4 2 7 6 9Zm0-15c-2 4 2 5 0 12",
  air: "M3 8h11a3 3 0 1 0-3-3M3 12h16a2 2 0 1 1-2 2M3 16h9",
  heat: "M8 19c-2-2-2-5 0-7 2-2 2-4 1-7 4 2 7 6 7 10a4 4 0 0 1-8 0c0-2 1-3 2-4",
  cupping: "M4 8h13v5a6 6 0 0 1-12 0V8Zm13 2h2a2 2 0 0 1 0 4h-2M3 21h16",
};

function FeatureIcon({ name }: { name: ProductCustomFeatureIcon }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconPaths[name]} /></svg>;
}

export default function CustomProductSectionRenderer({ section }: { section: ProductCustomSection }) {
  const anchor = productCustomSectionAnchor(section.id);
  const headingId = section.content.heading ? `${anchor}-title` : undefined;
  const label = section.content.heading || section.content.eyebrow || section.adminName;
  const className = `revenue-content-section custom-product-section custom-product-section--${section.type} custom-product-layout--${section.layout}`;
  const animationAttributes = getProductCustomSectionAnimationAttributes(section);

  if (section.type === "text") {
    return <section {...animationAttributes} id={anchor} className={className} aria-labelledby={headingId} aria-label={headingId ? undefined : label}>
      <div className="custom-product-copy">
        {section.content.eyebrow ? <p className="custom-product-eyebrow">{section.content.eyebrow}</p> : null}
        {section.content.heading ? <h2 id={headingId}>{section.content.heading}</h2> : null}
        {section.content.body ? <div className="custom-product-body">{section.content.body.split(/\n{2,}/u).map((paragraph, index) => <p key={`${section.id}-paragraph-${index}`}>{paragraph}</p>)}</div> : null}
      </div>
    </section>;
  }

  return <section {...animationAttributes} id={anchor} className={className} aria-labelledby={headingId} aria-label={headingId ? undefined : label}>
    {(section.content.eyebrow || section.content.heading || section.content.description) ? <div className="custom-product-heading">
      {section.content.eyebrow ? <p className="custom-product-eyebrow">{section.content.eyebrow}</p> : null}
      {section.content.heading ? <h2 id={headingId}>{section.content.heading}</h2> : null}
      {section.content.description ? <span>{section.content.description}</span> : null}
    </div> : null}
    <div className="custom-product-features">
      {section.content.items.map((item) => <article key={item.id}>
        {item.icon ? <FeatureIcon name={item.icon} /> : null}
        <div><h3>{item.title}</h3><p>{item.body}</p></div>
      </article>)}
    </div>
  </section>;
}
