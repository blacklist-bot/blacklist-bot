require('dotenv').config();

const {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  WebhookClient,
} = require('discord.js');
const { createBlacklistStore } = require('./blacklist-store');
const { parseAdminIds } = require('./authorization');
const { enforceBlacklist } = require('./blacklist-enforcement');
const { sendBlacklistNotice } = require('./blacklist-notifications');
const { resolveGuildName } = require('./source-guild-name');
const { createPagesPublisher } = require('./pages-publisher');
const { normalizeHttpUrl } = require('./url-validation');

const { DISCORD_TOKEN } = process.env;
const blacklistAdminIds = parseAdminIds(process.env.BLACKLIST_ADMIN_IDS);
const blacklistSourceGuildId = process.env.BLACKLIST_SOURCE_GUILD_ID || process.env.DISCORD_GUILD_ID;
const auditWebhook = process.env.BLACKLIST_AUDIT_WEBHOOK_URL
  ? new WebhookClient({ url: process.env.BLACKLIST_AUDIT_WEBHOOK_URL })
  : null;

if (!DISCORD_TOKEN) {
  console.error('Set DISCORD_TOKEN in your .env file.');
  process.exit(1);
}
if (!blacklistSourceGuildId) {
  console.error('Set BLACKLIST_SOURCE_GUILD_ID in your .env file.');
  process.exit(1);
}

const store = createBlacklistStore();
const pagesPublisher = createPagesPublisher();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

function reasonForBan(reason, actorId, sourceGuildId) {
  const detail = reason ? `: ${reason}` : '';
  const source = sourceGuildId ? ` (source server ${sourceGuildId})` : '';
  return `Blacklist added by ${actorId}${detail}${source}`.slice(0, 512);
}

async function getBlacklistSourceName() {
  return resolveGuildName(client, blacklistSourceGuildId);
}

async function syncPublicBlacklist() {
  const sourceName = await getBlacklistSourceName();
  return pagesPublisher.publish(store.list(blacklistSourceGuildId), sourceName);
}

async function sendBlacklistAudit(action, interaction, userId, reason, unbanned) {
  if (!auditWebhook) return;

  const embed = new EmbedBuilder()
    .setColor(action === 'added' ? 0xc0392b : 0x2980b9)
    .setTitle(`Blacklist entry ${action}`)
    .addFields(
      { name: 'User', value: `<@${userId}> (${userId})` },
      { name: 'Moderator', value: `<@${interaction.user.id}> (${interaction.user.id})` },
      { name: 'Source server', value: `${interaction.guild.name} (${interaction.guildId})` },
      { name: 'Reason', value: (reason || 'No reason provided').slice(0, 1024) },
    )
    .setTimestamp();

  if (typeof unbanned === 'boolean') {
    embed.addFields({ name: 'User unbanned', value: unbanned ? 'Yes' : 'No' });
  }

  try {
    await auditWebhook.send({ embeds: [embed] });
  } catch (error) {
    console.error('Could not send blacklist audit webhook:', error.message);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready as ${readyClient.user.tag}`);
  if (blacklistAdminIds.size === 0) {
    console.warn('BLACKLIST_ADMIN_IDS is empty; /blacklist management commands are disabled.');
  }
  if (!auditWebhook) {
    console.warn('BLACKLIST_AUDIT_WEBHOOK_URL is empty; blacklist audit embeds are disabled.');
  }
  void syncPublicBlacklist();
});

client.on(Events.GuildMemberAdd, async (member) => {
  const entry = store.get(member.guild.id, member.id);
  if (!entry) return;

  try {
    await member.ban({ reason: reasonForBan(entry.reason, entry.created_by) });
    console.log(`Banned blacklisted user ${member.id} in server ${member.guild.id}`);
  } catch (error) {
    console.error(`Could not enforce blacklist in server ${member.guild.id}:`, error.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  if (
    interaction.commandName === 'blacklist' &&
    ['add', 'remove'].includes(interaction.options.getSubcommand()) &&
    !blacklistAdminIds.has(interaction.user.id)
  ) {
    await interaction.reply({
      content: 'You are not authorized to manage this server\'s blacklist. Use /deep-search to check a user.',
      ephemeral: true,
    });
    return;
  }
  if (
    interaction.commandName === 'blacklist' &&
    ['add', 'remove'].includes(interaction.options.getSubcommand()) &&
    interaction.guildId !== blacklistSourceGuildId
  ) {
    const sourceName = await getBlacklistSourceName();
    await interaction.reply({
      content: `Blacklist entries can only be managed in **${sourceName}**.`,
      ephemeral: true,
    });
    return;
  }

  try {
    if (interaction.commandName === 'blacklist') {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'list') {
        const sourceName = await getBlacklistSourceName();
        const entries = store.list(blacklistSourceGuildId);
        if (entries.length === 0) {
          await interaction.reply({ content: `There are no blacklist entries from **${sourceName}**.`, ephemeral: true });
          return;
        }

        const pageSize = 10;
        const page = interaction.options.getInteger('page') ?? 1;
        const pageCount = Math.ceil(entries.length / pageSize);
        if (page > pageCount) {
          await interaction.reply({ content: `There are only ${pageCount} page(s).`, ephemeral: true });
          return;
        }

        const pageEntries = entries.slice((page - 1) * pageSize, page * pageSize);
        const lines = pageEntries.map((entry) => {
          const reason = entry.reason ? `: ${entry.reason.slice(0, 120)}` : '';
          return `• <@${entry.user_id}> (${entry.user_id})${reason}`;
        });
        await interaction.reply({
          content: `**${sourceName} server blacklist (${page}/${pageCount})**\n${lines.join('\n')}`,
          ephemeral: true,
        });
        return;
      }

      const userId = interaction.options.getString('user_id');
      if (!/^\d{17,20}$/.test(userId)) {
        await interaction.reply({ content: 'Enter a valid Discord user ID.', ephemeral: true });
        return;
      }

      if (subcommand === 'add') {
        const reason = interaction.options.getString('reason')?.trim() ?? '';
        const proofUrlInput = interaction.options.getString('proof_url')?.trim() ?? '';
        const proofUrl = normalizeHttpUrl(proofUrlInput);
        const proofImage = interaction.options.getAttachment('proof_image');
        if (proofUrlInput && !proofUrl) {
          await interaction.reply({ content: 'Proof links must use a valid http:// or https:// URL.', ephemeral: true });
          return;
        }
        if (store.get(blacklistSourceGuildId, userId)) {
          await interaction.reply({ content: `<@${userId}> is already on this server's blacklist.`, ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });
        store.add(
          blacklistSourceGuildId,
          userId,
          reason,
          interaction.user.id,
          proofUrl,
          proofImage?.url ?? '',
          proofImage?.contentType ?? '',
        );
        await sendBlacklistNotice(client, userId, interaction.guild, reason);
        try {
          await interaction.guild.members.ban(userId, { reason: reasonForBan(reason, interaction.user.id) });
        } catch (error) {
          store.remove(blacklistSourceGuildId, userId);
          throw error;
        }

        await syncPublicBlacklist();
        await sendBlacklistAudit('added', interaction, userId, reason);
          await interaction.editReply(`Blacklisted and banned <@${userId}> from this server.`);
        return;
      }

      if (subcommand === 'remove') {
        const reason = interaction.options.getString('reason')?.trim() ?? '';
        if (!store.remove(blacklistSourceGuildId, userId)) {
          await interaction.reply({ content: `<@${userId}> is not on this server's blacklist.`, ephemeral: true });
          return;
        }
        await syncPublicBlacklist();

        let unbanned = false;
        try {
          await interaction.guild.members.unban(userId, `Blacklist removed by ${interaction.user.id}`);
          unbanned = true;
        } catch (error) {
          if (error.code !== 10026) throw error;
        }

        await sendBlacklistAudit('removed', interaction, userId, reason, unbanned);
        const status = unbanned ? ' and unbanned them' : '';
        await interaction.reply({ content: `Removed <@${userId}> from this server's blacklist${status}.`, ephemeral: true });
        return;
      }

    }

    if (interaction.commandName === 'deep-search') {
      const entries = store.list(blacklistSourceGuildId);
      const sourceName = await getBlacklistSourceName();
      await interaction.deferReply({ ephemeral: true });
      const result = await enforceBlacklist(
        interaction.guild,
        entries,
        (entry) => reasonForBan(entry.reason, entry.created_by, entry.guild_id),
        store,
        blacklistSourceGuildId,
      );
      const failureNote = result.failedCount > 0
        ? ` Could not process ${result.failedCount} user(s); check the bot's role and permissions.`
        : '';
      await interaction.editReply(
        `Deep search checked ${result.checkedCount} blacklist entry/entries from **${sourceName}**, banned ${result.bannedCount}, unbanned ${result.unbannedCount} removed user(s), and skipped ${result.alreadyBannedCount} already-banned user(s).${failureNote}`,
      );
    }
  } catch (error) {
    console.error(`Command ${interaction.commandName} failed:`, error.message);
    const response = {
      content: 'The command failed. Check that the bot has Ban Members permission and that its role is above the target user.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('Could not log in to Discord:', error.message);
  process.exitCode = 1;
});