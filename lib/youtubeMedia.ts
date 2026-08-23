export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const YOUTU_BE_HOSTS = new Set(["youtu.be", "www.youtu.be"]);

export class YouTubeUrlValidationError extends Error {
  constructor(message = "YouTube 影片網址格式不正確。") {
    super(message);
    this.name = "YouTubeUrlValidationError";
  }
}

export function normalizeYouTubeVideoId(value: unknown) {
  if (typeof value !== "string") throw new YouTubeUrlValidationError("YouTube 影片 ID 格式不正確。");
  const videoId = value.trim();
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) throw new YouTubeUrlValidationError("YouTube 影片 ID 格式不正確。");
  return videoId;
}

export function parseYouTubeUrl(value: unknown) {
  if (typeof value !== "string") throw new YouTubeUrlValidationError();
  const input = value.trim();
  if (!input || /[<>]/u.test(input)) throw new YouTubeUrlValidationError();
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new YouTubeUrlValidationError();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new YouTubeUrlValidationError();
  const host = url.hostname.toLowerCase();
  let candidate = "";
  if (YOUTU_BE_HOSTS.has(host)) {
    candidate = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (YOUTUBE_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch" || url.pathname === "/watch/") candidate = url.searchParams.get("v") || "";
    else if (segments[0] === "shorts" || segments[0] === "embed") candidate = segments[1] || "";
  } else {
    throw new YouTubeUrlValidationError("只接受 YouTube 影片網址。");
  }
  return normalizeYouTubeVideoId(candidate);
}

export function youtubeEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${normalizeYouTubeVideoId(videoId)}`;
}

export function youtubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${normalizeYouTubeVideoId(videoId)}`;
}
