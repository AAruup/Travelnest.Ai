import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ImageBackground, TouchableOpacity,
  RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import { api } from '../../src/api';
import { colors, spacing, radius, shadows, typography, media } from '../../src/theme';

type Stats = {
  counts: Record<string, number>;
  pending_payments: number;
  journey_health: number;
};

const QUICK = [
  { key: 'Hotel', label: 'Hotel', icon: 'bed', tab: '/services' as const },
  { key: 'Rail Food', label: 'Rail Food', icon: 'restaurant', tab: '/services' as const },
  { key: 'Music', label: 'Music', icon: 'musical-notes', tab: '/profile' as const },
  { key: 'Pickup', label: 'Pickup', icon: 'car-sport', tab: '/services' as const },
  { key: 'Plane', label: 'Plane', icon: 'airplane', tab: '/services' as const },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Stats>('/stats');
      setStats(r.data);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const first = (user?.full_name || user?.email || 'Traveller').split(' ')[0].split('@')[0];
  const health = stats?.journey_health ?? 60;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greet}>Hi, {first}</Text>
            <Text style={styles.greetSub}>Where are we heading today?</Text>
          </View>
          <TouchableOpacity testID="home-profile-avatar" style={styles.avatar} onPress={() => router.push('/profile')}>
            <Text style={styles.avatarText}>{first.slice(0, 1).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Bento: Journey health */}
        <View testID="home-journey-card" style={styles.bento}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.bentoLabel}>Journey health</Text>
            <View style={styles.bentoBadge}>
              <Ionicons name="pulse" size={14} color={colors.primary} />
              <Text style={styles.bentoBadgeText}>Live</Text>
            </View>
          </View>
          <Text style={styles.bentoBig}>{health}%</Text>
          <Text style={styles.bentoSub}>Tickets, hotel, route, food, media, and alerts alignment.</Text>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${health}%` }]} /></View>

          <View style={styles.statRow}>
            <Stat label="Bookings" value={stats?.counts?.bookings ?? 0} />
            <Stat label="Rail food" value={stats?.counts?.rail_food ?? 0} />
            <Stat label="GPS pings" value={stats?.counts?.gps_pings ?? 0} />
            <Stat label="Pending pay" value={stats?.pending_payments ?? 0} />
          </View>
        </View>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {QUICK.map((q) => (
            <TouchableOpacity
              key={q.key}
              testID={`home-quick-${q.key.toLowerCase().replace(' ', '-')}`}
              style={styles.chip}
              onPress={() => router.push(q.tab)}
            >
              <Ionicons name={q.icon as React.ComponentProps<typeof Ionicons>['name']} size={18} color={colors.primary} />
              <Text style={styles.chipText}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Upcoming trip card */}
        <Text style={styles.sectionTitle}>Featured</Text>
        <ImageBackground
          source={{ uri: media.hero }}
          style={styles.trip}
          imageStyle={{ borderRadius: radius.lg }}
        >
          <View style={styles.tripOverlay}>
            <Text style={styles.tripKicker}>Plan ahead</Text>
            <Text style={styles.tripTitle}>Aligned ride, stay, meal, and family pings</Text>
            <TouchableOpacity testID="home-nova-cta" style={styles.tripCta} onPress={() => router.push('/nova')}>
              <Text style={styles.tripCtaText}>Ask Nova for ideas</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textInverse} />
            </TouchableOpacity>
          </View>
        </ImageBackground>

        {/* Service tiles */}
        <Text style={styles.sectionTitle}>Service modes</Text>
        <View style={styles.tileGrid}>
          <Tile icon="restaurant" label="Rail food" subtitle="Order by seat" tint="#FFEDE8" onPress={() => router.push('/services')} tid="home-tile-rail" />
          <Tile icon="airplane" label="Plane" subtitle="Gate & lounge" tint="#E6F0FF" onPress={() => router.push('/services')} tid="home-tile-plane" />
          <Tile icon="shield-checkmark" label="Family" subtitle="Safe & ETA" tint="#E6FBF1" onPress={() => router.push('/safety')} tid="home-tile-family" />
          <Tile icon="musical-notes" label="Offline music" subtitle="Saved tracks" tint="#FFF6E0" onPress={() => router.push('/profile')} tid="home-tile-music" />
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Tile = ({ icon, label, subtitle, tint, onPress, tid }: any) => (
  <TouchableOpacity testID={tid} onPress={onPress} style={[styles.tile, { backgroundColor: colors.surface }]}>
    <View style={[styles.tileIcon, { backgroundColor: tint }]}>
      <Ionicons name={icon} size={22} color={colors.primary} />
    </View>
    <Text style={styles.tileLabel}>{label}</Text>
    <Text style={styles.tileSub}>{subtitle}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  greet: { ...typography.h2 },
  greetSub: { ...typography.small, marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  bento: { backgroundColor: colors.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.subtle },
  bentoLabel: { color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  bentoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,90,54,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  bentoBadgeText: { color: colors.primary, fontWeight: '800', fontSize: 11 },
  bentoBig: { color: '#fff', fontSize: 56, fontWeight: '900', letterSpacing: -2, marginTop: 4 },
  bentoSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: spacing.md },
  bar: { height: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.primary, borderRadius: 6 },
  statRow: { flexDirection: 'row', marginTop: spacing.md, justifyContent: 'space-between' },
  stat: { flex: 1 },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
  sectionTitle: { ...typography.h4, marginTop: spacing.lg, marginBottom: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, ...shadows.subtle },
  chipText: { fontWeight: '700', color: colors.textPrimary },
  trip: { height: 180, marginTop: spacing.sm, justifyContent: 'flex-end', borderRadius: radius.lg, overflow: 'hidden' },
  tripOverlay: { backgroundColor: 'rgba(10,25,47,0.55)', padding: spacing.md, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  tripKicker: { color: colors.primary, fontWeight: '800', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 },
  tripTitle: { color: '#fff', fontWeight: '900', fontSize: 18, marginVertical: 4 },
  tripCta: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, marginTop: 6 },
  tripCtaText: { color: '#fff', fontWeight: '800' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  tile: { width: '47%', flexGrow: 1, padding: spacing.md, borderRadius: radius.lg, ...shadows.subtle },
  tileIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  tileLabel: { fontWeight: '800', fontSize: 15, color: colors.textPrimary },
  tileSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
});
