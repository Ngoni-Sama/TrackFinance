import React, { useEffect, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { forgetKey, loadAiConfig, loadProviderSettings, providerInfo, PROVIDERS, readKey, saveAiConfig } from '../../ai/config';
import { claudeTest } from '../../ai/providers/claude';
import { geminiTest } from '../../ai/providers/gemini';
import { openaiTest } from '../../ai/providers/openai';
import { AiProviderId } from '../../ai/types';
import { Button, Row, Screen, Segmented, TextField } from '../../components/Controls';
import { Pane } from '../../components/Pane';
import { Body, Caption } from '../../components/Typography';
import { fontSize, margin, radius, useTheme } from '../../core/theme';
import { ScreenProps } from '../../navigation/RootNavigator';

const IDS = PROVIDERS.map((p) => p.id);
const LABELS = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.label])) as Record<AiProviderId, string>;

/** Choose who answers the AI coach: the free Cloudflare server, or Claude / OpenAI / Gemini with the user's own key. */
export function AiProviderScreen({ navigation }: ScreenProps<'AiProvider'>) {
  const t = useTheme();
  const [provider, setProvider] = useState<AiProviderId>('cloudflare');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const info = providerInfo(provider);

  useEffect(() => {
    loadAiConfig().then((c) => setProvider(c.provider));
  }, []);

  useEffect(() => {
    loadProviderSettings(provider).then((s) => {
      setModel(s.model);
      setHasKey(s.hasKey);
      setKey('');
      setStatus(null);
    });
  }, [provider]);

  const test = async (apiKey: string) => {
    if (provider === 'claude') return claudeTest(apiKey, model);
    if (provider === 'openai') return openaiTest(apiKey, model);
    if (provider === 'gemini') return geminiTest(apiKey, model);
  };

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      if (info.needsKey) {
        const k = key.trim() || (await readKey(provider));
        if (!k) throw new Error('Paste your API key first.');
        await test(k);
        await saveAiConfig(provider, model, k);
      } else {
        await saveAiConfig(provider, model);
      }
      setHasKey(true);
      setKey('');
      setStatus({ ok: true, text: `Saved. The coach now uses ${info.label}${info.needsKey ? ` (${model})` : ''}.` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Pane title="Who answers">
        <Segmented options={IDS} value={provider} onChange={setProvider} labels={LABELS} />
        <Body muted>
          {provider === 'cloudflare'
            ? 'Free, no key needed. Limited to about 45 questions a day across all users.'
            : `Uses your own ${info.label} API key, billed by ${info.label}${provider === 'gemini' ? ' (Google AI Studio keys include a free tier)' : ''}. Answers are usually more accurate than the free assistant.`}
        </Body>
        <Caption upper={false} style={{ marginTop: margin / 2 }}>
          Your data goes to {info.dataGoesTo}.
        </Caption>
      </Pane>

      {info.needsKey && (
        <Pane title="API key">
          {hasKey && <Body style={{ color: t.ok, marginBottom: margin / 2 }}>A key is saved on this phone.</Body>}
          <Caption upper={false} style={{ marginBottom: 4 }}>
            {hasKey ? 'Paste a new key to replace it' : 'Paste your key'}
          </Caption>
          <TextInput
            value={key}
            onChangeText={setKey}
            placeholder={info.keyHint}
            placeholderTextColor={t.caption}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              color: t.text,
              backgroundColor: t.inputBackground,
              borderColor: t.paneBorder,
              borderWidth: 1,
              borderRadius: radius,
              paddingHorizontal: margin,
              paddingVertical: margin * 0.8,
              fontSize: fontSize.detail,
              marginBottom: margin,
            }}
          />
          <TextField label="Model" value={model} onChangeText={setModel} placeholder={info.defaultModel} />
          <Caption upper={false}>
            Stored in the phone's secure storage and sent only to {info.label}. TrackFinance's server never sees it.
          </Caption>
          {info.keyUrl ? (
            <Body style={{ color: t.accent, marginTop: margin }} onPress={() => Linking.openURL(info.keyUrl!)}>
              Get a {info.label} API key ›
            </Body>
          ) : null}
          {provider === 'gemini' ? (
            <Caption upper={false} style={{ marginTop: margin / 2 }}>
              The Gemini assistant built into Samsung and Pixel phones can't be used by other apps; a free Gemini API key from Google AI Studio works on any phone.
            </Caption>
          ) : null}
          {hasKey ? (
            <Body
              style={{ color: t.notOk, marginTop: margin }}
              onPress={async () => {
                await forgetKey(provider);
                setHasKey(false);
                setStatus({ ok: true, text: 'Key removed from this phone.' });
              }}
            >
              Remove saved key
            </Body>
          ) : null}
        </Pane>
      )}

      {status && (
        <View style={{ marginBottom: margin }}>
          <Body style={{ color: status.ok ? t.ok : t.notOk }}>{status.text}</Body>
        </View>
      )}
      <Row style={{ gap: margin }}>
        <Button title={info.needsKey ? 'Test & save' : 'Use free assistant'} onPress={save} loading={busy} style={{ flex: 1 }} />
        <Button title="Done" variant="secondary" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
