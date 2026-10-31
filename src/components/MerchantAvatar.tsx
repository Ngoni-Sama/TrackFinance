import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { normaliseMerchant } from '../core/categorise';
import { useSettingsStore } from '../core/settingsStore';
import { CATEGORY_COLORS, useTheme } from '../core/theme';

/**
 * Website domains for well-known Zimbabwean and global merchants. Only the
 * domain is requested (as a website icon), never amounts or personal data.
 * First substring match wins.
 */
export const MERCHANT_DOMAINS: [string, string][] = [
  ['ecocash', 'ecocash.co.zw'],
  ['omari', 'ecocash.co.zw'],
  ['kashagi', 'ecocash.co.zw'],
  ['econet', 'econet.co.zw'],
  ['netone', 'netone.co.zw'],
  ['onemoney', 'netone.co.zw'],
  ['telecel', 'telecel.co.zw'],
  ['zesa', 'zetdc.co.zw'],
  ['zetdc', 'zetdc.co.zw'],
  ['dstv', 'dstv.com'],
  ['multichoice', 'dstv.com'],
  ['showmax', 'showmax.com'],
  ['netflix', 'netflix.com'],
  ['spotify', 'spotify.com'],
  ['youtube', 'youtube.com'],
  ['google', 'google.com'],
  ['apple', 'apple.com'],
  ['microsoft', 'microsoft.com'],
  ['openai', 'openai.com'],
  ['liquid', 'liquid.tech'],
  ['zol', 'zol.co.zw'],
  ['ok zimbabwe', 'okziminc.com'],
  ['ok mart', 'okziminc.com'],
  ['pick n pay', 'tmpicknpay.co.zw'],
  ['spar', 'spar.co.za'],
  ['chicken inn', 'simbisabrands.com'],
  ['pizza inn', 'simbisabrands.com'],
  ['bakers inn', 'simbisabrands.com'],
  ['cbz', 'cbz.co.zw'],
  ['steward', 'stewardbank.co.zw'],
  ['stanbic', 'stanbicbank.co.zw'],
  ['fbc', 'fbc.co.zw'],
  ['nmb', 'nmbz.co.zw'],
  ['bancabc', 'bancabc.co.zw'],
  ['cimas', 'cimas.co.zw'],
  ['psmas', 'psmas.co.zw'],
  ['puma', 'pumaenergy.com'],
  ['totalenergies', 'totalenergies.com'],
  ['city of harare', 'hararecity.co.zw'],
];

export function merchantDomain(name: string): string | undefined {
  const n = normaliseMerchant(name);
  return MERCHANT_DOMAINS.find(([needle]) => n.includes(needle))?.[1];
}

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  income: 'arrow-down',
  savings: 'shield-checkmark',
  loan: 'cash',
  loan_repayment: 'cash',
};

/** Round merchant thumbnail: website icon when known (and allowed), otherwise coloured initials. */
export function MerchantAvatar({ name, category, size = 36 }: { name: string; category?: string; size?: number }) {
  const t = useTheme();
  const logosOn = useSettingsStore((s) => s.merchantLogos);
  const [failed, setFailed] = useState(false);
  const domain = logosOn ? merchantDomain(name) : undefined;
  const color = (category && CATEGORY_COLORS[category]) || t.accent;
  const icon = category ? CATEGORY_ICONS[category] : undefined;

  const box = { width: size, height: size, borderRadius: size / 2, alignItems: 'center' as const, justifyContent: 'center' as const };

  if (domain && !failed) {
    return (
      <View style={[box, { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: t.paneBorder, overflow: 'hidden' }]}>
        <Image
          source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=64` }}
          style={{ width: size * 0.62, height: size * 0.62 }}
          onError={() => setFailed(true)}
          accessibilityLabel={`${name} logo`}
        />
      </View>
    );
  }
  return (
    <View style={[box, { backgroundColor: color }]} accessibilityLabel={name}>
      {icon && !/[a-z]/i.test(initials(name)) ? (
        <Ionicons name={icon} size={size * 0.5} color="#FFF" />
      ) : (
        <Text style={{ color: '#FFF', fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</Text>
      )}
    </View>
  );
}
