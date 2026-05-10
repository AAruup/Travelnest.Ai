import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { api, extractError } from '../../src/api';
import { colors, media, radius, shadows, spacing, typography } from '../../src/theme';

type Contact = { id: string; name: string; phone_or_email: string };
type SafetyMsg = { id: string; kind: 'SAFE' | 'DLAY' | 'ETA' | 'SOS'; note?: string; latitude?: number; longitude?: number; created_at: string };
type Ping = { id: string; latitude: number; longitude: number; accuracy?: number; created_at: string };

const QUICK_KINDS = [
  { key: 'SAFE', label: 'I am safe', icon: 'checkmark-circle', color: colors.success, note: 'I am safe. Sharing current trip and GPS status.' },
  { key: 'DLAY', label: 'Delay', icon: 'time', color: colors.warning, note: 'There is a delay on the route. Will share an updated ETA shortly.' },
  { key: 'ETA', label: 'Arriving', icon: 'flag', color: colors.primary, note: 'Arriving soon. Sharing pickup and arrival note.' },
  { key: 'SOS', label: 'SOS', icon: 'alert-circle', color: colors.danger, note: 'Emergency SOS. Please reach out immediately.' },
] as const;

export default function SafetyScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<SafetyMsg[]>([]);
  const [pings, setPings] = useState<Ping[]>([]);
  const [name, setName] = useState('');
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [c, m, p] = await Promise.all([
        api.get('/contacts'), api.get('/safety-messages'), api.get('/gps-pings'),
      ]);
      setContacts(c.data); setMessages(m.data); setPings(p.data);
    } catch {}
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const addContact = async () => {
    if (!name.trim() || !phoneOrEmail.trim()) { Alert.alert('Missing details'); return; }
    setBusy(true);
    try {
      await api.post('/contacts', { name, phone_or_email: phoneOrEmail });
      setName(''); setPhoneOrEmail('');
      await refresh();
    } catch (e) { Alert.alert('Could not save', extractError(e)); }
    finally { setBusy(false); }
  };

  const deleteContact = async (id: string) => {
    try {
      await api.delete(`/contacts/${id}`);
      await refresh();
    } catch (e) { Alert.alert('Could not delete', extractError(e)); }
  };

  const sendQuick = async (kind: typeof QUICK_KINDS[number]) => {
    let lat: number | undefined, lon: number | undefined;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude; lon = loc.coords.longitude;
      }
    } catch {}
    try {
      await api.post('/safety-messages', {
        kind: kind.key,
        note: kind.note,
        latitude: lat,
        longitude: lon,
      });
      await refresh();
      Alert.alert('Sent', `${kind.label} update saved${lat ? ' with GPS' : ''}.`);
    } catch (e) { Alert.alert('Failed', extractError(e)); }
  };

  const detectRoute = async () => {
    setGpsBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Enable location to detect your route.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.post('/gps-pings', {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
        note: 'Route detect',
      });
      await refresh();
    } catch (e) { Alert.alert('GPS failed', extractError(e)); }
    finally { setGpsBusy(false); }
  };

  const lastPing = pings[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroRow}>
          <Image source={{ uri: media.safetyShield }} style={styles.shield} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Family safety</Text>
            <Text style={styles.pageSub}>Share GPS, SOS, and ETA with loved ones.</Text>
          </View>
        </View>

        {/* GPS card */}
        <View style={styles.gpsCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.gpsLabel}>GPS route detector</Text>
            <Text style={styles.gpsCoord}>
              {lastPing
                ? `${lastPing.latitude.toFixed(4)}, ${lastPing.longitude.toFixed(4)}`
                : 'No ping yet'}
            </Text>
            <Text style={styles.gpsTime}>
              {lastPing ? new Date(lastPing.created_at).toLocaleString() : 'Tap detect to share location'}
            </Text>
          </View>
          <TouchableOpacity testID="safety-gps-detect" style={styles.gpsBtn} onPress={detectRoute} disabled={gpsBusy}>
            {gpsBusy ? <ActivityIndicator color="#fff" /> : <Ionicons name="locate" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>

        {/* Quick action grid */}
        <Text style={styles.sectionTitle}>Quick safety updates</Text>
        <View style={styles.grid}>
          {QUICK_KINDS.map((k) => (
            <TouchableOpacity
              key={k.key}
              testID={`safety-quick-${k.key.toLowerCase()}`}
              style={[styles.quick, k.key === 'SOS' && { backgroundColor: colors.danger }]}
              onPress={() => sendQuick(k)}
            >
              <Ionicons name={k.icon as React.ComponentProps<typeof Ionicons>['name']} size={26} color={k.key === 'SOS' ? '#fff' : k.color} />
              <Text style={[styles.quickLabel, k.key === 'SOS' && { color: '#fff' }]}>{k.label}</Text>
              <Text style={[styles.quickKey, k.key === 'SOS' && { color: 'rgba(255,255,255,0.8)' }]}>{k.key}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Contacts */}
        <Text style={styles.sectionTitle}>Loved one contacts</Text>
        <View style={styles.card}>
          <TextInput
            testID="safety-contact-name"
            placeholder="Name" placeholderTextColor={colors.textSecondary}
            value={name} onChangeText={setName} style={styles.input}
          />
          <TextInput
            testID="safety-contact-phone"
            placeholder="Phone or email" placeholderTextColor={colors.textSecondary}
            value={phoneOrEmail} onChangeText={setPhoneOrEmail} style={styles.input} autoCapitalize="none"
          />
          <TouchableOpacity testID="safety-contact-save" style={styles.primaryBtn} onPress={addContact} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save contact</Text>}
          </TouchableOpacity>
        </View>
        {contacts.map((c) => (
          <View key={c.id} style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name="person" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{c.name}</Text>
              <Text style={styles.rowSub}>{c.phone_or_email}</Text>
            </View>
            <TouchableOpacity onPress={() => deleteContact(c.id)} testID={`safety-contact-del-${c.id.slice(0, 6)}`}>
              <Ionicons name="trash" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ))}
        {contacts.length === 0 && <Text style={styles.empty}>No contacts saved yet.</Text>}

        {/* Messages */}
        <Text style={styles.sectionTitle}>Auto message history</Text>
        {messages.map((m) => (
          <View key={m.id} style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: m.kind === 'SOS' ? '#FEE2E2' : colors.surfaceMuted }]}>
              <Text style={{ fontWeight: '900', color: m.kind === 'SOS' ? colors.danger : colors.primary, fontSize: 11 }}>{m.kind}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{m.note || m.kind}</Text>
              <Text style={styles.rowSub}>
                {new Date(m.created_at).toLocaleString()}
                {m.latitude ? ` · ${m.latitude.toFixed(3)}, ${m.longitude?.toFixed(3)}` : ''}
              </Text>
            </View>
          </View>
        ))}
        {messages.length === 0 && <Text style={styles.empty}>No messages yet.</Text>}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  shield: { width: 64, height: 64, borderRadius: radius.md },
  pageTitle: { ...typography.h2 },
  pageSub: { ...typography.small },
  gpsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, ...shadows.subtle },
  gpsLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 1 },
  gpsCoord: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 2 },
  gpsTime: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  gpsBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadows.strong },
  sectionTitle: { ...typography.h4, marginTop: spacing.lg, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quick: { width: '47%', flexGrow: 1, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows.subtle },
  quickLabel: { fontWeight: '800', fontSize: 16, marginTop: spacing.sm, color: colors.textPrimary },
  quickKey: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginTop: 2, letterSpacing: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, ...shadows.subtle },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.textPrimary },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', ...shadows.strong },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing.sm, marginTop: spacing.sm, ...shadows.subtle },
  rowIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontWeight: '700', color: colors.textPrimary },
  rowSub: { ...typography.small, marginTop: 2 },
  empty: { ...typography.small, padding: spacing.md, textAlign: 'center' },
});
