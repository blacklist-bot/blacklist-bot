async function enforceBlacklist(guild, entries, getBanReason, store, sourceGuildId) {
  const uniqueEntries = [...new Map(entries.map((entry) => [entry.user_id, entry])).values()];
  const activeUserIds = new Set(uniqueEntries.map((entry) => entry.user_id));
  const managedBans = store.listManagedBans(guild.id, sourceGuildId);
  const existingBans = await guild.bans.fetch();
  let bannedCount = 0;
  let alreadyBannedCount = 0;
  let unbannedCount = 0;
  let failedCount = 0;

  for (const managedBan of managedBans) {
    if (activeUserIds.has(managedBan.user_id)) continue;

    if (!existingBans.has(managedBan.user_id)) {
      store.removeManagedBan(guild.id, sourceGuildId, managedBan.user_id);
      continue;
    }

    try {
      await guild.members.unban(managedBan.user_id, 'Removed from the source blacklist');
      store.removeManagedBan(guild.id, sourceGuildId, managedBan.user_id);
      unbannedCount += 1;
    } catch (error) {
      if (error.code === 10026) {
        store.removeManagedBan(guild.id, sourceGuildId, managedBan.user_id);
      } else {
        failedCount += 1;
        console.error(`Could not unban removed blacklist user ${managedBan.user_id} in server ${guild.id}:`, error.message);
      }
    }
  }

  for (const entry of uniqueEntries) {
    if (existingBans.has(entry.user_id)) {
      alreadyBannedCount += 1;
      continue;
    }

    try {
      await guild.members.ban(entry.user_id, { reason: getBanReason(entry) });
      bannedCount += 1;
      store.addManagedBan(guild.id, sourceGuildId, entry.user_id);
    } catch (error) {
      failedCount += 1;
      console.error(`Could not ban blacklisted user ${entry.user_id} in server ${guild.id}:`, error.message);
    }
  }

  return {
    checkedCount: uniqueEntries.length,
    bannedCount,
    alreadyBannedCount,
    unbannedCount,
    failedCount,
  };
}

module.exports = { enforceBlacklist };