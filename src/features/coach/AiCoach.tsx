import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, TextInput, View } from 'react-native';
import { askAssistant, ChatMessage, explainPayments, isAssistantConfigured, Suggestion } from '../../ai/assistant';
import { Button, Chip, Row } from '../../components/Controls';
import { MerchantAvatar } from '../../components/MerchantAvatar';
import { Pane, Separator } from '../../components/Pane';
import { Body, Caption, Title } from '../../components/Typography';
import { categoryLabel } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import { useSettingsStore } from '../../core/settingsStore';
import { Entry } from '../../core/summaries';
import { fontSize, margin, radius, useTheme } from '../../core/theme';
import { find, recategoriseTransaction } from '../../data/repositories';
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

export function AiCoach({ snapshot, unclear }: { snapshot: (toExplain?: string[]) => string; unclear: Entry[] }) {
  const t = useTheme();
  const enabled = useSettingsStore((s) => s.aiEnabled);
  const [disclosure, setDisclosure] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'chat' | 'explain' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

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

  const explain = async () => {
    setBusy('explain');
    setError(null);
    try {
      setSuggestions(await explainPayments(snapshot(unclear.map((u) => u.id))));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const apply = async (s: Suggestion) => {
    const tx = await find.transaction(s.id).catch(() => null);
    if (!tx) return;
    await recategoriseTransaction(tx, s.category);
    setApplied((a) => new Set(a).add(s.id));
  };

  const byId = new Map(unclear.map((u) => [u.id, u]));

  return (
    <Pane title="AI coach" right={<Pressable onPress={() => setAiEnabled(false)}><Caption upper={false}>turn off</Caption></Pressable>}>
      {unclear.length > 0 && (
        <>
          <Body muted>
            Payments to {unclear.length} {unclear.length === 1 ? 'person or merchant are' : 'people or merchants are'} filed under "Other".
          </Body>
          <Button title={`Guess what ${unclear.length === 1 ? 'it was' : 'they were'} for`} variant="secondary" onPress={explain} loading={busy === 'explain'} />
        </>
      )}
      {suggestions && (
        <View style={{ marginBottom: margin }}>
          {suggestions.length === 0 && <Body muted>The coach couldn't make a confident guess.</Body>}
          {suggestions
            .filter((s) => byId.has(s.id))
            .map((s) => {
              const e = byId.get(s.id)!;
              const done = applied.has(s.id);
              return (
                <Row key={s.id} style={{ paddingVertical: 6, alignItems: 'flex-start' }}>
                  <View style={{ marginRight: margin }}>
                    <MerchantAvatar name={e.title} category={s.category} size={32} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1}>
                      {e.title} · {formatMoney(e.amount, e.currency)}
                    </Body>
                    <Caption upper={false}>
                      {categoryLabel(s.category)} ({s.confidence}) — {s.reason}
                    </Caption>
                  </View>
                  <Pressable onPress={() => apply(s)} disabled={done} style={{ marginLeft: margin }}>
                    <Body style={{ color: done ? t.ok : t.accent, fontWeight: '600' }}>{done ? 'Done' : 'Apply'}</Body>
                  </Pressable>
                </Row>
              );
            })}
          <Separator />
        </View>
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
