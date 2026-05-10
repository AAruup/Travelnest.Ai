import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/auth';
import { api, extractError } from '../../src/api';
import { colors, radius, shadows, spacing, typography } from '../../src/theme';

type Payment = { id: string; purpose: string; payee: string; amount: number; description: string; status: 'pending' | 'synced'; created_at: string };
type MusicSave = { id: string; title: string; artist: string; source: string };

const QUICK_PAYS = [
  { code: 'FOOD', label: 'Rail food', amount: 0, desc: 'Queue meal payment', icon: 'restaurant' },
  { code: 'HOTL', label: 'Hotel advance', amount: 0, desc: 'Queue booking token', icon: 'bed' },
  { code: 'RIDE', label: 'Ride pickup', amount: 0, desc: 'Queue taxi payment', icon: 'car-sport' },
  { code: 'PASS', label: 'Music pass', amount: 0, desc: 'Queue subscription', icon: 'musical-notes' },
] as const;

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [musicTracks, setMusicTracks] = useState<MusicSave[]>([]);

  // Custom payment form
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Logout confirmation modal
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState<{ id: string; title: string; creator: string; source: string; url: string }[]>([]);
  const [musicSearching, setMusicSearching] = useState(false);
  const [musicSaving, setMusicSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api.get('/payments'), api.get('/music/saves')]);
      setPayments(p.data); setMusicTracks(m.data);
    } catch {}
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // Re-fetch every time the Profile tab gains focus so Stripe rows created
  // on the Services tab show up under Pending immediately.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const queueQuick = async (code: string, desc: string) => {
    try {
      await api.post('/payments', { purpose: code, payee: '', amount: 0, description: desc });
      await refresh();
    } catch (e) { Alert.alert('Failed', extractError(e)); }
  };

  const queueCustom = async () => {
    if (!purpose.trim() || !amount.trim()) { Alert.alert('Missing details', 'Add purpose and amount.'); return; }
    const amt = parseFloat(amount);
    if (Number.isNaN(amt)) { Alert.alert('Invalid amount'); return; }
    setSavingPayment(true);
    try {
      await api.post('/payments', { purpose: purpose.toUpperCase(), payee, amount: amt, description: '' });
      setPurpose(''); setAmount(''); setPayee('');
      await refresh();
    } catch (e) { Alert.alert('Failed', extractError(e)); }
    finally { setSavingPayment(false); }
  };

  const sync = async (id: string) => {
    try {
      await api.post(`/payments/${id}/sync`);
      await refresh();
    } catch (e) { Alert.alert('Sync failed', extractError(e)); }
  };

  const searchMusic = async () => {
    if (!musicQuery.trim()) { Alert.alert('Type a song or artist'); return; }
    setMusicSearching(true);
    try {
      const r = await api.get(`/music/search`, { params: { q: musicQuery, page_size: 10 } });
      setMusicResults(r.data.results || []);
    } catch (e) { Alert.alert('Search failed', extractError(e)); }
    finally { setMusicSearching(false); }
  };

  const saveTrack = async (track: { title: string; creator: string; source: string; url: string }) => {
    setMusicSaving(true);
    try {
      await api.post('/music/saves', {
        title: track.title,
        artist: track.creator,
        source: track.source || 'openverse',
        url: track.url,
      });
      await refresh();
      Alert.alert('Saved', `${track.title} added to offline pack.`);
    } catch (e) { Alert.alert('Failed', extractError(e)); }
    finally { setMusicSaving(false); }
  };

  const confirmLogout = () => setLogoutOpen(true);
  const doLogout = async () => { setLogoutOpen(false); await logout(); };

  const pending = payments.filter((p) => p.status !== 'synced' && p.status !== 'cancelled');
  const synced = payments.filter((p) => p.status === 'synced');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>Profile</Text>

        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.full_name || user?.email || 'T').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.full_name || user?.email}</Text>
            <Text style={styles.userMail}>{user?.email}</Text>
            {user?.mobile ? <Text style={styles.userMobile}>📱 {user.mobile}</Text> : null}
          </View>
        </View>

        {/* Payment queue */}
        <Text style={styles.sectionTitle}>Offline payment queue</Text>
        <Text style={styles.sectionSub}>Queue pending payments; sync when online.</Text>

        <View style={styles.quickPayRow}>
          {QUICK_PAYS.map((q) => (
            <TouchableOpacity
              key={q.code}
              testID={`pay-quick-${q.code.toLowerCase()}`}
              style={styles.quickPay}
              onPress={() => queueQuick(q.code, q.desc)}
            >
              <Ionicons name={q.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={colors.primary} />
              <Text style={styles.quickPayLabel}>{q.label}</Text>
              <Text style={styles.quickPayCode}>{q.code}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.card}>
          <TextInput testID="pay-purpose" placeholder="Payment for" placeholderTextColor={colors.textSecondary} value={purpose} onChangeText={setPurpose} style={styles.input} />
          <TextInput testID="pay-amount" placeholder="Amount" placeholderTextColor={colors.textSecondary} value={amount} onChangeText={setAmount} style={styles.input} keyboardType="numeric" />
          <TextInput testID="pay-payee" placeholder="Payee" placeholderTextColor={colors.textSecondary} value={payee} onChangeText={setPayee} style={styles.input} />
          <TouchableOpacity testID="pay-queue" style={styles.primaryBtn} onPress={queueCustom} disabled={savingPayment}>
            {savingPayment ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Queue offline payment</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.subSection}>Pending ({pending.length})</Text>
        {pending.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={styles.rowIcon}><Text style={{ fontWeight: '900', color: colors.primary, fontSize: 11 }}>{p.purpose}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>₹{p.amount} {p.payee ? `· ${p.payee}` : ''}</Text>
              <Text style={styles.rowSub}>{p.description || new Date(p.created_at).toLocaleString()}</Text>
            </View>
            <TouchableOpacity testID={`pay-sync-${p.id.slice(0,6)}`} style={styles.syncBtn} onPress={() => sync(p.id)}>
              <Ionicons name="cloud-upload" size={16} color={colors.primary} />
              <Text style={styles.syncBtnText}>Sync</Text>
            </TouchableOpacity>
          </View>
        ))}
        {pending.length === 0 && <Text style={styles.empty}>No pending payments.</Text>}

        {synced.length > 0 && (
          <>
            <Text style={styles.subSection}>Synced ({synced.length})</Text>
            {synced.map((p) => (
              <View key={p.id} style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: '#D1FAE5' }]}>
                  <Ionicons name="checkmark" size={16} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>₹{p.amount} · {p.purpose}</Text>
                  <Text style={styles.rowSub}>Synced</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Music */}
        <Text style={styles.sectionTitle}>Nova open music pass</Text>
        <Text style={styles.sectionSub}>Search creative-commons audio on Openverse and save for offline.</Text>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              testID="music-search-input"
              placeholder="Search artists, moods, instruments…"
              placeholderTextColor={colors.textSecondary}
              value={musicQuery}
              onChangeText={setMusicQuery}
              style={[styles.input, { flex: 1 }]}
              onSubmitEditing={searchMusic}
              returnKeyType="search"
            />
            <TouchableOpacity testID="music-search-button" style={styles.searchBtn} onPress={searchMusic} disabled={musicSearching}>
              {musicSearching ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>

        {musicResults.length > 0 && (
          <>
            <Text style={styles.subSection}>Openverse results ({musicResults.length})</Text>
            {musicResults.map((t) => (
              <View key={t.id} style={styles.row}>
                <View style={styles.rowIcon}><Ionicons name="musical-note" size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{t.creator || 'Unknown'} · {t.source}</Text>
                </View>
                <TouchableOpacity
                  testID={`music-save-${t.id.slice(0, 6)}`}
                  style={styles.syncBtn}
                  onPress={() => saveTrack(t)}
                  disabled={musicSaving}
                >
                  <Ionicons name="download" size={14} color={colors.primary} />
                  <Text style={styles.syncBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <Text style={styles.subSection}>Offline pack ({musicTracks.length})</Text>
        {musicTracks.map((t) => (
          <View key={t.id} style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name="musical-notes" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{t.title}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{t.artist || 'Unknown artist'} · {t.source}</Text>
            </View>
          </View>
        ))}
        {musicTracks.length === 0 && <Text style={styles.empty}>Search Openverse and tap Save to start your offline pack.</Text>}

        <TouchableOpacity testID="profile-logout-button" style={styles.logoutBtn} onPress={confirmLogout}>
          <Ionicons name="log-out" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>TravelNest AI · v1.0 mobile</Text>
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <Modal
        visible={logoutOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sign out of TravelNest?</Text>
            <Text style={styles.modalSub}>You will need to sign in again to access your trip.</Text>
            <View style={styles.modalRow}>
              <TouchableOpacity
                testID="logout-cancel"
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={() => setLogoutOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="logout-confirm"
                style={[styles.modalBtn, styles.modalConfirm]}
                onPress={doLogout}
              >
                <Text style={styles.modalConfirmText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pageTitle: { ...typography.h2, marginBottom: spacing.md },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, ...shadows.subtle },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 22 },
  userName: { color: '#fff', fontWeight: '800', fontSize: 18 },
  userMail: { color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 2 },
  userMobile: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  sectionTitle: { ...typography.h4, marginTop: spacing.lg },
  sectionSub: { ...typography.small, marginBottom: spacing.sm },
  subSection: { ...typography.small, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 1 },
  quickPayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  quickPay: { width: '47%', flexGrow: 1, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadows.subtle },
  quickPayLabel: { fontWeight: '800', fontSize: 14, marginTop: 6, color: colors.textPrimary },
  quickPayCode: { fontSize: 11, color: colors.textSecondary, fontWeight: '700', letterSpacing: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, ...shadows.subtle, marginTop: spacing.sm },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.textPrimary },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', ...shadows.strong },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing.sm, marginTop: spacing.sm, ...shadows.subtle },
  rowIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontWeight: '700', color: colors.textPrimary },
  rowSub: { ...typography.small, marginTop: 2 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFEDE8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  syncBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  searchBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  empty: { ...typography.small, paddingVertical: spacing.sm, textAlign: 'center' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.pill, paddingVertical: 14, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.danger },
  logoutText: { color: colors.danger, fontWeight: '800', fontSize: 15 },
  footer: { ...typography.micro, textAlign: 'center', marginTop: spacing.md },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10,25,47,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
    zIndex: 10,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, width: '100%', maxWidth: 360 },
  modalTitle: { ...typography.h3, marginBottom: spacing.xs },
  modalSub: { ...typography.small, marginBottom: spacing.md },
  modalRow: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center' },
  modalCancel: { backgroundColor: colors.surfaceMuted },
  modalConfirm: { backgroundColor: colors.danger },
  modalCancelText: { color: colors.textPrimary, fontWeight: '700' },
  modalConfirmText: { color: '#fff', fontWeight: '800' },
});
