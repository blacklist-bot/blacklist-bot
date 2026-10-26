require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { createCommands } = require('./commands');

const { DISCORD_TOKEN, DISCORD_CLIENT_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Set DISCORD_TOKEN and DISCORD_CLIENT_ID in your .env file.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
const route = Routes.applicationCommands(DISCORD_CLIENT_ID);

const commands = createCommands();

rest
  .put(route, { body: commands })
  .then(() => {
    console.log(`Registered ${commands.length} global slash commands using label: Relay. Blacklists.`);
  })
  .catch((error) => {
    console.error('Failed to register slash commands:', error.message);
    process.exitCode = 1;
  });