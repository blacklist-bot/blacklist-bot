const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function createBlacklistStore(databasePath = process.env.DATABASE_PATH || 'data/blacklist.sqlite') {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }

  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS blacklist (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, user_id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS managed_blacklist_bans (
      target_guild_id TEXT NOT NULL,
      source_guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (target_guild_id, source_guild_id, user_id)
    )
  `);

  const addEntry = database.prepare(`
    INSERT OR IGNORE INTO blacklist (guild_id, user_id, reason, created_by)
    VALUES (?, ?, ?, ?)
  `);
  const getEntry = database.prepare(
    'SELECT guild_id, user_id, reason, created_by, created_at FROM blacklist WHERE guild_id = ? AND user_id = ?',
  );
  const removeEntry = database.prepare(
    'DELETE FROM blacklist WHERE guild_id = ? AND user_id = ?',
  );
  const listEntries = database.prepare(
    'SELECT guild_id, user_id, reason, created_by, created_at FROM blacklist WHERE guild_id = ? ORDER BY created_at DESC, user_id ASC',
  );
  const listAllEntries = database.prepare(
    'SELECT guild_id, user_id, reason, created_by, created_at FROM blacklist ORDER BY created_at DESC, guild_id ASC, user_id ASC',
  );
  const listManagedBans = database.prepare(
    'SELECT target_guild_id, source_guild_id, user_id FROM managed_blacklist_bans WHERE target_guild_id = ? AND source_guild_id = ?',
  );
  const addManagedBan = database.prepare(`
    INSERT OR IGNORE INTO managed_blacklist_bans (target_guild_id, source_guild_id, user_id)
    VALUES (?, ?, ?)
  `);
  const removeManagedBan = database.prepare(
    'DELETE FROM managed_blacklist_bans WHERE target_guild_id = ? AND source_guild_id = ? AND user_id = ?',
  );

  return {
    add(guildId, userId, reason, createdBy) {
      return addEntry.run(guildId, userId, reason, createdBy).changes === 1;
    },
    get: (guildId, userId) => getEntry.get(guildId, userId),
    remove: (guildId, userId) => removeEntry.run(guildId, userId).changes === 1,
    list: (guildId) => listEntries.all(guildId),
    listAll: () => listAllEntries.all(),
    listManagedBans: (targetGuildId, sourceGuildId) => listManagedBans.all(targetGuildId, sourceGuildId),
    addManagedBan: (targetGuildId, sourceGuildId, userId) =>
      addManagedBan.run(targetGuildId, sourceGuildId, userId).changes === 1,
    removeManagedBan: (targetGuildId, sourceGuildId, userId) =>
      removeManagedBan.run(targetGuildId, sourceGuildId, userId).changes === 1,
    close: () => database.close(),
  };
}

module.exports = { createBlacklistStore };