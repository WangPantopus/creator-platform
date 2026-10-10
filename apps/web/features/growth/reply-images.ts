import { copy, formatCopy } from "@qelvora/copy";
import { themes } from "@qelvora/tokens";
import { Zip, ZipPassThrough } from "fflate";
import type { ReplyExport } from "./reply-export";

const width = 1080,
  height = 1440,
  padding = 80;
const contentWidth = width - padding * 2;
const byteLimit = 128 * 1024 * 1024;
const pageLimit = 8192;
let rendering = false;

export function abortable<T>(
  value: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    value
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}

interface Line {
  text: string;
  direction: "ltr" | "rtl";
  font: string;
  inset: number;
  ascent: number;
  height: number;
}

/** Browser-local Unicode/font fallback; no reply text is sent to font/CDN services. */
export async function replyImages(
  source: ReplyExport,
  signal: AbortSignal,
  progress: (page: number) => void,
) {
  if (rendering) throw new Error(copy.growthReplyImageExportFailed);
  rendering = true;
  const canvas = document.createElement("canvas");
  // A real dir=auto element lets the browser determine each paragraph's bidi
  // direction, including scripts and controls that a hand-written regex misses.
  const direction = document.createElement("span");
  direction.dir = "auto";
  direction.style.cssText =
    "position:fixed;left:-100000px;top:0;white-space:pre;visibility:hidden;pointer-events:none";
  direction.setAttribute("aria-hidden", "true");
  document.body.append(direction);
  let zip: Zip | null = null;
  const chunks: Blob[] = [];
  try {
    signal.throwIfAborted();
    await abortable(
      Promise.all([
        document.fonts.load("400 40px Newsreader"),
        document.fonts.load("600 32px Geist"),
        document.fonts.load("400 24px Geist"),
      ]),
      signal,
    );
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error(copy.growthReplyImageExportFailed);
    const ctx = context;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const words = new Intl.Segmenter(undefined, { granularity: "word" });
    const graphemes = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });

    function* lines(
      text: string,
      font: string,
      minimumHeight: number,
    ): Generator<Line> {
      ctx.font = font;
      // Normalize only visual line endings/tabs; the text file remains byte
      // complete. Never split a grapheme or shrink text to fit a fixed card.
      for (const paragraph of text.replace(/\r\n?/gu, "\n").split("\n")) {
        signal.throwIfAborted();
        direction.textContent = paragraph;
        const dir =
          getComputedStyle(direction).direction === "rtl" ? "rtl" : "ltr";
        ctx.direction = dir;
        const measure = (value: string) => {
          // Rendering a preceding page changes the shared canvas font. Resume
          // this lazy layout with its own exact font and paragraph direction.
          ctx.font = font;
          ctx.direction = dir;
          const m = ctx.measureText(value);
          const inset = Math.max(0, m.actualBoundingBoxLeft);
          return {
            m,
            inset,
            width: inset + Math.max(m.width, m.actualBoundingBoxRight),
          };
        };
        const line = (value: string): Line => {
          const { m, inset, width: measured } = measure(value);
          const ascent = Math.max(
            0,
            m.actualBoundingBoxAscent,
            m.fontBoundingBoxAscent,
          );
          const descent = Math.max(
            0,
            m.actualBoundingBoxDescent,
            m.fontBoundingBoxDescent,
          );
          if (
            !Number.isFinite(measured + ascent + descent) ||
            measured > contentWidth
          )
            throw new Error(copy.growthReplyImageExportFailed);
          return {
            text: value,
            font,
            direction: dir,
            inset,
            ascent: ascent + 4,
            height: Math.max(minimumHeight, ascent + descent + 8),
          };
        };
        let current = "";
        for (const part of words.segment(paragraph.replace(/\t/gu, "    "))) {
          signal.throwIfAborted();
          // Avoid shaping a pathological 100k-character unbroken word in one
          // operation. Oversized words/URLs wrap on complete graphemes.
          if (
            part.segment.length <= 2048 &&
            measure(current + part.segment).width <= contentWidth
          ) {
            current += part.segment;
            continue;
          }
          if (current) {
            yield line(current);
            current = "";
          }
          if (
            part.segment.length <= 2048 &&
            measure(part.segment).width <= contentWidth
          ) {
            current = part.segment;
            continue;
          }
          for (const grapheme of graphemes.segment(part.segment)) {
            signal.throwIfAborted();
            if (
              current &&
              measure(current + grapheme.segment).width > contentWidth
            ) {
              yield line(current);
              current = "";
            }
            current += grapheme.segment;
            if (measure(current).width > contentWidth)
              throw new Error(copy.growthReplyImageExportFailed);
          }
        }
        yield line(current);
      }
    }
    const header = [
      ...lines(
        source.authorLabel,
        '600 32px Geist, "Helvetica Neue", Arial, sans-serif',
        46,
      ),
    ];
    const footer = [
      ...lines(
        formatCopy("growthVerifyThisImmutableVersion", {
          value1: source.version,
          value2: source.verificationURL,
        }),
        '400 24px Geist, "Helvetica Neue", Arial, sans-serif',
        36,
      ),
    ];
    const headerHeight = header.reduce((total, line) => total + line.height, 0);
    const footerHeight = footer.reduce((total, line) => total + line.height, 0);
    const bodyTop = padding + headerHeight + 32;
    const bodyBottom = height - padding - footerHeight - 76;
    if (bodyBottom - bodyTop < 96)
      throw new Error(copy.growthReplyImageExportFailed);
    const body = lines(
      source.text,
      '400 40px Newsreader, Georgia, "Times New Roman", serif',
      60,
    );
    let next = body.next();
    let pages = 0,
      first: Blob | null = null,
      bytes = 0,
      complete = false;
    let zipError: Error | null = null;
    const add = (name: string, data: Uint8Array) => {
      signal.throwIfAborted();
      if (!zip) throw new Error(copy.growthReplyImageExportFailed);
      const file = new ZipPassThrough(name);
      zip.add(file);
      file.push(data, true);
      if (zipError) throw zipError;
    };
    const encode = () =>
      abortable(
        new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error(copy.growthReplyImageExportFailed)),
            "image/png",
          );
        }),
        signal,
      );
    const draw = (values: Line[], top: number) => {
      for (const line of values) {
        ctx.font = line.font;
        ctx.direction = line.direction;
        ctx.fillText(line.text, padding + line.inset, top + line.ascent);
        top += line.height;
      }
    };
    while (!next.done) {
      signal.throwIfAborted();
      if (++pages > pageLimit)
        throw new Error(copy.growthReplyImageExportFailed);
      const page: Line[] = [];
      let used = 0;
      while (!next.done && used + next.value.height <= bodyBottom - bodyTop) {
        page.push(next.value);
        used += next.value.height;
        next = body.next();
      }
      if (!page.length) throw new Error(copy.growthReplyImageExportFailed);
      ctx.fillStyle = themes.light["maya-surface"];
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = themes.light["on-maya"];
      draw(header, padding);
      draw(page, bodyTop);
      draw(footer, height - padding - footerHeight - 40);
      draw(
        [
          ...lines(
            formatCopy("growthReplyImagePage", { page: pages }),
            '400 24px Geist, "Helvetica Neue", Arial, sans-serif',
            36,
          ),
        ],
        height - padding - 36,
      );
      const png = await encode();
      signal.throwIfAborted();
      if (png.size > byteLimit)
        throw new Error(copy.growthReplyImageExportFailed);
      if (pages === 1) first = png;
      else {
        if (!zip) {
          zip = new Zip((error, data, final) => {
            if (error) {
              zipError = error;
              return;
            }
            bytes += data.byteLength;
            if (bytes > byteLimit) {
              zipError = new Error(copy.growthReplyImageExportFailed);
              return;
            }
            chunks.push(new Blob([new Uint8Array(data).buffer]));
            complete = final;
          });
          add(
            "reply-0001.png",
            new Uint8Array(await abortable(first!.arrayBuffer(), signal)),
          );
          first = null;
        }
        add(
          `reply-${String(pages).padStart(4, "0")}.png`,
          new Uint8Array(await abortable(png.arrayBuffer(), signal)),
        );
      }
      progress(pages);
      // Yield after every page so cancellation/navigation and accessible
      // progress updates do not wait for the entire reply to render.
      await abortable(
        new Promise<void>((resolve) => setTimeout(resolve, 0)),
        signal,
      );
    }
    signal.throwIfAborted();
    if (!zip && first)
      return {
        blob: first,
        filename: `reply-${source.id}-v${source.version}.png`,
      };
    if (!zip) throw new Error(copy.growthReplyImageExportFailed);
    add("reply.txt", new TextEncoder().encode(source.text));
    add(
      "verification.json",
      new TextEncoder().encode(
        JSON.stringify(
          {
            id: source.id,
            version: source.version,
            sourceHash: source.sourceHash,
            authorLabel: source.authorLabel,
            authorKind: source.authorKind,
            verificationURL: source.verificationURL,
            pages,
          },
          null,
          2,
        ),
      ),
    );
    zip.end();
    if (zipError || !complete)
      throw zipError ?? new Error(copy.growthReplyImageExportFailed);
    signal.throwIfAborted();
    return {
      blob: new Blob(chunks, { type: "application/zip" }),
      filename: `reply-${source.id}-v${source.version}.zip`,
    };
  } finally {
    zip?.terminate();
    chunks.length = 0;
    direction.textContent = "";
    direction.remove();
    canvas.width = 0;
    canvas.height = 0;
    rendering = false;
  }
}
