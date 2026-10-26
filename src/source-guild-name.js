async function resolveGuildName(client, guildId) {
  const cachedGuild = client.guilds.cache.get(guildId);
  if (cachedGuild) return cachedGuild.name;

  try {
    const guild = await client.guilds.fetch(guildId);
    return guild.name;
  } catch {
    return 'source server';
  }
}

module.exports = { resolveGuildName };