const contactLinks = [
  {
    label: "官方 LINE",
    detail: "選豆、訂購與禮盒洽詢",
    href: "https://line.me/R/ti/p/@kdcoffee",
    external: true,
  },
  {
    label: "Facebook",
    detail: "查看新品與每月活動",
    href: "https://www.facebook.com/KDcoffee.tw",
    external: true,
  },
  {
    label: "電話聯絡",
    detail: "0955-504-789",
    href: "tel:0955504789",
    external: false,
  },
];

export default function ContactSection() {
  return (
    <section id="contact" className="contact-section section-light">
      <div className="contact-shell">
        <div className="contact-copy">
          <p className="eyebrow dark">START YOUR KD COFFEE JOURNEY</p>
          <h2>
            找到適合你的咖啡，
            <br />
            不需要很複雜。
          </h2>
          <p>
            第一次接觸精品咖啡、不確定該怎麼選，也沒關係。告訴我們平常喜歡的味道，
            我們會用簡單、好理解的方式陪你挑選。
          </p>
        </div>

        <div className="contact-link-list" aria-label="KD Coffee 聯絡方式">
          {contactLinks.map((item, index) => (
            <a
              className="contact-link-card"
              href={item.href}
              key={item.label}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noreferrer" : undefined}
            >
              <span className="contact-link-number">0{index + 1}</span>
              <span className="contact-link-text">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <i aria-hidden="true">↗</i>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
