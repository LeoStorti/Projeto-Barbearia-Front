export interface ThemePalette {
  primary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
}

// Wrapped document usage in browser check
function readVar(name: string, fallback: string): string {
  try {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const style = getComputedStyle(document.documentElement);
      const value = style.getPropertyValue(name).trim();
      return value || fallback;
    }
  } catch {
    return fallback;
  }
  return fallback; // Ensure fallback is returned
}

function normalizeHex(input: string): string {
  const value = String(input || '').trim();
  if (!value.startsWith('#')) return '';
  const hex = value.slice(1);
  if (hex.length === 3) {
    return (
      '#' +
      hex
        .split('')
        .map(ch => ch + ch)
        .join('')
    ).toLowerCase();
  }
  if (hex.length === 6) return ('#' + hex).toLowerCase();
  return '';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = normalizeHex(hex);
  if (!h) return null;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return null;
  return { r, g, b };
}

function mixHex(foreground: string, background: string, foregroundWeight: number): string {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) return normalizeHex(foreground) || foreground;

  const w = Math.min(1, Math.max(0, foregroundWeight));
  const r = Math.round(fg.r * w + bg.r * (1 - w));
  const g = Math.round(fg.g * w + bg.g * (1 - w));
  const b = Math.round(fg.b * w + bg.b * (1 - w));
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`;
}

function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  const a = Math.min(1, Math.max(0, alpha));
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

export function getThemePalette(): ThemePalette {
  return {
    primary: readVar('--primary-color', '#d6ff00'),
    accent: readVar('--accent-color', '#9aff00'),
    success: readVar('--success-color', '#10b981'),
    warning: readVar('--warning-color', '#f59e0b'),
    error: readVar('--error-color', '#ef4444')
  };
}

export function chartPalette(): string[] {
  const p = getThemePalette();
  const bg = readVar('--background-color', '#0b0f0d');

  // Mistura com o fundo para reduzir o "neon" (principalmente no tema escuro)
  const primary = mixHex(p.primary, bg, 0.35);
  const accent = mixHex(p.accent, bg, 0.32);

  return [primary, accent, p.success, p.warning, p.error];
}

export function buildLineDataset(label: string, data: number[]) {
  const p = getThemePalette();
  const bg = readVar('--background-color', '#0b0f0d');
  const line = mixHex(p.primary, bg, 0.35);
  return {
    label,
    data,
    borderColor: line,
    backgroundColor: rgbaFromHex(line, 0.10),
    tension: 0.4,
    fill: true,
    borderWidth: 2
  };
}

export function barColor(): string {
  const p = getThemePalette();
  const bg = readVar('--background-color', '#0b0f0d');
  return mixHex(p.primary, bg, 0.35);
}
