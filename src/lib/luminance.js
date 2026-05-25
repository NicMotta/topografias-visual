export const LUMINANCE_COEFFS = { r: 0.2126, g: 0.7152, b: 0.0722 }

export function luminance(r, g, b) {
  return LUMINANCE_COEFFS.r * r + LUMINANCE_COEFFS.g * g + LUMINANCE_COEFFS.b * b
}

export function luminanceFromPixel(data, idx) {
  const r = data[idx] / 255
  const g = data[idx + 1] / 255
  const b = data[idx + 2] / 255
  return luminance(r, g, b)
}
