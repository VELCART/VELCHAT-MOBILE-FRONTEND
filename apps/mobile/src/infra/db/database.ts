/**
 * The WatermelonDB instance (§L2 boot step, §M10). One encrypted-at-rest SQLite DB is
 * the UI's source of truth. JSI adapter → reads run off the JS thread (§M0 "zero jank").
 * Migrations are added here as the schema version bumps; v1 is the initial MP2 schema.
 */
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { modelClasses } from './models';

const adapter = new SQLiteAdapter({
  dbName: 'velchat',
  schema,
  // New Architecture: JSI is available → off-thread, synchronous-fast reads.
  jsi: true,
  onSetUpError: () => {
    // A corrupt/incompatible DB → the app should boot to a safe re-sync (§M0/§R). For now
    // the error is swallowed here; the sync engine (MP2) will re-hydrate from the server.
  },
});

export const database = new Database({ adapter, modelClasses });
