// Shared theme tokens for TravelNest AI.
import { Platform } from 'react-native';

export const colors = {
  primary: '#FF5A36',
  primaryActive: '#E0482B',
  secondary: '#0A192F',
  background: '#F5F5F0',
  surface: '#FFFFFF',
  textPrimary: '#0A192F',
  textSecondary: '#5C6B89',
  textInverse: '#FFFFFF',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  overlay: 'rgba(10, 25, 47, 0.55)',
  border: 'rgba(92,107,137,0.16)',
  surfaceMuted: '#EFEFE7',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radius = { sm: 8, md: 16, lg: 24, xl: 32, pill: 9999 };

// Use the modern `boxShadow` prop (RN 0.79+) and keep `elevation` for Android.
export const shadows = {
  subtle: Platform.select({
    web: { boxShadow: '0px 4px 12px rgba(10,25,47,0.08)' },
    default: { boxShadow: '0px 4px 12px rgba(10,25,47,0.08)', elevation: 4 },
  }) as object,
  strong: Platform.select({
    web: { boxShadow: '0px 8px 24px rgba(255,90,54,0.25)' },
    default: { boxShadow: '0px 8px 24px rgba(255,90,54,0.25)', elevation: 8 },
  }) as object,
};

export const typography = {
  h1: { fontSize: 36, fontWeight: '900' as const, letterSpacing: -0.5, color: colors.textPrimary },
  h2: { fontSize: 28, fontWeight: '900' as const, letterSpacing: -0.3, color: colors.textPrimary },
  h3: { fontSize: 22, fontWeight: '800' as const, color: colors.textPrimary },
  h4: { fontSize: 18, fontWeight: '700' as const, color: colors.textPrimary },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.textPrimary },
  small: { fontSize: 14, fontWeight: '400' as const, color: colors.textSecondary },
  micro: { fontSize: 12, fontWeight: '500' as const, color: colors.textSecondary },
};

export const media = {
  hero: 'https://images.unsplash.com/photo-1542815871-b8e4b3253424?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80',
  trainFood: 'https://images.unsplash.com/photo-1640895252035-6b31cf4a9e5a?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80',
  airport: 'https://images.unsplash.com/photo-1504717680241-00f3d96a933d?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80',
  authBg: 'https://static.prod-images.emergentagent.com/jobs/86864a07-4998-4ad9-a5b8-edfebc9cb823/images/8107942b5ba65b781d0d75cdcaa5e32f2df60a2065b89f7faf40111644288f05.png',
  novaAvatar: 'https://static.prod-images.emergentagent.com/jobs/86864a07-4998-4ad9-a5b8-edfebc9cb823/images/0636b454a8f8406b789c76a6449af4ae23c147c6fd32d39071c7e37b16e58ab7.png',
  safetyShield: 'https://static.prod-images.emergentagent.com/jobs/86864a07-4998-4ad9-a5b8-edfebc9cb823/images/dfca3ce18273d35cb381c1b79db36b5d6afc83bcfd50c52d64a18876676894bf.png',
};
