/**
 * The migration chain is a DATA-SAFETY contract (§L2/§M10).
 *
 * WatermelonDB resets a database whose version it cannot migrate — silently wiping the user's
 * entire local history on an app update. So every schema version must have a step, the steps must
 * be ordered, and the newest step must reach the schema's current version. A mismatch here is not
 * a failing test in the abstract; it is every existing install losing its chats on the next release.
 */
import { schema } from '../schema';
import { migrations } from '../migrations';

interface Step {
  toVersion: number;
}

function steps(): Step[] {
  return (migrations as unknown as { sortedMigrations: Step[] })
    .sortedMigrations;
}

describe('schema migrations', () => {
  it('can migrate an install up to the schema the app now ships', () => {
    const versions = steps().map(m => m.toVersion);
    expect(Math.max(...versions)).toBe(schema.version);
  });

  it('covers every version from the first release onward, with no hole', () => {
    // A missing intermediate version makes WatermelonDB give up and reset the database, so an
    // install that skipped a release is exactly the one that loses its data.
    const versions = steps()
      .map(m => m.toVersion)
      .sort((a, b) => a - b);
    for (let v = 2; v <= schema.version; v++) {
      expect(versions).toContain(v);
    }
  });

  it('declares each version exactly once', () => {
    const versions = steps().map(m => m.toVersion);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('indexes the chat list query, which is ordered as well as filtered', () => {
    // `WHERE is_archived AND last_message_at > 0 ORDER BY is_pinned DESC, last_message_at DESC`
    // cannot be satisfied by the separate single-column indexes: SQLite picks one, then sorts the
    // whole remaining set in memory on every emission — and this query re-runs on EVERY write to
    // the table.
    const sql = JSON.stringify(steps());
    expect(sql).toContain('conversations');
    expect(sql).toMatch(/is_archived.*is_pinned.*last_message_at/);
  });

  it('indexes the message window query the chat screen subscribes to', () => {
    const sql = JSON.stringify(steps());
    expect(sql).toMatch(/messages.*conversation_id.*created_at/);
  });
});

/**
 * VC-024, generalised: a column has to exist on BOTH paths into a database.
 *
 * A fresh install never runs the migration chain — WatermelonDB emits DDL from `schema.ts` alone
 * via `_setUpWithSchema` — while an upgrade never re-runs the schema. So a column added to one and
 * not the other produces a database that is missing it for half the userbase, and the failure is
 * invisible until a query touches that column on the wrong kind of install.
 *
 * These assert the DDL WatermelonDB ACTUALLY generates, using its own encoder, rather than the
 * shape of the objects we hand it. That distinction matters here: whether `isIndexed` emits an
 * index on an `addColumns` step is a property of the library, not of our config, and a test that
 * re-reads our own config could not tell us we were wrong about it.
 */
/**
 * WatermelonDB's own DDL encoder. Pulled in with `requireActual` + a local type rather than a
 * plain import because the package ships no types for this internal subpath: an ambient
 * `declare module` would silence that everywhere, including in production code, to buy one
 * test file a convenience. The surface used here is two pure string builders.
 */
const { encodeSchema, encodeMigrationSteps } = jest.requireActual(
  '@nozbe/watermelondb/adapters/sqlite/encodeSchema',
) as {
  encodeSchema: (appSchema: unknown) => string;
  encodeMigrationSteps: (steps: unknown) => string;
};

describe('server_msg_id exists on both paths into the database', () => {
  const freshInstallSql = (): string => encodeSchema(schema);
  const upgradeSql = (): string =>
    encodeMigrationSteps(
      (
        migrations as unknown as {
          sortedMigrations: { toVersion: number; steps: unknown[] }[];
        }
      ).sortedMigrations.flatMap(m => m.steps),
    );

  it('creates the column on a fresh install', () => {
    expect(freshInstallSql()).toMatch(
      /create table "messages".*"server_msg_id"/s,
    );
  });

  it('adds the column on an upgrade', () => {
    expect(upgradeSql()).toMatch(/alter table "messages" add "server_msg_id"/);
  });

  it('indexes it on a fresh install', () => {
    // The quoted-reply lookup filters on this column for every window that contains a reply.
    expect(freshInstallSql()).toMatch(
      /create index if not exists "messages_server_msg_id" on "messages" \("server_msg_id"\)/,
    );
  });

  it('indexes it on an upgrade too, so an upgraded install is not the slow one', () => {
    // WatermelonDB's `addColumns` step DOES emit the index for an `isIndexed` column
    // (`encodeAddColumnsMigrationStep` calls `encodeIndex`) — unlike adding an index to a
    // PRE-EXISTING column, which still needs `unsafeExecuteSql` (see the v3 step).
    expect(upgradeSql()).toMatch(
      /create index if not exists "messages_server_msg_id" on "messages" \("server_msg_id"\)/,
    );
  });

  it('back-fills the column as NULL rather than leaving it absent on upgraded rows', () => {
    // Every row that predates the migration has no server id, and `findQuotedMessages` must read
    // that as "unknown" — an absent column would make the query itself fail instead.
    expect(upgradeSql()).toMatch(
      /update "messages" set "server_msg_id" = null/,
    );
  });
});
