import Link from "next/link";
import type { CSSProperties } from "react";

import type {
  HomepageData,
} from "@/data/homepageData";

import HomepageSceneMedia from "@/components/home/HomepageSceneMedia";
import CmsLink from "@/components/CmsLink";
import HomepageMotion from "@/components/home/HomepageMotion";
import HomepageMediaCollection, { resolveHomepageMediaCollection } from "@/components/home/HomepageMediaCollection";
import HomepageStudioGallery from "@/components/home/HomepageStudioGallery";
import MonthlyCampaign from "@/components/home/MonthlyCampaign";
import Home004ProductMedia from "@/components/home/Home004ProductMedia";
import KdMedia from "@/components/media/KdMedia";
import { resolveMediaAsset, type MediaAsset } from "@/lib/media";
import { homepageMotionCssVariables, orderedEnabledItems, resolveHeroTiming, resolveHomepageMotion, sectionIsEnabled, type HomepageMotionSectionKey } from "@/lib/homepageCms";
import type { CmsLinkValue, PublishedCmsPage } from "@/lib/cmsLinks";

import {
  hasAvailableHome004Sku,
  resolveHome004Recommendations,
} from "@/lib/home004Recommendations";

import {
  resolveListAsset,
} from "@/lib/productVisualAssets";

type Product = {
  slug: string;
  name: string;
  subtitle?: string;
  shortCopy?: string;
  cover?: string;
  poster?: string;
  active?: boolean;
  status?: string;
  purchasable?: boolean;
  inMonthlyMenu?: boolean;
  skus?: unknown;
  assets?: Record<
    string,
    unknown
  >;
  pageLayout?: Record<
    string,
    unknown
  >;
  purchase?: Array<{
    label: string;
    detail: string;
    price: number;
    kind?: string;
  }>;
};

type HomepageContentItem = {
  id?: string;
  imageId: string;
  image?: string;
  media?: MediaAsset;
  mediaItems?: unknown;
  enabled?: boolean;
  alt?: string;
  title: string;
  text: string;
  eyebrow?: string;
  button?: string;
  href?: CmsLinkValue;
  ctaEnabled?: boolean;
  recommendedSize?: string;
};

type HomepageStudioItem = Pick<
  HomepageContentItem,
  "id" | "imageId" | "image" | "media" | "mediaItems" | "enabled" | "alt"
>;

type HomepageReviewItem = {
  id: string;
  text: string;
  name: string;
  source: string;
};

type MotionOwner = { motion?: unknown };

function sectionMotionProps(owner: MotionOwner, sectionKey: HomepageMotionSectionKey) {
  if (!("motion" in owner) || owner.motion === undefined) return {};
  const motion = resolveHomepageMotion(owner.motion, sectionKey);
  return {
    "data-home-motion": motion.activePreset,
    style: homepageMotionCssVariables(motion) as CSSProperties,
  };
}

function motionItemStyle(index: number) {
  return { "--home-motion-index": index } as CSSProperties;
}

export type HomepageViewData = HomepageData & {
  hero: HomepageData["hero"] & {
    secondaryLabel?: string;
    secondaryHref?: CmsLinkValue;
  };
  home002: { title: string; intro: string; cards: HomepageContentItem[] } & MotionOwner;
  home003: { title: string; intro: string; cards: HomepageContentItem[] } & MotionOwner;
  home004: { title: string; intro: string; productSlugs?: unknown } & MotionOwner;
  home005: { title: string; intro: string; steps: HomepageContentItem[] } & MotionOwner;
  home006: HomepageContentItem & {
    points: string[];
    button?: string;
    href?: CmsLinkValue;
  } & MotionOwner;
  home007: { title: string; text: string; cards: HomepageContentItem[] } & MotionOwner;
  home008: { title: string; text: string; images: HomepageStudioItem[]; mediaItems?: HomepageStudioItem[]; enabled?: boolean } & MotionOwner;
  home009: {
    enabled?: boolean;
    title: string;
    intro: string;
    items: HomepageReviewItem[];
  } & MotionOwner;
  home010: { title: string; text: string; button?: string; href?: CmsLinkValue; ctaEnabled?: boolean } & MotionOwner;
};

/**
 * ============================================================
 * 首頁一般圖片 Media
 * ============================================================
 *
 * 這個 Media 主要使用在：
 *
 * HOME005
 * HOME006
 * HOME007
 * HOME008
 *
 * 全部位於首頁較下方，
 * 所以統一使用 Lazy Loading。
 */
function Media({
  src,
  media,
  mediaItems,
  alt,
}: {
  src?: string;
  media?: MediaAsset;
  mediaItems?: unknown;
  alt: string;
  id: string;
}) {
  return (
    <HomepageMediaCollection alt={alt} className="v3-media" media={media} mediaItems={mediaItems} src={src} />
  );
}

export default function HomepageV3({
  homepageData,
  products,
  pages,
}: {
  homepageData: HomepageViewData;

  products: Product[];
  pages: PublishedCmsPage[];
}) {
  const h = homepageData;

  const hero =
    h.hero || {};

  const why =
    h.home002 || {};

  const entries =
    h.home003 || {};

  const starter =
    h.home004 || {};

  const process =
    h.home005 || {};

  const roast =
    h.home006 || {};

  const art =
    h.home007 || {};

  const studio =
    h.home008 || {};

  const reviews =
    h.home009 || {};

  const cta =
    h.home010 || {};

  const home004Resolution =
    resolveHome004Recommendations(
      starter.productSlugs,
      products,
    );

  const selected =
    home004Resolution
      .recommendations;
  const whyCards = orderedEnabledItems<HomepageContentItem>(why.cards);
  const entryCards = orderedEnabledItems<HomepageContentItem>(entries.cards);
  const processSteps = orderedEnabledItems<HomepageContentItem>(process.steps);
  const artCards = orderedEnabledItems<HomepageContentItem>(art.cards);
  const studioSource = Array.isArray(studio.mediaItems) ? studio.mediaItems : studio.images || [];
  const studioMedia = orderedEnabledItems<HomepageStudioItem>(studioSource).flatMap((item) =>
    resolveHomepageMediaCollection({
      alt: item.alt || studio.title,
      mediaItems: Array.isArray(item.mediaItems) && item.mediaItems.length ? item.mediaItems : [item],
    }),
  );
  const heroTiming = resolveHeroTiming(hero.timing);
  const heroStyle = {
    "--home-hero-media-duration": `${heroTiming.mediaDuration}ms`,
    "--home-hero-eyebrow-start": `${heroTiming.eyebrowStart}ms`,
    "--home-hero-line-1-start": `${heroTiming.headlineLine1Start}ms`,
    "--home-hero-line-2-start": `${heroTiming.headlineLine2Start}ms`,
    "--home-hero-lead-start": `${heroTiming.leadStart}ms`,
    "--home-hero-primary-start": `${heroTiming.primaryCtaStart}ms`,
    "--home-hero-secondary-start": `${heroTiming.secondaryCtaStart}ms`,
    "--home-hero-trust-start": `${heroTiming.trustStart}ms`,
  } as CSSProperties;

  return (
    <>
      <HomepageMotion />
      {/**
       * ======================================================
       * HERO
       * ======================================================
       *
       * Hero 是首屏。
       *
       * 這裡目前不做 Lazy Loading，
       * 避免首屏反而變慢。
       *
       * Hero Video 的下載策略，
       * 下一階段另外獨立檢查。
       */}
      {hero.enabled !== false ? <section
        id="top"
        className="v3-hero home-surface-dark home-surface-media"
        data-hero-motion={hero.motionEnabled === false ? "off" : "on"}
        style={heroStyle}
      >
        {resolveMediaAsset(hero.media) ? (
          <KdMedia
            media={resolveMediaAsset(hero.media)}
            alt="KD Coffee 首頁主視覺"
            className="v3-hero-video"
            fallbackImageUrl={hero.poster}
            backgroundVideo
            eager
          />
        ) : hero.videoWebm || hero.videoMp4 ? (
          <video className="v3-hero-video" autoPlay muted loop playsInline poster={hero.poster} aria-label="KD Coffee 真實烘豆影片">
            {hero.videoWebm ? <source src={hero.videoWebm} type="video/webm" /> : null}
            {hero.videoMp4 ? <source src={hero.videoMp4} type="video/mp4" /> : null}
          </video>
        ) : hero.poster ? (
          <img className="v3-hero-video" src={hero.poster} alt="KD Coffee 首頁主視覺" />
        ) : null}

        <div className="v3-hero-shade" />

        <div className="v3-hero-content" data-home-hero>
          <p className="v3-eyebrow">
            {hero.eyebrow}
          </p>

          <h1>
            {(
              hero.titleLines ||
              []
            ).map(
              (
                x: string,
                i: number,
              ) => (
                <span key={i}>
                  {x}
                </span>
              ),
            )}
          </h1>

          <p className="v3-hero-lead">
            {hero.lead}
          </p>

          <div className="v3-actions">
            {hero.primaryCtaEnabled !== false ? <CmsLink
              className="v3-button primary v3-hero-primary-action"
              value={
                hero.buttonHref ||
                "#home003"
              }
              registry={{ products, pages }}
            >
              {hero.buttonLabel ||
                "開始挑咖啡"}
            </CmsLink> : null}

            {hero.secondaryCtaEnabled !== false ? <CmsLink
              className="v3-button ghost v3-hero-secondary-action"
              value={
                hero.secondaryHref ||
                "#home004"
              }
              registry={{ products, pages }}
            >
              {hero.secondaryLabel ||
                "本月作品"}
            </CmsLink> : null}
          </div>

          <div className="v3-trust">
            {(hero.trustCues || ["不用登入即可購買", "7-ELEVEN 取貨付款", "工作室自取"]).map((cue: string) => <span key={cue}>{cue}</span>)}
          </div>
        </div>
      </section> : null}

      {/**
       * ======================================================
       * HOME002
       * ======================================================
       *
       * 位於 Hero 後方。
       *
       * 圖片改成 Lazy Loading。
       */}
      {sectionIsEnabled(why) && whyCards.length ? <section
        id="home002"
        className="v3-section v3-why home-surface-light"
        {...sectionMotionProps(why, "home002")}
      >
        <div className="v3-why-heading" data-home-reveal="content" data-home-motion-part style={motionItemStyle(0)}>
          <div className="v3-why-title-row">
            <h2>
              {why.title}
            </h2>

            <p>
              {why.intro}
            </p>
          </div>
        </div>

        <div
          className="v3-value-grid home-mobile-rail"
          data-home-reveal="media"
          tabIndex={0}
          aria-label="KD Coffee 四項特色，可左右滑動瀏覽"
        >
          {(
            whyCards
          ).map(
            (
              c: HomepageContentItem,
              index: number,
            ) => {
              const cardMedia = resolveHomepageMediaCollection({ alt: c.alt || c.title, media: c.media, mediaItems: c.mediaItems, src: c.image });

              return (
              <article
                key={c.id}
                className={`v3-value-card ${cardMedia.length ? "" : "is-text-led"}`}
                data-home-motion-item
                style={motionItemStyle(index + 1)}
              >
                {cardMedia.length ? (
                  <div className="v3-value-media">
                    <HomepageMediaCollection alt={c.alt || c.title} media={c.media} mediaItems={c.mediaItems} src={c.image} />
                  </div>
                ) : null}

                <div className="v3-card-copy">
                  <div className="v3-card-number">
                    {String(
                      index + 1,
                    ).padStart(
                      2,
                      "0",
                    )}
                  </div>

                  <h3>
                    {c.title}
                  </h3>

                  <p>
                    {c.text}
                  </p>
                </div>
              </article>
              );
            },
          )}
        </div>

        <p className="v3-why-closing">
          你買到的不只是咖啡，還有每一個我們願意多花時間完成的細節。
        </p>
      </section> : null}

      {/**
       * ======================================================
       * HOME003
       * ======================================================
       *
       * 圖片 Lazy Loading
       * 由 HomepageSceneMedia 負責。
       */}
      {sectionIsEnabled(entries) && entryCards.length ? <section
        id="home003"
        className="v3-section v3-entry v3-scenes home-surface-dark"
        {...sectionMotionProps(entries, "home003")}
      >
        <header className="v3-section-head centered" data-home-reveal="content" data-home-motion-part style={motionItemStyle(0)}>
          <h2>
            {entries.title}
          </h2>

          <div>
            {entries.intro}
          </div>
        </header>

        <div
          className="v3-scene-grid home-mobile-rail"
          data-home-reveal="media"
          tabIndex={0}
          aria-label="四種咖啡時刻，可左右滑動選擇"
        >
          {(
            entryCards
          ).map(
            (
              c: HomepageContentItem,
              index: number,
            ) => {
              const sceneMediaItems = resolveHomepageMediaCollection({ alt: c.alt || c.title, media: c.media, mediaItems: c.mediaItems, src: c.image });
              const sceneMedia = sceneMediaItems.find((item) => item.primary) || sceneMediaItems[0];
              return <article
                key={c.id}
                data-home-motion-item
                style={motionItemStyle(index + 1)}
                className={`v3-scene-card ${
                  index === 0
                    ? "featured"
                    : ""
                }`}
              >
                <HomepageSceneMedia
                  src={sceneMedia ? undefined : c.image}

                  media={sceneMedia?.media || c.media}

                  alt={
                    c.alt ||
                    c.title
                  }

                  imageId={
                    c.imageId
                  }

                  label={
                    c.eyebrow ||
                    c.title
                  }

                  recommendedSize={
                    c.recommendedSize
                  }
                />

                {c.ctaEnabled !== false ? <CmsLink className="v3-scene-navigation" value={c.href || "/works"} registry={{ products, pages }}>
                  {sceneMedia?.media.type === "video" || sceneMedia?.media.type === "youtube" ? null : <span className="v3-scene-hitarea" aria-hidden="true" />}
                  <div className="v3-scene-copy">
                  <small>
                    {c.eyebrow || ""}
                  </small>

                  <h3>
                    {c.title}
                  </h3>

                  <p>
                    {c.text}
                  </p>

                  <b>
                    {c.button ||
                      "開始"}

                    <span>
                      →
                    </span>
                  </b>
                  </div>
                </CmsLink> : <div className="v3-scene-navigation is-disabled"><div className="v3-scene-copy"><small>{c.eyebrow || ""}</small><h3>{c.title}</h3><p>{c.text}</p></div></div>}
              </article>;
            },
          )}
        </div>
      </section> : null}

      {/**
       * Campaign 圖片 Lazy Loading
       * 由 CampaignMedia 負責。
       */}
      <MonthlyCampaign
        homepageData={
          homepageData
        }
        products={products}
        pages={pages}
      />

      {/**
       * ======================================================
       * HOME004
       * ======================================================
       *
       * ProductVisualMedia 只在 HOME004
       * 被指定 loading="lazy"。
       *
       * 不影響 /works 或商品詳細頁。
       */}
      {sectionIsEnabled(starter) && selected.length ? <section
        id="home004"
        className="v3-section v3-starter home-surface-light"
        {...sectionMotionProps(starter, "home004")}
      >
        <header className="v3-section-head" data-home-reveal="content" data-home-motion-part style={motionItemStyle(0)}>
          <h2>
            {starter.title}
          </h2>

          <div>
            {starter.intro}
          </div>
        </header>

        <div
          className="v3-product-grid home-mobile-rail"
          data-home-reveal="media"
          tabIndex={0}
          aria-label="三款入門咖啡，可左右滑動比較"
        >
          {selected.map(
            (p, index) => {
              const listAsset =
                resolveListAsset(
                  p,
                );

              return (
                <article
                  className="v3-product"
                  key={p.slug}
                  data-home-motion-item
                  style={motionItemStyle(index + 1)}
                >
                  <Link
                    href={`/works/${p.slug}`}
                  >
                    <Home004ProductMedia
                      src={
                        listAsset
                          ?.path
                      }

                      alt={
                        listAsset
                          ?.alt ||
                        p.name
                      }

                    />
                  </Link>

                  <div>
                    {!hasAvailableHome004Sku(
                      p,
                    ) ? (
                      <span className="v3-sold-out-badge">
                        暫時售罄
                      </span>
                    ) : null}

                    <h3>
                      {p.name}
                    </h3>

                    <p>
                      {p.shortCopy ||
                        p.subtitle}
                    </p>

                    <div className="v3-price-row">
                      {(
                        p.purchase ||
                        []
                      )
                        .slice(
                          0,
                          2,
                        )
                        .map(
                          (x) => (
                            <span
                              key={
                                x.label
                              }
                            >
                              {
                                x.label
                              }

                              <b>
                                NT$
                                {
                                  x.price
                                }
                              </b>
                            </span>
                          ),
                        )}
                    </div>

                    <Link
                      className="v3-text-link"
                      href={`/works/${p.slug}`}
                    >
                      查看作品與規格 →
                    </Link>
                  </div>
                </article>
              );
            },
          )}
        </div>
      </section> : null}

      {/**
       * HOME005
       */}
      {sectionIsEnabled(process) && processSteps.length ? <section
        id="home005"
        className="v3-section v3-process home-surface-light"
        {...sectionMotionProps(process, "home005")}
      >
        <header className="v3-section-head centered" data-home-reveal="editorial" data-home-motion-part style={motionItemStyle(0)}>
          <h2>
            {process.title}
          </h2>

          <div>
            {process.intro}
          </div>
        </header>

        {processSteps.length ? <div className="v3-process-progress" data-home-reveal="editorial-detail" data-home-motion-part style={motionItemStyle(1)} aria-label={`共 ${processSteps.length} 個咖啡製作步驟`}>
          <span aria-hidden="true" />
          <b>01 / {String(processSteps.length).padStart(2, "0")}</b>
        </div> : null}

        <div className="v3-process-grid v3-process-journey home-mobile-rail" data-home-reveal="editorial-media" tabIndex={processSteps.length > 1 ? 0 : undefined} aria-label="KD Coffee 咖啡製作旅程，可左右滑動瀏覽">
          {processSteps.map((s: HomepageContentItem, i: number) => {
            const hasMedia = resolveHomepageMediaCollection({ alt: s.alt || s.title, media: s.media, mediaItems: s.mediaItems, src: s.image }).length > 0;
            return <article key={s.id} className={hasMedia ? "" : "is-text-led"} data-home-motion-item style={motionItemStyle(i + 2)}>
              {hasMedia ? <Media src={s.image} media={s.media} mediaItems={s.mediaItems} alt={s.alt || s.title} id={s.imageId} /> : null}
              <div className="v3-process-copy"><span>{String(i + 1).padStart(2, "0")}</span><h3>{s.title}</h3><p>{s.text}</p></div>
            </article>;
          })}
        </div>
      </section> : null}

      {/**
       * HOME006
       */}
      {sectionIsEnabled(roast) ? <section
        id="home006"
        className="v3-section v3-roast-service home-surface-dark"
        {...sectionMotionProps(roast, "home006")}
      >
        <div className="v3-roast-copy" data-home-reveal="content" data-home-motion-part style={motionItemStyle(0)}>
          <h2>
            {roast.title}
          </h2>

          <div>
            {roast.text}
          </div>

          <ul className="v3-roast-facts">
            {(
              roast.points ||
              []
            ).map(
              (x: string) => (
                <li key={x}>
                  {x}
                </li>
              ),
            )}
          </ul>

          {roast.ctaEnabled !== false ? <CmsLink
            className="v3-button primary"
            value={
              roast.href ||
              "/works"
            }
            registry={{ products, pages }}
          >
            {roast.button ||
              "查看適用作品"}
          </CmsLink> : null}
        </div>

        <div data-home-reveal="media" data-home-motion-part style={motionItemStyle(1)}>
          <Media src={roast.image} media={roast.media} mediaItems={roast.mediaItems} alt={roast.alt || roast.title} id={roast.imageId || "IMG0601"} />
        </div>
      </section> : null}

      {/**
       * HOME007
       */}
      {sectionIsEnabled(art) && artCards.length ? <section
        id="home007"
        className="v3-section v3-art home-surface-light"
        {...sectionMotionProps(art, "home007")}
      >
        <header className="v3-section-head" data-home-reveal="editorial" data-home-motion-part style={motionItemStyle(0)}>
          <h2>
            {art.title}
          </h2>

          <div>
            {art.text}
          </div>
        </header>

        <div className="v3-art-strip v3-art-gallery home-mobile-rail" data-home-reveal="editorial-media" tabIndex={artCards.length > 1 ? 0 : undefined} aria-label="KD Coffee 咖啡作品藝廊，可左右滑動瀏覽">
          {artCards.map(
            (c: HomepageContentItem, index: number) => (
              <article
                key={c.id}
                data-home-motion-item
                style={motionItemStyle(index + 1)}
              >
                <Media
                  src={c.image}
                  media={c.media}
                  mediaItems={c.mediaItems}
                  alt={
                    c.alt ||
                    c.title
                  }
                  id={
                    c.imageId
                  }
                />

                <h3>
                  {c.title}
                </h3>

                <p>
                  {c.text}
                </p>
              </article>
            ),
          )}
        </div>
      </section> : null}

      {/**
       * HOME008
       */}
      {sectionIsEnabled(studio) && studioMedia.length ? <section
        id="home008"
        className="v3-section v3-studio home-surface-light"
        {...sectionMotionProps(studio, "home008")}
      >
        <div data-home-reveal="editorial" data-home-motion-part style={motionItemStyle(0)}>
          <h2>
            {studio.title}
          </h2>

          <div>
            {studio.text}
          </div>
        </div>

        <div data-home-reveal="editorial-media" data-home-motion-part style={motionItemStyle(1)}>
          <HomepageStudioGallery items={studioMedia} />
        </div>
      </section> : null}

      {reviews.enabled !== false &&
      (reviews.items || []).filter((review) => review.text?.trim() && review.name?.trim() && review.source?.trim()).length > 0 ? (
        <section
          id="home009"
          className="v3-section v3-reviews home-surface-light"
          {...sectionMotionProps(reviews, "home009")}
        >
          <header className="v3-section-head centered" data-home-motion-part style={motionItemStyle(0)}>
            <h2>
              {reviews.title}
            </h2>

            <div>
              {reviews.intro}
            </div>
          </header>

          <div className="v3-review-grid">
            {(reviews.items || []).filter((review) => review.text?.trim() && review.name?.trim() && review.source?.trim()).map(
              (r: HomepageReviewItem, index: number) => (
                <blockquote
                  key={r.id}
                  data-home-motion-item
                  style={motionItemStyle(index + 1)}
                >
                  <p>
                    「{r.text}」
                  </p>

                  <footer>
                    {r.name}

                    <span>
                      {r.source}
                    </span>
                  </footer>
                </blockquote>
              ),
            )}
          </div>
        </section>
      ) : null}

      {sectionIsEnabled(cta) ? <section
        id="home010"
        className="v3-final home-surface-dark"
        {...sectionMotionProps(cta, "home010")}
      >
        <h2 data-home-reveal="content" data-home-motion-part style={motionItemStyle(0)}>
          {cta.title}
        </h2>

        <div data-home-reveal="content" data-home-motion-part style={motionItemStyle(1)}>
          {cta.text}
        </div>

        {cta.ctaEnabled !== false ? <CmsLink
          className="v3-button light"
          data-home-reveal="media"
          data-home-motion-part
          style={motionItemStyle(2)}
          value={
            cta.href ||
            "/works"
          }
          registry={{ products, pages }}
        >
          {cta.button ||
            "開始挑咖啡"}
        </CmsLink> : null}
      </section> : null}
    </>
  );
}
