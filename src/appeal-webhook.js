const { EmbedBuilder } = require('discord.js');

function parseAppeal(input) {
  const userId = String(input.userId || '').trim();
  const blacklistReason = String(input.blacklistReason || '').trim();
  const appealStatement = String(input.appealStatement || '').trim();

  if (!/^\d{17,20}$/.test(userId)) throw new Error('Enter a valid Discord user ID.');
  if (blacklistReason.length < 5 || blacklistReason.length > 1000) {
    throw new Error('Enter the original blacklist reason (5 to 1,000 characters).');
  }
  if (appealStatement.length < 10 || appealStatement.length > 1500) {
    throw new Error('Appeal explanation must be between 10 and 1,500 characters.');
  }

  return { userId, blacklistReason, appealStatement };
}

async function sendAppeal(webhook, appeal) {
  const embed = new EmbedBuilder()
    .setColor(0x91a778)
    .setTitle('Blacklist appeal for review')
    .addFields(
      { name: 'User ID', value: appeal.userId },
      { name: 'Original blacklist reason', value: appeal.blacklistReason.slice(0, 1024) },
      { name: 'Why the appeal should be accepted', value: appeal.appealStatement.slice(0, 1024) },
      { name: 'Submitted via', value: 'Website' },
    )
    .setTimestamp();

  await webhook.send({ embeds: [embed] });
}

module.exports = { parseAppeal, sendAppeal };