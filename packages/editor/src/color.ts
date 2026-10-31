export type HSV = { h: number; s: number; v: number };
export type RGB = [number, number, number];
export const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
export function normalizeHex(text: string): string | null {
  const value = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value))
    return (
      "#" +
      value
        .split("")
        .map((c) => c + c)
        .join("")
        .toLowerCase()
    );
  return /^[0-9a-f]{6}$/i.test(value) ? "#" + value.toLowerCase() : null;
}
export function hexToRgb(hex: string): RGB {
  const normalized = normalizeHex(hex);
  if (!normalized) throw Error("Invalid hex color");
  return [1, 3, 5].map((i) => parseInt(normalized.slice(i, i + 2), 16)) as RGB;
}
export function rgbToHex(rgb: RGB) {
  return (
    "#" +
    rgb
      .map((n) =>
        Math.round(clamp(n, 0, 255))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function rgbToHsv([r0, g0, b0]: RGB): HSV {
  const [r, g, b] = [r0, g0, b0].map((n) => n / 255),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
export function hsvToRgb({ h, s, v }: HSV): RGB {
  h = ((h % 360) + 360) % 360;
  s = clamp(s);
  v = clamp(v);
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  const a =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return a.map((n) => Math.round((n + m) * 255)) as RGB;
}
export interface PickerBounds {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}
export function pickerBounds(
  anchor: { right: number; top: number; bottom: number },
  viewport: { width: number; height: number },
  height: number,
): PickerBounds {
  const margin = 8,
    width = Math.min(304, Math.max(0, viewport.width - 16)),
    maxHeight = Math.max(0, viewport.height - 16),
    actualHeight = Math.min(height, maxHeight);
  const below = anchor.bottom + 8,
    above = anchor.top - actualHeight - 8;
  return {
    left: Math.max(margin, Math.min(anchor.right - width, viewport.width - width - margin)),
    top: Math.max(
      margin,
      Math.min(
        below + actualHeight <= viewport.height - margin ? below : above,
        viewport.height - actualHeight - margin,
      ),
    ),
    width,
    maxHeight,
  };
}
