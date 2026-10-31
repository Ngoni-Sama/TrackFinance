import { useColorScheme } from 'react-native';
import { useSettingsStore } from './settingsStore';

/**
 * Visual language borrowed from pc_info (lecui): Segoe-style type scale
 * (title 12 / highlight 14 / detail 10 / caption 8, scaled up for phones),
 * grey uppercase captions, a 10pt margin grid, and green/red ok/not-ok states.
 */
export const fontSize = {
  title: 17,
  highlight: 24,
  detail: 15,
  caption: 11,
  suffix: 12, // the small "<span 8pt>" suffix after a highlight value
};

export const margin = 10;
export const radius = 8;

export interface Palette {
  background: string;
  pane: string;
  paneBorder: string;
  text: string;
  caption: string;
  accent: string;
  progressEmpty: string;
  ok: string;
  notOk: string;
  warn: string;
  separator: string;
  inputBackground: string;
}

const light: Palette = {
  background: '#F0F0F0',
  pane: '#FFFFFF',
  paneBorder: '#E1E1E1',
  text: '#202020',
  caption: '#808080',
  accent: '#0078AA',
  progressEmpty: '#DCDCDC',
  ok: '#009600',
  notOk: '#C80000',
  warn: '#C87800',
  separator: '#C8C8C8',
  inputBackground: '#FAFAFA',
};

const dark: Palette = {
  background: '#1E1E1E',
  pane: '#2B2B2B',
  paneBorder: '#3A3A3A',
  text: '#EBEBEB',
  caption: '#9A9A9A',
  accent: '#2E9BD6',
  progressEmpty: '#474747',
  ok: '#3CB43C',
  notOk: '#E05050',
  warn: '#E0A030',
  separator: '#4A4A4A',
  inputBackground: '#333333',
};

export function useTheme(): Palette {
  const system = useColorScheme();
  const mode = useSettingsStore((s) => s.themeMode);
  const resolved = mode === 'system' ? system ?? 'light' : mode;
  return resolved === 'dark' ? dark : light;
}

export const palettes = { light, dark };

/** Distinct series colours for category charts, readable on both themes. */
export const CATEGORY_COLORS: Record<string, string> = {
  food: '#E8833A',
  transport: '#3A8FE8',
  airtime: '#9B59B6',
  utilities: '#16A085',
  rent: '#C0392B',
  loan_repayment: '#D35400',
  savings: '#27AE60',
  health: '#E84A8F',
  education: '#2C7FB8',
  entertainment: '#F1C40F',
  subscriptions: '#8E44AD',
  family: '#E67E22',
  business: '#34495E',
  income: '#009600',
  loan: '#D35400',
  other: '#95A5A6',
};
