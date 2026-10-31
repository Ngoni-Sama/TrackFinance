import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { migrations } from './migrations';
import { modelClasses } from './models';
import { schema } from './schema';

// Web build (demo / screenshots only): IndexedDB via LokiJS instead of SQLite.
const adapter = new LokiJSAdapter({
  schema,
  migrations,
  dbName: 'trackfinance',
  useWebWorker: false,
  useIncrementalIndexedDB: true,
});

export const database = new Database({ adapter, modelClasses });

export * from './models';
