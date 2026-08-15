function toHex([r, g, b]) {
  const to2 = (v) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export function extractPalette(imageData, count = 3) {
  const { width, height, data } = imageData;
  const maxSamples = 6000;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / maxSamples)));

  const pixels = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      pixels.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  }

  const k = Math.min(count, pixels.length);
  if (!k) return [];

  const centroids = [];
  for (let i = 0; i < k; i++) {
    const index = k === 1 ? 0 : Math.floor((i * (pixels.length - 1)) / (k - 1));
    centroids.push([...pixels[index]]);
  }

  const assignments = new Uint16Array(pixels.length);
  let counts = new Uint32Array(k);
  for (let iter = 0; iter < 10; iter++) {
    for (let i = 0; i < pixels.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const dx = pixels[i][0] - centroids[c][0];
        const dy = pixels[i][1] - centroids[c][1];
        const dz = pixels[i][2] - centroids[c][2];
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      assignments[i] = best;
    }

    const sums = centroids.map(() => [0, 0, 0]);
    counts = new Uint32Array(k);
    for (let i = 0; i < pixels.length; i++) {
      const a = assignments[i];
      sums[a][0] += pixels[i][0];
      sums[a][1] += pixels[i][1];
      sums[a][2] += pixels[i][2];
      counts[a]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c]) {
        centroids[c][0] = sums[c][0] / counts[c];
        centroids[c][1] = sums[c][1] / counts[c];
        centroids[c][2] = sums[c][2] / counts[c];
      }
    }
  }

  const order = [...Array(k).keys()].sort((a, b) => counts[b] - counts[a]);
  return order.map((c) => toHex(centroids[c]));
}
