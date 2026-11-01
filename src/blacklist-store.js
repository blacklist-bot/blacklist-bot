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
      username TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      proof_url TEXT NOT NULL DEFAULT '',
      proof_image_url TEXT NOT NULL DEFAULT '',
      proof_image_type TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, user_id)
    )
  `);
  const columns = new Set(database.pragma('table_info(blacklist)').map((column) => column.name));
  for (const column of ['username', 'proof_url', 'proof_image_url', 'proof_image_type']) {
    if (!columns.has(column)) {
      database.exec(`ALTER TABLE blacklist ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS managed_blacklist_bans (
      target_guild_id TEXT NOT NULL,
      source_guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (target_guild_id, source_guild_id, user_id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS blacklist_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('added', 'removed')),
      username TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      proof_url TEXT NOT NULL DEFAULT '',
      proof_image_url TEXT NOT NULL DEFAULT '',
      proof_image_type TEXT NOT NULL DEFAULT '',
      action_reason TEXT NOT NULL DEFAULT '',
      actor_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const addEntry = database.prepare(`
    INSERT OR IGNORE INTO blacklist (
      guild_id, user_id, username, reason, proof_url, proof_image_url, proof_image_type, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getEntry = database.prepare(
    'SELECT guild_id, user_id, username, reason, proof_url, proof_image_url, proof_image_type, created_by, created_at FROM blacklist WHERE guild_id = ? AND user_id = ?',
  );
  const removeEntry = database.prepare(
    'DELETE FROM blacklist WHERE guild_id = ? AND user_id = ?',
  );
  const listEntries = database.prepare(
    'SELECT guild_id, user_id, username, reason, proof_url, proof_image_url, proof_image_type, created_by, created_at FROM blacklist WHERE guild_id = ? ORDER BY created_at DESC, user_id ASC',
  );
  const listAllEntries = database.prepare(
    'SELECT guild_id, user_id, username, reason, proof_url, proof_image_url, proof_image_type, created_by, created_at FROM blacklist ORDER BY created_at DESC, guild_id ASC, user_id ASC',
  );
  const updateUsername = database.prepare(
    'UPDATE blacklist SET username = ? WHERE guild_id = ? AND user_id = ?',
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
  const insertHistoryEntry = database.prepare(`
    INSERT INTO blacklist_history (
      guild_id, user_id, action, username, reason, proof_url, proof_image_url,
      proof_image_type, action_reason, actor_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listHistoryEntries = database.prepare(`
    SELECT guild_id, user_id, action, username, reason, proof_url, proof_image_url,
      proof_image_type, action_reason, actor_id, created_at
    FROM blacklist_history
    WHERE guild_id = ? AND user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `);
  const listLatestHistoryActions = database.prepare(`
    SELECT event.user_id, event.action
    FROM blacklist_history AS event
    WHERE event.guild_id = ?
      AND event.id = (
        SELECT MAX(latest.id)
        FROM blacklist_history AS latest
        WHERE latest.guild_id = event.guild_id AND latest.user_id = event.user_id
      )
  `);
  const listLatestRemovedUserIds = database.prepare(`
    SELECT event.user_id
    FROM blacklist_history AS event
    WHERE event.guild_id = ? AND event.action = 'removed'
      AND event.id = (
        SELECT MAX(latest.id)
        FROM blacklist_history AS latest
        WHERE latest.guild_id = event.guild_id AND latest.user_id = event.user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM blacklist AS current
        WHERE current.guild_id = event.guild_id AND current.user_id = event.user_id
      )
  `);

  return {
    add(guildId, userId, reason, createdBy, proofUrl = '', proofImageUrl = '', proofImageType = '', username = '') {
      return addEntry.run(
        guildId,
        userId,
        username,
        reason,
        proofUrl,
        proofImageUrl,
        proofImageType,
        createdBy,
      ).changes === 1;
    },
    get: (guildId, userId) => getEntry.get(guildId, userId),
    updateUsername: (guildId, userId, username) => updateUsername.run(username, guildId, userId).changes === 1,
    remove: (guildId, userId) => removeEntry.run(guildId, userId).changes === 1,
    list: (guildId) => listEntries.all(guildId),
    listAll: () => listAllEntries.all(),
    recordHistory(guildId, userId, action, actorId, entry, actionReason = '') {
      return insertHistoryEntry.run(
        guildId,
        userId,
        action,
        entry.username || '',
        entry.reason || '',
        entry.proof_url || '',
        entry.proof_image_url || '',
        entry.proof_image_type || '',
        actionReason,
        actorId,
      ).changes === 1;
    },
    history: (guildId, userId, limit = 10) => listHistoryEntries.all(guildId, userId, limit),
    latestHistoryActions: (guildId) => listLatestHistoryActions.all(guildId),
    removedUserIds: (guildId) => listLatestRemovedUserIds.all(guildId).map((row) => row.user_id),
    listManagedBans: (targetGuildId, sourceGuildId) => listManagedBans.all(targetGuildId, sourceGuildId),
    addManagedBan: (targetGuildId, sourceGuildId, userId) =>
      addManagedBan.run(targetGuildId, sourceGuildId, userId).changes === 1,
    removeManagedBan: (targetGuildId, sourceGuildId, userId) =>
      removeManagedBan.run(targetGuildId, sourceGuildId, userId).changes === 1,
    close: () => database.close(),
  };
}

module.exports = { createBlacklistStore };