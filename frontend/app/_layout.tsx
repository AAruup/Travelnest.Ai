import React from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/auth';
import { colors } from '../src/theme';

function Gate({ children }: { children: React.ReactNode }) {
  const { signedIn, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === 'auth';
    if (!signedIn && !inAuth) {
      router.replace('/auth');
    } else if (signedIn && inAuth) {
      router.replace('/(tabs)');
    }
  }, [signedIn, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </Gate>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
