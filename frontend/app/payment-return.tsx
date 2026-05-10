import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../src/api';
import { colors, radius, spacing, typography } from '../src/theme';

export default function PaymentReturnScreen() {
  const params = useLocalSearchParams<{ status?: string; session_id?: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'paid' | 'cancelled' | 'open'>('checking');
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    const sid = params.session_id;
    if (params.status === 'cancel' || !sid) {
      setStatus('cancelled');
      return;
    }
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      while (!cancelled && attempts < 10) {
        try {
          const r = await api.get(`/payments/checkout/status/${sid}`);
          if (r.data.payment_status === 'paid') {
            setAmount(r.data.amount_total / 100);
            setStatus('paid');
            return;
          }
          if (r.data.status === 'expired') {
            setStatus('cancelled');
            return;
          }
        } catch {
          /* keep polling */
        }
        attempts += 1;
        await new Promise((res) => setTimeout(res, 2000));
      }
      if (!cancelled) setStatus('open');
    };
    poll();
    return () => { cancelled = true; };
  }, [params.session_id, params.status]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        {status === 'checking' && (
          <>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.title}>Confirming payment…</Text>
            <Text style={styles.sub}>Hold tight, this usually takes a couple of seconds.</Text>
          </>
        )}
        {status === 'paid' && (
          <>
            <Ionicons name="checkmark-circle" color={colors.success} size={64} />
            <Text style={styles.title}>Payment received</Text>
            {amount !== null && <Text style={styles.sub}>${amount.toFixed(2)} synced to your booking.</Text>}
          </>
        )}
        {status === 'cancelled' && (
          <>
            <Ionicons name="close-circle" color={colors.danger} size={64} />
            <Text style={styles.title}>Payment cancelled</Text>
            <Text style={styles.sub}>You can try again any time from the partner hub.</Text>
          </>
        )}
        {status === 'open' && (
          <>
            <Ionicons name="time" color={colors.warning} size={64} />
            <Text style={styles.title}>Still processing</Text>
            <Text style={styles.sub}>We’ll update the status as soon as Stripe confirms.</Text>
          </>
        )}
        <View
          testID="payment-return-back"
          onTouchEnd={() => router.replace('/(tabs)/profile')}
          style={styles.btn}
        >
          <Text style={styles.btnText}>Back to TravelNest</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', gap: spacing.sm, maxWidth: 400, width: '100%' },
  title: { ...typography.h3, marginTop: spacing.md },
  sub: { ...typography.small, textAlign: 'center' },
  btn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 14, marginTop: spacing.lg },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
