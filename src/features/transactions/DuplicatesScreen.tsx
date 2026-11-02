import { format } from 'date-fns';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, EmptyState, Row, Screen } from '../../components/Controls';
import { MerchantAvatar } from '../../components/MerchantAvatar';
import { Pane, Separator } from '../../components/Pane';
import { Body, Caption } from '../../components/Typography';
import { formatMoney } from '../../core/currency';
import { DedupeRow, DuplicateGroup } from '../../core/dedupe';
import { margin, useTheme } from '../../core/theme';
import { dismissDuplicate, loadDuplicateGroups, removeDuplicates } from '../../data/repositories';

function Copy({ r, label, color }: { r: DedupeRow; label: string; color: string }) {
  return (
    <Row style={{ alignItems: 'flex-start', paddingVertical: 6 }}>
      <View style={{ marginRight: margin }}>
        <MerchantAvatar name={r.counterparty || r.senderId} size={32} />
      </View>
      <View style={{ flex: 1 }}>
        <Caption upper={false} style={{ color }}>
          {label} · {r.senderId} · {format(r.occurredAt, 'd MMM, HH:mm')}
        </Caption>
        <Body numberOfLines={3}>{r.rawBody}</Body>
      </View>
    </Row>
  );
}

/** Lists duplicates saved before the duplicate fix and lets the user remove them, one group at a time. */
export function DuplicatesScreen() {
  const t = useTheme();
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => loadDuplicateGroups().then(setGroups), []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!groups) return <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />;

  return (
    <Screen>
      {groups.length === 0 ? (
        <EmptyState text="No duplicates found. New SMS are checked automatically before they are saved." />
      ) : (
        <>
          <Body muted style={{ marginBottom: margin }}>
            {groups.length} payment{groups.length === 1 ? ' was' : 's were'} saved more than once. Removing a duplicate keeps the first copy and deletes the extra.
          </Body>
          {groups.length > 1 && (
            <Button
              title={`Remove all ${groups.reduce((a, g) => a + g.remove.length, 0)} duplicates`}
              variant="danger"
              loading={busy}
              onPress={() => act(async () => {
                for (const g of groups) await removeDuplicates(g);
              })}
            />
          )}
          {groups.map((g) => (
            <Pane key={g.key} title={formatMoney(g.keep.amount, g.keep.currency)} right={<Caption upper={false}>{g.reason}</Caption>}>
              <Copy r={g.keep} label="Keep" color={t.ok} />
              {g.remove.map((r) => (
                <Copy key={r.id} r={r} label="Duplicate" color={t.notOk} />
              ))}
              <Separator />
              <Row style={{ gap: margin }}>
                <Button title="Remove duplicate" variant="danger" disabled={busy} onPress={() => act(() => removeDuplicates(g))} style={{ flex: 1 }} />
                <Button title="Not a duplicate" variant="secondary" disabled={busy} onPress={() => act(() => dismissDuplicate(g))} style={{ flex: 1 }} />
              </Row>
            </Pane>
          ))}
        </>
      )}
    </Screen>
  );
}
