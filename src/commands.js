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
    new SlashCommandBuilder()
      .setName('report-user')
      .setDescription('Submit a user report for admin review')
      .setDefaultMemberPermissions(null)
      .addStringOption((option) =>
        option
          .setName('user_id')
          .setDescription('Discord user ID to report')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('reason')
          .setDescription('Why this user should be reviewed')
          .setMinLength(5)
          .setMaxLength(1000)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('proof_url')
          .setDescription('Link to evidence (provide this or an image)')
          .setMaxLength(2000)
          .setRequired(false),
      )
      .addAttachmentOption((option) =>
        option
          .setName('proof_image')
          .setDescription('Evidence image (provide this or a URL)')
          .setRequired(false),
      ),
  ].map((command) => command.toJSON());
}

module.exports = { createCommands, commands: createCommands() };