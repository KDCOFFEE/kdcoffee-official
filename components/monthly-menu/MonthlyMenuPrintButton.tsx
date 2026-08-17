"use client";

import { useState } from "react";
import styles from "@/app/monthly-menu/monthly-menu.module.css";
import type {
  MonthlyMenuBackground,
  MonthlyMenuBackgroundPosition,
} from "@/lib/monthlyMenuBackground";

type DownloadPurchase = {
  label: string;
  detail: string;
  price: number;
};

export type MonthlyMenuDownloadArtwork = {
  number: string;
  tag?: string;
  availability?: string;
  imageSrc?: string;
  name: string;
  artist: string;
  flavors: string[];
  origin: string;
  process: string;
  roast: string;
  purchases: DownloadPurchase[];
};

type MonthlyMenuDownloadButtonProps = {
  monthKey?: string;
  monthTitle: string;
  monthIssue: string;
  artworks: MonthlyMenuDownloadArtwork[];
  background: MonthlyMenuBackground;
};

type DrawableImage = CanvasImageSource & {
  close?: () => void;
  height: number;
  width: number;
};

type ArtworkLayout = {
  artwork: MonthlyMenuDownloadArtwork;
  flavorLines: string[];
  factLines: string[];
  nameLines: string[];
  purchaseLines: Array<{ labelLines: string[]; price: string }>;
  height: number;
};

const CANVAS_WIDTH = 2160;
const PAGE_MARGIN = 120;
const HEADER_HEIGHT = 560;
const FOOTER_HEIGHT = 150;
const THUMBNAIL_SIZE = 180;

const COLORS = {
  ink: "#231d17",
  muted: "#756b60",
  gold: "#8b7049",
  line: "rgba(54, 43, 31, 0.22)",
  paper: "#f6f0e6",
};

const SANS_FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
const SERIF_FONT = '"Noto Serif TC", "Songti TC", "PMingLiU", serif';

function setFont(
  context: CanvasRenderingContext2D,
  size: number,
  family = SANS_FONT,
  weight = 400,
) {
  context.font = `${weight} ${size}px ${family}`;
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const value = text.trim();
  if (!value) return [];

  const lines: string[] = [];
  let line = "";

  for (const character of value) {
    const candidate = `${line}${character}`;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line.trimEnd());
      line = character.trimStart();
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line.trimEnd());
  return lines;
}

function drawLines(
  context: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
) {
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
}

async function loadDrawableImage(src: string): Promise<DrawableImage> {
  const url = new URL(src, window.location.href);
  const response = await fetch(url.toString(), {
    credentials: url.origin === window.location.origin ? "same-origin" : "omit",
  });

  if (!response.ok) {
    throw new Error(`Unable to load artwork image: ${response.status}`);
  }

  const blob = await response.blob();
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(blob);
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "sync";
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: DrawableImage,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function getAlignment(position: MonthlyMenuBackgroundPosition) {
  if (position === "top-left") return { x: 0, y: 0 };
  if (position === "top-right") return { x: 1, y: 0 };
  if (position === "bottom-left") return { x: 0, y: 1 };
  if (position === "bottom-right") return { x: 1, y: 1 };
  return { x: 0.5, y: 0.5 };
}

function drawBackgroundImage(
  context: CanvasRenderingContext2D,
  image: DrawableImage,
  width: number,
  height: number,
  fit: MonthlyMenuBackground["fit"],
  position: MonthlyMenuBackgroundPosition,
) {
  const alignment = getAlignment(position);
  const scale = fit === "contain"
    ? Math.min(width / image.width, height / image.height)
    : Math.max(width / image.width, height / image.height);

  if (fit === "contain") {
    const destinationWidth = image.width * scale;
    const destinationHeight = image.height * scale;
    const destinationX = (width - destinationWidth) * alignment.x;
    const destinationY = (height - destinationHeight) * alignment.y;
    context.drawImage(image, destinationX, destinationY, destinationWidth, destinationHeight);
    return;
  }

  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) * alignment.x;
  const sourceY = (image.height - sourceHeight) * alignment.y;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function createArtworkLayouts(
  context: CanvasRenderingContext2D,
  artworks: MonthlyMenuDownloadArtwork[],
) {
  return artworks.map((artwork): ArtworkLayout => {
    setFont(context, 48, SERIF_FONT);
    const nameLines = wrapText(context, artwork.name, 390);

    setFont(context, 28);
    const flavorLines = wrapText(context, artwork.flavors.join(" · "), 290);
    const factLines = [artwork.origin, artwork.process, artwork.roast]
      .flatMap((value) => wrapText(context, value, 260));

    setFont(context, 25);
    const purchaseLines = artwork.purchases.map((purchase) => ({
      labelLines: wrapText(
        context,
        `${purchase.label}${purchase.detail ? ` ${purchase.detail}` : ""}`,
        300,
      ),
      price: `NT$ ${purchase.price.toLocaleString("zh-TW")}`,
    }));

    const nameHeight = nameLines.length * 56 + 48;
    const flavorHeight = Math.max(1, flavorLines.length) * 38;
    const factHeight = Math.max(1, factLines.length) * 38;
    const priceHeight = purchaseLines.reduce(
      (total, purchase) => total + Math.max(1, purchase.labelLines.length) * 34 + 14,
      0,
    );
    const contentHeight = Math.max(
      THUMBNAIL_SIZE,
      nameHeight,
      flavorHeight,
      factHeight,
      priceHeight,
    );

    return {
      artwork,
      flavorLines,
      factLines,
      nameLines,
      purchaseLines,
      height: Math.max(260, contentHeight + 80),
    };
  });
}

async function canvasToWebp(canvas: HTMLCanvasElement) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type === "image/webp") {
          resolve(blob);
        } else {
          reject(new Error("WebP encoding is not supported."));
        }
      },
      "image/webp",
      0.88,
    );
  });
}

async function generateMonthlyMenuImage(
  monthTitle: string,
  monthIssue: string,
  artworks: MonthlyMenuDownloadArtwork[],
  background: MonthlyMenuBackground,
) {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");

  const layouts = createArtworkLayouts(context, artworks);
  canvas.height = HEADER_HEIGHT
    + layouts.reduce((total, layout) => total + layout.height, 0)
    + FOOTER_HEIGHT;

  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, canvas.width, canvas.height);

  let backgroundImage: DrawableImage | null = null;
  if (background.image) {
    try {
      backgroundImage = await loadDrawableImage(background.image);
      context.save();
      context.globalAlpha = background.opacity;
      drawBackgroundImage(
        context,
        backgroundImage,
        canvas.width,
        canvas.height,
        background.fit,
        background.position,
      );
      context.restore();
      context.fillStyle = "rgba(246, 240, 230, 0.12)";
      context.fillRect(0, 0, canvas.width, canvas.height);
    } catch (error) {
      console.warn("Monthly menu background could not be loaded; using paper fallback.", error);
    }
  }

  const paperGlow = context.createRadialGradient(360, 180, 20, 360, 180, 760);
  paperGlow.addColorStop(0, "rgba(193, 160, 110, 0.12)");
  paperGlow.addColorStop(1, "rgba(193, 160, 110, 0)");
  context.fillStyle = paperGlow;
  context.fillRect(0, 0, canvas.width, 900);

  context.fillStyle = COLORS.gold;
  setFont(context, 28, SANS_FONT, 700);
  context.fillText("KD COFFEE", PAGE_MARGIN, 118);

  context.fillStyle = COLORS.muted;
  setFont(context, 24, SANS_FONT, 600);
  context.fillText("MONTHLY SELECTION", PAGE_MARGIN, 166);

  context.fillStyle = COLORS.ink;
  setFont(context, 108, SERIF_FONT);
  context.fillText(monthTitle, PAGE_MARGIN, 306);

  context.fillStyle = COLORS.muted;
  setFont(context, 30, SANS_FONT, 600);
  context.fillText(`${monthIssue} · ${artworks.length} 件作品`, PAGE_MARGIN, 372);

  context.strokeStyle = COLORS.ink;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(PAGE_MARGIN, 432);
  context.lineTo(CANVAS_WIDTH - PAGE_MARGIN, 432);
  context.stroke();

  const columns = {
    number: PAGE_MARGIN,
    artwork: 290,
    flavor: 950,
    facts: 1290,
    price: 1610,
  };

  context.fillStyle = COLORS.muted;
  setFont(context, 21, SANS_FONT, 700);
  context.fillText("NO.", columns.number, 492);
  context.fillText("ARTWORK", columns.artwork, 492);
  context.fillText("FLAVOR", columns.flavor, 492);
  context.fillText("ORIGIN / PROCESS / ROAST", columns.facts, 492);
  context.fillText("PRICE", columns.price, 492);

  context.strokeStyle = COLORS.line;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(PAGE_MARGIN, 526);
  context.lineTo(CANVAS_WIDTH - PAGE_MARGIN, 526);
  context.stroke();

  const imageEntries = await Promise.all(
    artworks.map(async (artwork) => ({
      image: artwork.imageSrc
        ? await loadDrawableImage(artwork.imageSrc).catch(() => null)
        : null,
    })),
  );

  let rowY = HEADER_HEIGHT;
  layouts.forEach((layout, index) => {
    const { artwork } = layout;
    const contentY = rowY + 40;
    const image = imageEntries[index]?.image;

    context.fillStyle = COLORS.ink;
    setFont(context, 40, SERIF_FONT);
    context.fillText(artwork.number, columns.number, contentY + 40);

    const badges = [artwork.tag, artwork.availability].filter(Boolean) as string[];
    setFont(context, 21, SANS_FONT, 700);
    badges.forEach((badge, badgeIndex) => {
      const badgeY = contentY + 66 + badgeIndex * 42;
      const badgeWidth = Math.min(140, context.measureText(badge).width + 24);
      context.strokeStyle = "rgba(92, 72, 50, 0.35)";
      context.strokeRect(columns.number, badgeY, badgeWidth, 31);
      context.fillStyle = COLORS.muted;
      context.fillText(badge, columns.number + 12, badgeY + 23);
    });

    context.fillStyle = "#e9ded0";
    context.fillRect(columns.artwork, contentY, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    if (image) {
      drawImageCover(
        context,
        image,
        columns.artwork,
        contentY,
        THUMBNAIL_SIZE,
        THUMBNAIL_SIZE,
      );
    } else {
      context.fillStyle = COLORS.gold;
      setFont(context, 46, SERIF_FONT);
      context.fillText("KD", columns.artwork + 55, contentY + 108);
    }

    context.fillStyle = COLORS.ink;
    setFont(context, 48, SERIF_FONT);
    drawLines(context, layout.nameLines, 500, contentY + 48, 56);
    context.fillStyle = COLORS.gold;
    setFont(context, 24, SANS_FONT, 700);
    context.fillText(
      artwork.artist,
      500,
      contentY + layout.nameLines.length * 56 + 38,
    );

    context.fillStyle = COLORS.ink;
    setFont(context, 28);
    drawLines(context, layout.flavorLines, columns.flavor, contentY + 34, 38);
    drawLines(context, layout.factLines, columns.facts, contentY + 34, 38);

    let purchaseY = contentY + 32;
    layout.purchaseLines.forEach((purchase) => {
      context.fillStyle = COLORS.muted;
      setFont(context, 25);
      drawLines(context, purchase.labelLines, columns.price, purchaseY, 34);
      context.fillStyle = COLORS.ink;
      setFont(context, 30, SANS_FONT, 700);
      context.textAlign = "right";
      context.fillText(purchase.price, CANVAS_WIDTH - PAGE_MARGIN, purchaseY);
      context.textAlign = "left";
      purchaseY += Math.max(1, purchase.labelLines.length) * 34 + 14;
    });

    rowY += layout.height;
    context.strokeStyle = COLORS.line;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(PAGE_MARGIN, rowY);
    context.lineTo(CANVAS_WIDTH - PAGE_MARGIN, rowY);
    context.stroke();
  });

  imageEntries.forEach(({ image }) => image?.close?.());
  backgroundImage?.close?.();

  context.fillStyle = COLORS.gold;
  setFont(context, 25, SANS_FONT, 700);
  context.fillText("KD COFFEE · 1962", PAGE_MARGIN, canvas.height - 72);
  context.fillStyle = COLORS.muted;
  context.textAlign = "right";
  context.fillText(
    "www.kdcoffee1962.com",
    CANVAS_WIDTH - PAGE_MARGIN,
    canvas.height - 72,
  );
  context.textAlign = "left";

  return {
    blob: await canvasToWebp(canvas),
    height: canvas.height,
    width: canvas.width,
  };
}

export default function MonthlyMenuPrintButton({
  monthKey,
  monthTitle,
  monthIssue,
  artworks,
  background,
}: MonthlyMenuDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const downloadImage = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setError("");
    setResult("");

    try {
      const { blob, height, width } = await generateMonthlyMenuImage(
        monthTitle,
        monthIssue,
        artworks,
        background,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filenameMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey || "")
        ? monthKey
        : "Current";
      link.href = objectUrl;
      link.download = `KD-Coffee-Monthly-Menu-${filenameMonth}.webp`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setResult(
        `豆單圖片已下載（${width} × ${height}px，${Math.round(blob.size / 1024)} KB）`,
      );
    } catch (downloadError) {
      console.error("Monthly menu image generation failed.", downloadError);
      setError("豆單圖片產生失敗，請稍後再試。");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={styles.downloadControl}>
      <button
        type="button"
        disabled={isGenerating}
        aria-busy={isGenerating}
        onClick={downloadImage}
      >
        {isGenerating ? "產生豆單中…" : "下載豆單圖片"}
      </button>
      {error ? (
        <span className={styles.downloadError} role="alert">
          {error}
        </span>
      ) : null}
      {result ? (
        <span className={styles.downloadResult} role="status">
          {result}
        </span>
      ) : null}
    </div>
  );
}
