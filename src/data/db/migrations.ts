import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

// Bump schema.version and add a step here for every schema change after release.
export const migrations = schemaMigrations({ migrations: [] });
