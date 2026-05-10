import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView,
  Platform, ActivityIndicator, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, extractError } from '../../src/api';
import { colors, media, radius, shadows, spacing, typography } from '../../src/theme';

type Msg = { id: string; role: 'user' | 'assistant'; text: string };

const SUGGESTIONS = [
  'Plan a 2-day Mumbai-Goa rail trip',
  'Suggest in-coach meals for a kid',
  'Family safe-arrival message template',
  'Best offline music pack for night flight',
];

export default function NovaScreen() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'sys', role: 'assistant', text: 'Hi! I’m Nova. Ask me about your trip, food, hotel, flights, family safety, or music plans.' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
    const userMsg: Msg = { id: `${Date.now()}-u`, role: 'user', text: trimmed };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const r = await api.post('/nova/chat', { message: trimmed, session_id: sessionId });
      setSessionId(r.data.session_id);
      setMessages((m) => [...m, { id: `${Date.now()}-a`, role: 'assistant', text: r.data.reply }]);
    } catch (e) {
      const err = extractError(e, 'Nova is offline. Please retry.');
      setMessages((m) => [...m, { id: `${Date.now()}-e`, role: 'assistant', text: `⚠️ ${err}` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.header}>
          <Image source={{ uri: media.novaAvatar }} style={styles.headerAvatar} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.headerTitle}>Nova</Text>
            <Text style={styles.headerSub}>Your travel & entertainment agent</Text>
          </View>
          <View style={styles.statusDot} />
        </View>

        <FlatList
          ref={listRef}
          testID="nova-message-list"
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <View style={[styles.bubbleRow, item.role === 'user' ? { justifyContent: 'flex-end' } : null]}>
              <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
                <Text style={item.role === 'user' ? styles.bubbleUserText : styles.bubbleAiText}>{item.text}</Text>
              </View>
            </View>
          )}
          ListFooterComponent={sending ? (
            <View style={styles.bubbleRow}>
              <View style={[styles.bubble, styles.bubbleAi]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            </View>
          ) : null}
        />

        {messages.length <= 1 && (
          <View style={styles.suggestRow}>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity key={s} testID={`nova-suggest-${s.slice(0, 6)}`} style={styles.suggestChip} onPress={() => send(s)}>
                <Text style={styles.suggestText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.composer}>
          <TextInput
            testID="nova-input"
            placeholder="Ask Nova anything…"
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            style={styles.composerInput}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <TouchableOpacity testID="nova-send-button" style={styles.sendBtn} onPress={() => send(input)} disabled={sending || !input.trim()}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.secondary },
  headerTitle: { ...typography.h3 },
  headerSub: { ...typography.small },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  bubbleRow: { marginBottom: spacing.sm, flexDirection: 'row' },
  bubble: { maxWidth: '85%', padding: spacing.md, borderRadius: radius.lg },
  bubbleUser: { backgroundColor: colors.primary, borderTopRightRadius: 6 },
  bubbleAi: { backgroundColor: colors.surface, borderTopLeftRadius: 6, ...shadows.subtle },
  bubbleUserText: { color: '#fff', fontSize: 15 },
  bubbleAiText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  suggestChip: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10, ...shadows.subtle },
  suggestText: { color: colors.textPrimary, fontWeight: '600', fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  composerInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, color: colors.textPrimary },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
