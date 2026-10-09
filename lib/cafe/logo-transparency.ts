/** Remove only a uniform background connected to the image border. Existing
 * alpha and uncertain photographic backgrounds are preserved without changes. */
export function clearUniformLogoBackground(pixels: Uint8ClampedArray, width: number, height: number) {
  if (width < 3 || height < 3 || pixels.length !== width * height * 4) return false;
  const count = width * height;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 250) return false;
  const background = [pixels[0], pixels[1], pixels[2]];
  const distance = (index: number) => Math.max(Math.abs(pixels[index * 4] - background[0]),
    Math.abs(pixels[index * 4 + 1] - background[1]), Math.abs(pixels[index * 4 + 2] - background[2]));
  const corners = [0, width - 1, count - width, count - 1];
  if (corners.some((index) => distance(index) > 10)) return false;
  const borders: number[] = [];
  for (let x = 0; x < width; x++) borders.push(x, count - width + x);
  for (let y = 1; y < height - 1; y++) borders.push(y * width, y * width + width - 1);
  if (borders.filter((index) => distance(index) <= 16).length / borders.length < 0.95) return false;
  const visited = new Uint8Array(count);
  const queue = new Uint32Array(count);
  let head = 0, tail = 0;
  const add = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    if (distance(index) <= 24) queue[tail++] = index;
  };
  borders.forEach(add);
  while (head < tail) {
    const index = queue[head++];
    if (index % width > 0) add(index - 1);
    if (index % width < width - 1) add(index + 1);
    if (index >= width) add(index - width);
    if (index < count - width) add(index + width);
  }
  // A blank image or near-uniform mark is not safe to cut out.
  if (tail < count * 0.03 || tail > count * 0.98) return false;
  for (let i = 0; i < tail; i++) pixels[queue[i] * 4 + 3] = 0;
  return true;
}
