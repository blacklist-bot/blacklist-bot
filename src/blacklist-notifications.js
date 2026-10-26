const { EmbedBuilder } = require('discord.js');

async function sendBlacklistNotice(client, userId, guild, reason) {
  try {
    const user = await client.users.fetch(userId);
    const embed = new EmbedBuilder()
      .setColor(0xc0392b)
      .setTitle('You have been blacklisted')
      .setDescription(`An administrator added your account to the blacklist for **${guild.name}**.`)
      .addFields({ name: 'Reason', value: (reason || 'No reason provided').slice(0, 1024) })
      .setTimestamp();

    await user.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.warn(`Could not DM blacklisted user ${userId}:`, error.message);
    return false;
  }
}

module.exports = { sendBlacklistNotice };