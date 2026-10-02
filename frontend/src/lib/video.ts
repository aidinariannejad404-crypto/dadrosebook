/**
 * Turn a public video page URL into an embeddable player URL.
 * Supports Aparat (/v/<hash>), YouTube (watch / youtu.be) and direct video files.
 */
export type VideoEmbed =
  | { kind: "iframe"; src: string }
  | { kind: "file"; src: string }
  | { kind: "link"; src: string };

export function videoEmbed(url: string): VideoEmbed {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: "link", src: url };
  }
  const host = u.hostname.replace(/^www\./, "");
  if (/\.(mp4|webm|m3u8)$/i.test(u.pathname)) return { kind: "file", src: url };
  if (host === "aparat.com") {
    const m = /^\/v\/([^/]+)/.exec(u.pathname);
    if (m) return { kind: "iframe", src: `https://www.aparat.com/video/video/embed/videohash/${m[1]}/vt/frame?autoplay=true` };
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` };
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` };
  }
  return { kind: "link", src: url };
}
