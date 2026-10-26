# Discord Blacklist Bot

A Discord slash-command bot that maintains a separate blacklist for each server. It bans blacklisted users when added and when they join that server.

## Requirements

- Node.js 20 or newer
- A Discord application and bot token
- The bot invited to your server with the `bot` and `applications.commands` scopes, and the `Ban Members` permission
- `Server Members Intent` enabled in the Discord Developer Portal for automatic bans when blacklisted users join

## Configure

1. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `BLACKLIST_ADMIN_IDS`.
2. Set `BLACKLIST_ADMIN_IDS` to a comma-separated list of Discord user IDs allowed to use `/blacklist`, including its list subcommand. For example: `123456789012345678,234567890123456789`. Leave it empty to disable blacklist management.
3. `BLACKLIST_SOURCE_GUILD_ID` selects the server whose blacklist is authoritative. It defaults to `DISCORD_GUILD_ID`; the configured source is `1558856606966353942`.
4. Set `BLACKLIST_AUDIT_WEBHOOK_URL` to a newly created private Discord webhook URL to receive add/remove embeds. Keep it secret; if a webhook URL has been shared, delete it and create a replacement.
5. Set `GITHUB_PAGES_TOKEN` to a GitHub token with Contents read/write permission for `blacklist-bot/blacklist-bot`. The bot uses it to publish the public JSON snapshot. Never put this token in the website files.
6. Install dependencies with `npm install`.

Keep `.env` private. Do not commit your bot token. The SQLite database is stored at `data/blacklist.sqlite` by default; use a persistent disk when hosting the bot.

## Run

```sh
npm run deploy
npm start
```

`npm run deploy` registers `/blacklist add`, `/blacklist remove`, `/blacklist list`, and `/deep-search` globally. They become available in servers where the bot is installed with the `applications.commands` scope; global updates can take up to an hour to appear. Start the bot and keep it running for the commands to respond. Use a process manager or hosting provider to keep it online.

`/blacklist add` and `/blacklist remove` take a Discord user ID and are restricted to `BLACKLIST_ADMIN_IDS` in the source server only. Adding a user attempts to DM them an embed with the blacklist reason before banning; blocked DMs do not prevent the ban. Both commands accept an optional reason, which is included with the user, moderator, and server in the audit webhook embed after the action succeeds. `/blacklist list` is available to all users and displays the source server's entries. `/deep-search` can be used by anyone in a server; it bans users on the source server's blacklist and unbans users previously banned by deep search who have since been removed from that blacklist. It does not remove unrelated/manual bans. The bot needs the `Ban Members` permission and a role above its targets. Responses and list contents are visible only to the command user. Enable Server Members Intent in the Developer Portal for join-time enforcement.

The public site is available at `https://blacklist-bot.github.io/blacklist-bot/`. It publishes only Discord user IDs and dates; reasons and moderator IDs are not included. The bot refreshes the public snapshot on startup and after source blacklist additions/removals. Removed users disappear from the current published snapshot, though earlier public Git history may retain prior snapshots.

## Tests

```sh
npm test
```
