const { SlashCommandBuilder } = require('discord.js');

const blacklistLabel = 'Relay. Blacklists';

function createCommands() {

  return [
    new SlashCommandBuilder()
      .setName('blacklist')
      .setDescription(`Manage ${blacklistLabel}`)
      .setDefaultMemberPermissions(null)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('add')
          .setDescription(`Add and ban a user with ${blacklistLabel}`)
          .addStringOption((option) =>
            option
              .setName('user_id')
              .setDescription('Discord user ID to blacklist')
              .setMinLength(17)
              .setMaxLength(20)
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName('reason')
              .setDescription('Reason for the blacklist')
              .setMaxLength(400)
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName('proof_url')
              .setDescription('Public link to evidence or an image')
              .setMaxLength(500)
              .setRequired(false),
          )
          .addAttachmentOption((option) =>
            option
              .setName('proof_image')
              .setDescription('Upload an evidence image')
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('remove')
          .setDescription(`Remove a user from ${blacklistLabel}`)
          .addStringOption((option) =>
            option
              .setName('user_id')
              .setDescription('Discord user ID to remove')
              .setMinLength(17)
              .setMaxLength(20)
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName('reason')
              .setDescription('Reason for removing the blacklist entry')
              .setMaxLength(400)
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('list')
          .setDescription(`List users in ${blacklistLabel}`)
          .addIntegerOption((option) =>
            option
              .setName('page')
              .setDescription('Page number')
              .setMinValue(1)
              .setRequired(false),
          ),
      ),
    new SlashCommandBuilder()
      .setName('deep-search')
      .setDescription(`Ban users in ${blacklistLabel}`)
      .setDefaultMemberPermissions(null),
  ].map((command) => command.toJSON());
}

module.exports = { createCommands, commands: createCommands() };