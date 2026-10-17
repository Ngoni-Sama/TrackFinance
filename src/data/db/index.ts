import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { migrations } from './migrations';
import { modelClasses } from './models';
import { schema } from './schema';

// SQLite lives in app-private storage, so other apps cannot read it.
const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'trackfinance',
  jsi: false,
  onSetUpError: (error) => {
    console.error('[TrackFinance] database setup failed', error);
  },
});

export const database = new Database({ adapter, modelClasses });

export * from './models';
