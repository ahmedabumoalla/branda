/** Single-colour stamp mask for any brand logo.
 *
 * A plain silhouette turns a badge (a filled shape with lettering inside) into a
 * solid blob, and an image without transparency into a solid rectangle. This
 * keeps the silhouette whenever it is already faithful and otherwise opens the
 * enclosed tone, so the mark stays readable in whatever colour the stamp uses.
 * Returns one opacity value per pixel; the caller supplies the colour. */
export function logoStencilMask(pixels: Uint8ClampedArray, width: number, height: number) {
  const count = width * height;
  const mask = new Uint8ClampedArray(count);
  if (width < 1 || height < 1 || pixels.length !== count * 4) return mask;
  for (let i = 0; i < count; i++) mask[i] = pixels[i * 4 + 3];

  const luma = new Uint8Array(count);
  const histogram = new Float64Array(256);
  let visible = 0, weight = 0, left = width, top = height, right = 0, bottom = 0;
  for (let i = 0; i < count; i++) {
    const alpha = pixels[i * 4 + 3];
    luma[i] = Math.round(pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114);
    if (alpha < 128) continue;
    visible++;
    const x = i % width, y = (i - x) / width;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    histogram[luma[i]] += alpha;
    weight += alpha;
  }
  if (visible < 16) return mask;

  // Otsu split of the visible tones into a dark and a light group.
  let total = 0;
  for (let level = 0; level < 256; level++) total += level * histogram[level];
  let best = -1, threshold = 127, darkWeight = 0, darkSum = 0;
  for (let level = 0, below = 0, sum = 0; level < 255; level++) {
    below += histogram[level];
    sum += level * histogram[level];
    if (!below || below === weight) continue;
    const gap = sum / below - (total - sum) / (weight - below);
    const variance = below * (weight - below) * gap * gap;
    if (variance > best) { best = variance; threshold = level; darkWeight = below; darkSum = sum; }
  }
  if (best < 0) return mask;
  const darkMean = darkSum / darkWeight, lightMean = (total - darkSum) / (weight - darkWeight);
  // One tone, or a negligible second tone: the silhouette is already the mark.
  if (lightMean - darkMean < 60 || Math.min(darkWeight, weight - darkWeight) / weight < 0.015) return mask;

  // Depth of each visible pixel from the outside of the mark, a few pixels deep.
  const depth = new Uint8Array(count);
  let frontier: number[] = [];
  const solid = (index: number) => pixels[index * 4 + 3] >= 128;
  for (let i = 0; i < count; i++) {
    if (!solid(i)) continue;
    const x = i % width;
    const exposed = x === 0 || x === width - 1 || i < width || i >= count - width
      || !solid(i - 1) || !solid(i + 1) || !solid(i - width) || !solid(i + width);
    if (exposed) { depth[i] = 1; frontier.push(i); }
  }
  const outline = frontier.length;
  // Places where the two tones meet inside the mark, read two pixels apart to step over soft edges.
  let contact = 0;
  for (let i = 0; i < count; i++) {
    if (!solid(i)) continue;
    for (const near of [i % width + 2 < width ? i + 2 : -1, i + width * 2]) {
      if (near < 0 || near >= count || !solid(near)) continue;
      if ((luma[i] <= threshold) !== (luma[near] <= threshold) && Math.abs(luma[i] - luma[near]) >= 64) contact++;
    }
  }
  // Sample just inside the edge: the outermost pixels of a cut-out mark are a blended fringe.
  const inner = Math.max(3, Math.round(Math.min(width, height) / 96));
  let rimDark = 0, rimLight = 0;
  for (let level = 2; level <= inner + 2 && frontier.length; level++) {
    const next: number[] = [];
    for (const index of frontier) {
      const x = index % width;
      for (const near of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width]) {
        if (near < 0 || near >= count || depth[near] || !solid(near)) continue;
        depth[near] = level;
        next.push(near);
        if (level >= inner) { if (luma[near] <= threshold) rimDark++; else rimLight++; }
      }
    }
    frontier = next;
  }
  const rim = rimDark + rimLight;
  // Strokes too thin to have an inside keep their silhouette.
  if (rim < Math.max(12, visible * 0.004)) return mask;

  // A rectangular plate, whether it fills the file or sits inside transparent margins.
  const plate = visible / ((right - left + 1) * (bottom - top + 1)) > 0.93;
  const darkShare = rimDark / rim;
  let inkIsDark: boolean;
  if (plate) {
    // The tone along the frame is only a backdrop: keep what is drawn on it.
    inkIsDark = darkShare < 0.5;
  } else if (darkShare < 0.05) {
    inkIsDark = false; // dark details sit inside a light shape
  } else if (darkShare > 0.95) {
    inkIsDark = true; // light details sit inside a dark shape
  } else if (contact >= outline * 1.2) {
    // An illustrated emblem: most of its drawing is inside, so a silhouette would be a blob.
    inkIsDark = darkShare >= 0.5;
  } else {
    return mask; // both tones reach the outline: separate elements, keep them all
  }

  const ink = inkIsDark ? darkMean : lightMean, clear = inkIsDark ? lightMean : darkMean;
  const stencil = new Uint8ClampedArray(count);
  let kept = 0;
  for (let i = 0; i < count; i++) {
    if (!mask[i]) continue;
    const position = (luma[i] - clear) / (ink - clear);
    const opacity = Math.min(1, Math.max(0, (position - 0.25) / 0.5));
    stencil[i] = Math.round(mask[i] * opacity);
    kept += stencil[i];
  }
  // Never hand back a mark that all but vanished.
  return kept < weight * 0.04 ? mask : stencil;
}
