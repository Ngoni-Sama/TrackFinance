import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, TextInput, View } from 'react-native';
import { askAssistant, ChatMessage, isAssistantConfigured } from '../../ai/assistant';
import { loadAiConfig, providerInfo } from '../../ai/config';
import { Button, Chip, Row } from '../../components/Controls';
import { Pane, Separator } from '../../components/Pane';
import { Body, Caption, Title } from '../../components/Typography';
import { useSettingsStore } from '../../core/settingsStore';
import { Entry } from '../../core/summaries';
import { fontSize, margin, radius, useTheme } from '../../core/theme';
import { setAiEnabled } from '../../data/settings';

const STARTERS = [
  'Where is my money going this month?',
  'Which subscriptions or bills could I cut?',
  'Will I run out of money before month end?',
  'How do I get to a million dollars from here?',
];

function Disclosure({ visible, onAccept, onClose }: { visible: boolean; onAccept: () => void; onClose: () => void }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: margin * 2 }}>
        <View style={{ backgroundColor: t.pane, borderRadius: radius, padding: margin * 2 }}>
          <Title>Turn on the AI coach?</Title>
          <Body style={{ marginTop: margin }}>
            The coach runs on Cloudflare Workers AI. Each time you ask it something, TrackFinance sends a snapshot of your finances to it:
          </Body>
          <Body style={{ marginTop: margin / 2 }}>• monthly totals, budgets, recurring payments, forecast and goal</Body>
          <Body>• your last ~80 transactions, including merchant names and the original SMS text</Body>
          <Body style={{ marginTop: margin / 2 }}>
            Nothing is sent until you ask a question. TrackFinance's server passes it to the AI and stores nothing; Cloudflare's privacy terms cover their side. You can turn the coach off any time, and everything else in TrackFinance stays on your phone.
          </Body>
          <Button title="Turn on" onPress={onAccept} style={{ marginTop: margin * 2 }} />
          <Button title="Not now" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const t = useTheme();
  const mine = m.role === 'user';
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        backgroundColor: mine ? t.accent : t.inputBackground,
        borderColor: t.paneBorder,
        borderWidth: mine ? 0 : 1,
        borderRadius: radius * 1.5,
        paddingHorizontal: margin * 1.2,
        paddingVertical: margin * 0.8,
        marginVertical: 4,
      }}
    >
      <Body style={{ color: mine ? '#FFF' : t.text }}>{m.content}</Body>
    </View>
  );
}

export function AiCoach({ snapshot, unclear, onSortOut, onProvider }: {
  snapshot: () => string;
  unclear: Entry[];
  onSortOut: () => void;
  onProvider: () => void;
}) {
  const t = useTheme();
  const enabled = useSettingsStore((s) => s.aiEnabled);
  const [disclosure, setDisclosure] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'chat' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerLabel, setProviderLabel] = useState('');

  useEffect(() => {
    loadAiConfig().then((c) => setProviderLabel(c.provider === 'cloudflare' ? 'free assistant' : `${providerInfo(c.provider).label} · ${c.model}`));
  }, [enabled]);

  if (!isAssistantConfigured) return null;

  if (!enabled) {
    return (
      <Pane title="AI coach">
        <Disclosure
          visible={disclosure}
          onClose={() => setDisclosure(false)}
          onAccept={() => {
            setDisclosure(false);
            setAiEnabled(true);
          }}
        />
        <Body muted>
          Ask questions about your money in plain language. The coach can guess what unclear payments were for, spot bills you could cut, check your forecast, and plan your route to a million.
        </Body>
        <Button title="Turn on AI coach" onPress={() => setDisclosure(true)} />
      </Pane>
    );
  }

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...messages, { role: 'user' as const, content: q }];
    setMessages(next);
    setDraft('');
    setBusy('chat');
    setError(null);
    try {
      const reply = await askAssistant(next, snapshot());
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Pane title="AI coach" right={<Pressable onPress={() => setAiEnabled(false)}><Caption upper={false}>turn off</Caption></Pressable>}>
      <Pressable onPress={onProvider}>
        <Caption upper={false} style={{ marginBottom: margin }}>
          Answering: {providerLabel} · change ›
        </Caption>
      </Pressable>
      {unclear.length > 0 && (
        <>
          <Body muted>
            Payments to {unclear.length} {unclear.length === 1 ? 'person or merchant are' : 'people or merchants are'} filed under "Other".
          </Body>
          <Button title="Sort them out with the coach" variant="secondary" onPress={onSortOut} />
          <Separator />
        </>
      )}
      {messages.length === 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: margin / 2 }}>
          {STARTERS.map((s) => (
            <Chip key={s} label={s} onPress={() => send(s)} />
          ))}
        </View>
      )}
      {messages.map((m, i) => (
        <Bubble key={i} m={m} />
      ))}
      {busy === 'chat' && <ActivityIndicator color={t.accent} style={{ alignSelf: 'flex-start', margin: margin }} />}
      {error && <Body style={{ color: t.notOk, marginVertical: margin / 2 }}>{error}</Body>}

      <Row style={{ marginTop: margin }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about your money…"
          placeholderTextColor={t.caption}
          onSubmitEditing={() => send(draft)}
          returnKeyType="send"
          style={{
            flex: 1,
            color: t.text,
            backgroundColor: t.inputBackground,
            borderColor: t.paneBorder,
            borderWidth: 1,
            borderRadius: radius,
            paddingHorizontal: margin,
            paddingVertical: margin * 0.8,
            fontSize: fontSize.detail,
          }}
        />
        <Pressable onPress={() => send(draft)} disabled={!draft.trim() || !!busy} style={{ marginLeft: margin, opacity: draft.trim() ? 1 : 0.4 }}>
          <Body style={{ color: t.accent, fontWeight: '700' }}>Send</Body>
        </Pressable>
      </Row>
      <Caption upper={false} style={{ marginTop: margin / 2 }}>
        AI can be wrong. It's not a licensed financial adviser.
      </Caption>
    </Pane>
  );
}
