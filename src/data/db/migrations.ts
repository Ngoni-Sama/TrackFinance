import { addColumns, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

// Bump schema.version and add a step here for every schema change.
export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'transactions',
          columns: [
            { name: 'note', type: 'string', isOptional: true },
            { name: 'user_categorised', type: 'boolean', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
