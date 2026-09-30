import { PNG } from "pngjs";
/** Chromium's native rounded borders can differ by 1–2 channel units in fresh render contexts. */
export function compareCatalog(actual: Buffer, reference: Buffer) {
  const a = PNG.sync.read(actual),
    b = PNG.sync.read(reference);
  if (a.width !== b.width || a.height !== b.height)
    throw new Error("Reference dimensions differ");
  const diff = new PNG({ width: a.width, height: a.height });
  let pixels = 0,
    maxChannelDelta = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(
        a.data[offset + channel]! - b.data[offset + channel]!,
      );
      maxChannelDelta = Math.max(delta, maxChannelDelta);
      changed ||= delta !== 0;
    }
    if (changed) {
      pixels++;
      diff.data[offset] = 255;
      diff.data[offset + 3] = 255;
    }
  }
  return { pixels, maxChannelDelta, diff: PNG.sync.write(diff) };
}
