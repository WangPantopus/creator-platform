// Puts the iOS and Android screenshots of one scenario side by side, scaled
// down, so a pull request can carry one small picture per decision.
//   node tests/scenarios/lane-7/side-by-side.mjs ios.png android.png out.png [height]
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const { PNG } = createRequire(
  new URL("../../../package.json", import.meta.url),
)("pngjs");
const [iosFile, androidFile, outFile, heightArg] = process.argv.slice(2);
if (!outFile) {
  console.error("Usage: side-by-side.mjs ios.png android.png out.png [height]");
  process.exit(64);
}
const height = Number(heightArg ?? 800);

/** Box-filter downscale to the given height. */
function scaled(file) {
  const source = PNG.sync.read(readFileSync(file));
  const width = Math.round((source.width * height) / source.height);
  const out = new PNG({ width, height });
  const ratio = source.height / height;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const sums = [0, 0, 0, 0];
      let n = 0;
      for (
        let sy = Math.floor(y * ratio);
        sy < Math.min(source.height, Math.ceil((y + 1) * ratio));
        sy += 1
      )
        for (
          let sx = Math.floor(x * ratio);
          sx < Math.min(source.width, Math.ceil((x + 1) * ratio));
          sx += 1
        ) {
          const at = (sy * source.width + sx) * 4;
          for (let c = 0; c < 4; c += 1) sums[c] += source.data[at + c];
          n += 1;
        }
      const at = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1) out.data[at + c] = Math.round(sums[c] / n);
    }
  return out;
}

const left = scaled(iosFile);
const right = scaled(androidFile);
const gap = 12;
const page = new PNG({ width: left.width + gap + right.width, height });
page.data.fill(255);
for (const [image, offset] of [
  [left, 0],
  [right, left.width + gap],
])
  for (let y = 0; y < height; y += 1)
    image.data.copy(
      page.data,
      (y * page.width + offset) * 4,
      y * image.width * 4,
      (y + 1) * image.width * 4,
    );
writeFileSync(outFile, PNG.sync.write(page, { colorType: 2, deflateLevel: 9 }));
console.log(`${outFile}: ${page.width}x${page.height}`);
