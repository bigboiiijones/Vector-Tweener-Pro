export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const parseColor = (value?: string, fallback = '#000000'): RGBAColor => {
  const input = (value || fallback).trim();

  if (input.startsWith('#')) {
    const hex = input.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  const rgbMatch = input.match(/^rgba?\((.+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map(s => s.trim());
    if (parts.length >= 3) {
      const r = Number(parts[0]);
      const g = Number(parts[1]);
      const b = Number(parts[2]);
      const a = parts.length >= 4 ? Number(parts[3]) : 1;
      if ([r, g, b, a].every(n => Number.isFinite(n))) {
        return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp01(a) };
      }
    }
  }

  return parseColor(fallback, '#000000');
};

export const toCssColor = (color: RGBAColor): string => {
  const a = clamp01(color.a);
  if (a >= 0.999) {
    return `#${clamp255(color.r).toString(16).padStart(2, '0')}${clamp255(color.g).toString(16).padStart(2, '0')}${clamp255(color.b).toString(16).padStart(2, '0')}`;
  }
  return `rgba(${clamp255(color.r)}, ${clamp255(color.g)}, ${clamp255(color.b)}, ${a.toFixed(3)})`;
};

export const tweenColor = (from?: string, to?: string, t = 0): string => {
  const a = parseColor(from, '#000000');
  const b = parseColor(to, from || '#000000');

  return toCssColor({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t
  });
};
