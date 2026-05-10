import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ImageBackground, Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, extractError } from '../../src/api';
import { colors, media, radius, shadows, spacing, typography } from '../../src/theme';

const SERVICE_OPTIONS = [
  'Hotel near arrival',
  'Rail food',
  'Offline music pack',
  'Airport pickup',
  'Travel insurance',
];

const RAIL_MENU = [
  { name: 'Veg Thali', price: 180 },
  { name: 'Chicken Biryani', price: 240 },
  { name: 'Masala Dosa', price: 140 },
  { name: 'Paneer Wrap', price: 160 },
  { name: 'Cold Drink', price: 50 },
  { name: 'Filter Coffee', price: 60 },
];

type Booking = { id: string; service: string; location: string; passenger_need: string };
type RailOrder = { id: string; total: number; coach_seat: string; station: string; items: { name: string; qty: number; price: number }[] };
type PlanePlan = { id: string; flight_number: string; airport: string; passenger_need: string };

export default function ServicesScreen() {
  // Booking state
  const [service, setService] = useState(SERVICE_OPTIONS[0]);
  const [location, setLocation] = useState('');
  const [need, setNeed] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [savingBooking, setSavingBooking] = useState(false);

  // Rail food state
  const [cart, setCart] = useState<Record<string, number>>({});
  const [coachSeat, setCoachSeat] = useState('');
  const [station, setStation] = useState('');
  const [orders, setOrders] = useState<RailOrder[]>([]);
  const [placingOrder, setPlacingOrder] = useState(false);

  // Plane plan state
  const [flightNo, setFlightNo] = useState('');
  const [airport, setAirport] = useState('');
  const [planeNeed, setPlaneNeed] = useState('');
  const [plans, setPlans] = useState<PlanePlan[]>([]);
  const [savingPlane, setSavingPlane] = useState(false);

  const cartTotal = Object.entries(cart).reduce((s, [k, q]) => {
    const item = RAIL_MENU.find((m) => m.name === k);
    return s + (item ? item.price * q : 0);
  }, 0);

  const refresh = useCallback(async () => {
    try {
      const [b, r, p] = await Promise.all([
        api.get('/bookings'), api.get('/rail-food'), api.get('/plane-plans'),
      ]);
      setBookings(b.data); setOrders(r.data); setPlans(p.data);
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveBooking = async () => {
    setSavingBooking(true);
    try {
      await api.post('/bookings', { service, location, passenger_need: need });
      setLocation(''); setNeed('');
      await refresh();
    } catch (e) { Alert.alert('Could not save', extractError(e)); }
    finally { setSavingBooking(false); }
  };

  const inc = (n: string) => setCart((c) => ({ ...c, [n]: (c[n] || 0) + 1 }));
  const dec = (n: string) => setCart((c) => {
    const next = { ...c }; if (!next[n]) return c;
    next[n] -= 1; if (next[n] <= 0) delete next[n];
    return next;
  });

  const placeOrder = async () => {
    if (cartTotal === 0) { Alert.alert('Empty cart', 'Add at least one item.'); return; }
    setPlacingOrder(true);
    try {
      const items = Object.entries(cart).map(([name, qty]) => {
        const m = RAIL_MENU.find((x) => x.name === name)!;
        return { name, qty, price: m.price };
      });
      await api.post('/rail-food', { items, coach_seat: coachSeat, station, total: cartTotal });
      setCart({}); setCoachSeat(''); setStation('');
      await refresh();
      Alert.alert('Order placed', 'Your rail food order is saved.');
    } catch (e) { Alert.alert('Order failed', extractError(e)); }
    finally { setPlacingOrder(false); }
  };

  const savePlane = async () => {
    if (!flightNo.trim()) { Alert.alert('Flight number required'); return; }
    setSavingPlane(true);
    try {
      await api.post('/plane-plans', { flight_number: flightNo, airport, passenger_need: planeNeed });
      setFlightNo(''); setAirport(''); setPlaneNeed('');
      await refresh();
    } catch (e) { Alert.alert('Could not save', extractError(e)); }
    finally { setSavingPlane(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>Services</Text>
        <Text style={styles.pageSub}>Book, order, and manage every journey need.</Text>

        {/* Hotel + service booking */}
        <ImageBackground source={{ uri: media.hero }} imageStyle={styles.bannerImg} style={styles.banner}>
          <View style={styles.bannerOverlay}>
            <Text style={styles.bannerKicker}>Hotel & service booking</Text>
            <Text style={styles.bannerTitle}>AI assisted stay & service plans</Text>
          </View>
        </ImageBackground>

        <View style={styles.card}>
          <Text style={styles.label}>Service</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {SERVICE_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                testID={`svc-chip-${s.split(' ')[0].toLowerCase()}`}
                style={[styles.chip, service === s && styles.chipActive]}
                onPress={() => setService(s)}
              >
                <Text style={[styles.chipText, service === s && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Input testID="svc-location" placeholder="City or station" value={location} onChangeText={setLocation} />
          <Input testID="svc-need" placeholder="Passenger need (e.g. quiet room, late check-in)" value={need} onChangeText={setNeed} multiline />

          <PrimaryButton
            testID="svc-save-booking"
            loading={savingBooking}
            label="Save booking request"
            onPress={saveBooking}
          />
        </View>

        {/* Saved bookings */}
        <SectionHeader title="Saved bookings" count={bookings.length} />
        {bookings.map((b) => (
          <View key={b.id} style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name="bed" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{b.service}</Text>
              <Text style={styles.rowSub}>{b.location || '—'} · {b.passenger_need || 'no notes'}</Text>
            </View>
          </View>
        ))}
        {bookings.length === 0 && <Empty text="No bookings yet." />}

        {/* Rail food */}
        <ImageBackground source={{ uri: media.trainFood }} imageStyle={styles.bannerImg} style={[styles.banner, { marginTop: spacing.lg }]}>
          <View style={styles.bannerOverlay}>
            <Text style={styles.bannerKicker}>Rail Food</Text>
            <Text style={styles.bannerTitle}>Order meals by coach & seat</Text>
          </View>
        </ImageBackground>

        <View style={styles.card}>
          {RAIL_MENU.map((m) => {
            const qty = cart[m.name] || 0;
            return (
              <View key={m.name} style={styles.menuRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuName}>{m.name}</Text>
                  <Text style={styles.menuPrice}>₹{m.price}</Text>
                </View>
                {qty === 0 ? (
                  <TouchableOpacity testID={`menu-add-${m.name.split(' ')[0]}`} style={styles.smallBtn} onPress={() => inc(m.name)}>
                    <Text style={styles.smallBtnText}>Add</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.qtyBox}>
                    <TouchableOpacity testID={`menu-dec-${m.name.split(' ')[0]}`} onPress={() => dec(m.name)}><Ionicons name="remove" size={18} color={colors.primary} /></TouchableOpacity>
                    <Text style={styles.qtyText}>{qty}</Text>
                    <TouchableOpacity testID={`menu-inc-${m.name.split(' ')[0]}`} onPress={() => inc(m.name)}><Ionicons name="add" size={18} color={colors.primary} /></TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          <Input testID="rail-coach" placeholder="Coach & seat (e.g. B2-34)" value={coachSeat} onChangeText={setCoachSeat} />
          <Input testID="rail-station" placeholder="Delivery station" value={station} onChangeText={setStation} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Cart total</Text>
            <Text style={styles.totalAmount}>₹{cartTotal}</Text>
          </View>

          <PrimaryButton testID="rail-place-order" loading={placingOrder} label="Place food order" onPress={placeOrder} />
        </View>

        {/* Rail food orders */}
        <SectionHeader title="Food order history" count={orders.length} />
        {orders.map((o) => (
          <View key={o.id} style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name="restaurant" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>₹{o.total} · {o.items.length} items</Text>
              <Text style={styles.rowSub}>{o.coach_seat || 'seat ?'} · {o.station || 'station ?'}</Text>
            </View>
          </View>
        ))}
        {orders.length === 0 && <Empty text="No orders yet." />}

        {/* Plane */}
        <ImageBackground source={{ uri: media.airport }} imageStyle={styles.bannerImg} style={[styles.banner, { marginTop: spacing.lg }]}>
          <View style={styles.bannerOverlay}>
            <Text style={styles.bannerKicker}>Plane Services</Text>
            <Text style={styles.bannerTitle}>From airport entry to arrival pickup</Text>
          </View>
        </ImageBackground>

        <View style={styles.card}>
          <Input testID="plane-flight" placeholder="Flight number (e.g. 6E-2031)" value={flightNo} onChangeText={setFlightNo} />
          <Input testID="plane-airport" placeholder="Airport (e.g. BLR T2)" value={airport} onChangeText={setAirport} />
          <Input testID="plane-need" placeholder="Need (gate, lounge, baggage, pickup)" value={planeNeed} onChangeText={setPlaneNeed} multiline />
          <PrimaryButton testID="plane-save" loading={savingPlane} label="Save flight plan" onPress={savePlane} />
        </View>

        <SectionHeader title="Saved flight plans" count={plans.length} />
        {plans.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name="airplane" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{p.flight_number}</Text>
              <Text style={styles.rowSub}>{p.airport || '—'} · {p.passenger_need || 'no notes'}</Text>
            </View>
          </View>
        ))}
        {plans.length === 0 && <Empty text="No flight plans yet." />}

        <PartnerHub />

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ----- Partner hub block --------------------------------------------------
type Partner = { id: string; name: string; city: string; contact: string; partner_type: string };
const PARTNER_TYPES = ['Hotel', 'Rail food vendor', 'Airport pickup', 'Open music creator', 'Streaming metadata'];

const PartnerHub = () => {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [contact, setContact] = useState('');
  const [ptype, setPtype] = useState(PARTNER_TYPES[0]);
  const [list, setList] = useState<Partner[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try { const r = await api.get('/partners'); setList(r.data); } catch {}
  };
  useEffect(() => { refresh(); }, []);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setBusy(true);
    try {
      await api.post('/partners', { name, city, contact, partner_type: ptype });
      setName(''); setCity(''); setContact('');
      await refresh();
    } catch (e) { Alert.alert('Could not save', extractError(e)); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={styles.pageTitle}>Partner hub</Text>
      <Text style={styles.pageSub}>Connect hotels, food, music, and streaming partners.</Text>

      <View style={styles.card}>
        <Input testID="partner-name" placeholder="Hotel or vendor name" value={name} onChangeText={setName} />
        <Input testID="partner-city" placeholder="City or station" value={city} onChangeText={setCity} />
        <Input testID="partner-contact" placeholder="Contact (phone / email)" value={contact} onChangeText={setContact} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {PARTNER_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              testID={`partner-type-${t.split(' ')[0].toLowerCase()}`}
              style={[styles.chip, ptype === t && styles.chipActive]}
              onPress={() => setPtype(t)}
            >
              <Text style={[styles.chipText, ptype === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <PrimaryButton testID="partner-save" loading={busy} label="Save partner lead" onPress={save} />
      </View>

      <SectionHeader title="Saved partner leads" count={list.length} />
      {list.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={styles.rowIcon}><Ionicons name="business" size={18} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{p.name} · {p.partner_type}</Text>
            <Text style={styles.rowSub}>{p.city || '—'} · {p.contact || 'no contact'}</Text>
          </View>
        </View>
      ))}
      {list.length === 0 && <Empty text="No partner leads yet." />}
    </View>
  );
};

// ----- Reusable -----------------------------------------------------------
const Input = (props: React.ComponentProps<typeof TextInput>) => (
  <TextInput
    {...props}
    placeholderTextColor={colors.textSecondary}
    style={[styles.input, props.multiline && { height: 80, textAlignVertical: 'top' }, props.style as any]}
  />
);

const PrimaryButton = ({ label, onPress, loading, testID }: { label: string; onPress: () => void; loading?: boolean; testID?: string }) => (
  <TouchableOpacity testID={testID} style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={onPress} disabled={loading}>
    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{label}</Text>}
  </TouchableOpacity>
);

const SectionHeader = ({ title, count }: { title: string; count?: number }) => (
  <View style={styles.sectionHead}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {typeof count === 'number' && <Text style={styles.sectionCount}>{count}</Text>}
  </View>
);

const Empty = ({ text }: { text: string }) => (
  <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pageTitle: { ...typography.h2 },
  pageSub: { ...typography.small, marginBottom: spacing.md },
  banner: { height: 130, justifyContent: 'flex-end', borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.md },
  bannerImg: { borderRadius: radius.lg },
  bannerOverlay: { padding: spacing.md, backgroundColor: 'rgba(10,25,47,0.55)' },
  bannerKicker: { color: colors.primary, fontWeight: '800', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 },
  bannerTitle: { color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadows.subtle, gap: spacing.sm },
  label: { ...typography.small, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  chip: { backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: colors.secondary },
  chipText: { color: colors.textPrimary, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.textPrimary },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs, ...shadows.strong },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1 },
  menuName: { fontWeight: '700', color: colors.textPrimary },
  menuPrice: { color: colors.textSecondary, fontSize: 13 },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.primary },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  qtyText: { fontWeight: '800', color: colors.textPrimary, minWidth: 20, textAlign: 'center' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  totalLabel: { ...typography.small, fontWeight: '700' },
  totalAmount: { fontSize: 20, fontWeight: '900', color: colors.primary },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { ...typography.h4, flex: 1 },
  sectionCount: { ...typography.small, backgroundColor: colors.surfaceMuted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing.sm, marginBottom: spacing.sm, ...shadows.subtle },
  rowIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontWeight: '700', color: colors.textPrimary },
  rowSub: { ...typography.small, marginTop: 2 },
  empty: { padding: spacing.md, alignItems: 'center' },
  emptyText: { ...typography.small },
});
