import { Model, Query } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

/** Re-render whenever the rows (or any field of them) matched by the query change. */
export function useQuery<T extends Model>(makeQuery: () => Query<T>, deps: unknown[] = []): T[] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    const sub = makeQuery()
      .observeWithColumns(columnsFor(makeQuery()))
      .subscribe(setRows);
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
}

function columnsFor<T extends Model>(q: Query<T>): string[] {
  const table = q.collection.database.schema.tables[q.collection.table];
  return Object.keys(table.columns);
}

/** Observe one record; undefined while loading, null if it does not exist. */
export function useRecord<T extends Model>(find: () => Promise<T>, deps: unknown[] = []): T | null | undefined {
  const [rec, setRec] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let sub: { unsubscribe(): void } | undefined;
    let cancelled = false;
    find()
      .then((r) => {
        if (cancelled) return;
        sub = r.observe().subscribe({ next: (x) => setRec(x as T), error: () => setRec(null) });
      })
      .catch(() => !cancelled && setRec(null));
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rec;
}
