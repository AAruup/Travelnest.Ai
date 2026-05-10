import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ImageBackground, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/auth';
import { extractError } from '../src/api';
import { colors, media, radius, spacing, shadows, typography } from '../src/theme';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Email and password are required.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await login(email.trim().toLowerCase(), password);
      } else {
        await register(email.trim().toLowerCase(), password, fullName.trim(), mobile.trim());
      }
    } catch (e) {
      Alert.alert(mode === 'signin' ? 'Sign in failed' : 'Sign up failed', extractError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ImageBackground source={{ uri: media.authBg }} style={styles.bg} resizeMode="cover">
      <View style={styles.bgOverlay} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <View style={styles.brandBadge}>
                <Text style={styles.brandBadgeText}>TN</Text>
              </View>
              <Text style={styles.brandText}>TravelNest</Text>
              <Text style={styles.brandSub}>Your mobile travel super app — Nova AI, GPS, family safety, and more.</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.segment}>
                <TouchableOpacity
                  testID="auth-tab-signin"
                  onPress={() => setMode('signin')}
                  style={[styles.segmentBtn, mode === 'signin' && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, mode === 'signin' && styles.segmentTextActive]}>Sign in</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="auth-tab-signup"
                  onPress={() => setMode('signup')}
                  style={[styles.segmentBtn, mode === 'signup' && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, mode === 'signup' && styles.segmentTextActive]}>Create account</Text>
                </TouchableOpacity>
              </View>

              {mode === 'signup' && (
                <>
                  <Field icon="person-outline" testID="auth-name-input" placeholder="Full name"
                         value={fullName} onChangeText={setFullName} />
                  <Field icon="call-outline" testID="auth-mobile-input" placeholder="Mobile number"
                         value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
                </>
              )}
              <Field icon="mail-outline" testID="auth-email-input" placeholder="Email"
                     value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <Field icon="lock-closed-outline" testID="auth-password-input" placeholder="Password"
                     value={password} onChangeText={setPassword} secureTextEntry />

              <TouchableOpacity
                testID="auth-submit-button"
                style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
                disabled={busy}
                onPress={submit}
              >
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.primaryBtnText}>
                    {mode === 'signin' ? 'Sign in to TravelNest' : 'Create account'}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                testID="auth-google-button"
                style={styles.googleBtn}
                onPress={() => Alert.alert('Coming soon', 'Google sign-in arrives in the next update.')}
              >
                <Ionicons name="logo-google" size={20} color={colors.textPrimary} />
                <Text style={styles.googleText}>Continue with Google</Text>
              </TouchableOpacity>

              <Text style={styles.footerNote}>
                By continuing you agree to the TravelNest terms and the journey-care promise: tickets,
                hotels, food, route, music, and safety — aligned end to end.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

type FieldProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  placeholder: string;
  value: string;
  onChangeText: (s: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences';
  testID?: string;
};

const Field = ({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, testID }: FieldProps) => (
  <View style={styles.field}>
    <Ionicons name={icon} size={18} color={colors.textSecondary} />
    <TextInput
      testID={testID}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType ?? 'default'}
      autoCapitalize={autoCapitalize ?? 'sentences'}
      style={styles.fieldInput}
    />
  </View>
);

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.secondary },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,25,47,0.72)' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  brand: { marginTop: spacing.lg, marginBottom: spacing.xl, alignItems: 'flex-start' },
  brandBadge: {
    width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, ...shadows.strong,
  },
  brandBadgeText: { color: '#fff', fontSize: 20, fontWeight: '900' as const, letterSpacing: 1 },
  brandText: { color: colors.textInverse, fontSize: 42, fontWeight: '900', letterSpacing: -1 },
  brandSub: { color: 'rgba(255,255,255,0.78)', marginTop: spacing.xs, fontSize: 15, maxWidth: 320 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadows.subtle,
  },
  segment: {
    flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.pill,
    padding: 4, marginBottom: spacing.md,
  },
  segmentBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.pill, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.secondary },
  segmentText: { color: colors.textSecondary, fontWeight: '700' },
  segmentTextActive: { color: colors.textInverse },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceMuted, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 4, marginBottom: spacing.sm,
  },
  fieldInput: { flex: 1, paddingVertical: 14, color: colors.textPrimary, fontSize: 15 },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16,
    alignItems: 'center', marginTop: spacing.sm, ...shadows.strong,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.micro, fontWeight: '700' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 14,
  },
  googleText: { color: colors.textPrimary, fontWeight: '700', fontSize: 15 },
  footerNote: { ...typography.micro, marginTop: spacing.md, lineHeight: 18, textAlign: 'center' },
});
