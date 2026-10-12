/** Remove only a uniform opaque background connected to the image border.
 * Existing transparency and enclosed details are preserved; no image URL is accepted here.
 */
export function clearLogoBackdrop(rgba: Uint8Array, width: number, height: number) {
  if (rgba.length !== width * height * 4 || width < 2 || height < 2) return rgba;
  const corners = [0, width - 1, width * (height - 1), width * height - 1];
  const reference = Array.from(rgba.slice(0, 4));
  if (reference[3] < 250 || corners.some(p => rgba[p * 4 + 3] < 250
    || [0, 1, 2].some(c => Math.abs(rgba[p * 4 + c] - reference[c]) > 16))) return rgba;
  const visited = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const add = (p: number) => {
    if (visited[p]) return;
    visited[p] = 1;
    if ([0, 1, 2].some(c => Math.abs(rgba[p * 4 + c] - reference[c]) > 28)) return;
    queue[tail++] = p;
  };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++]; rgba[p * 4 + 3] = 0;
    if (p % width) add(p - 1);
    if (p % width < width - 1) add(p + 1);
    if (p >= width) add(p - width);
    if (p < width * (height - 1)) add(p + width);
  }
  return rgba;
}
