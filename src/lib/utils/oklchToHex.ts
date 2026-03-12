/**
 * Convert an OKLCh CSS color string to a hex color code.
 *
 * Pipeline: OKLCh → OKLab → LMS (cubed) → linear sRGB → gamma sRGB → hex
 * Uses Björn Ottosson's published matrices.
 */
export function oklchToHex(oklchString: string): string {
  const match = oklchString.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/
  );
  if (!match) return '#000000';

  const L = parseFloat(match[1]);
  const C = parseFloat(match[2]);
  const H = parseFloat(match[3]);

  // OKLCh → OKLab (polar → cartesian)
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab → LMS (approximate cube roots)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  // Linear sRGB → gamma sRGB
  const gamma = (c: number) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

  const r = Math.round(Math.min(1, Math.max(0, gamma(lr))) * 255);
  const g = Math.round(Math.min(1, Math.max(0, gamma(lg))) * 255);
  const bVal = Math.round(Math.min(1, Math.max(0, gamma(lb))) * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bVal.toString(16).padStart(2, '0')}`;
}
