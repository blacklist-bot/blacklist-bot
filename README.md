# Discord Blacklist Bot

A Discord slash-command bot that maintains a separate blacklist for each server. It bans blacklisted users when added and when they join that server.

## Requirements

- Node.js 20 or newer
- A Discord application and bot token
- The bot invited to your server with the `bot` and `applications.commands` scopes, and the `Ban Members` permission
- `Server Members Intent` enabled in the Discord Developer Portal for automatic bans when blacklisted users join

## Configure

1. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `BLACKLIST_ADMIN_IDS`.
2. Set `BLACKLIST_ADMIN_ROLE_ID` to the source-server role allowed to add/remove entries (defaults to `1564786163401752617`). Users with Ban Members permission in the source server can also manage entries. `BLACKLIST_ADMIN_IDS` remains an optional list of additional manager IDs.
3. `BLACKLIST_SOURCE_GUILD_ID` selects the server whose blacklist is authoritative. It defaults to `DISCORD_GUILD_ID`; the configured source is `1558856606966353942`.
4. Set `BLACKLIST_AUDIT_WEBHOOK_URL` to a newly created private Discord webhook URL to receive add/remove embeds. Keep it secret; if a webhook URL has been shared, delete it and create a replacement.
5. Set `REPORT_WEBHOOK_URL` for website reports and `APPEAL_WEBHOOK_URL` for appeals. Set `REPORT_API_PORT=3000` and expose that Codespaces port as public. Website reports and appeals do not require sign-in; submissions are sent to admins for review and never automatically change blacklist status. The appeal webhook URL supplied in chat was exposed; rotate it and use the replacement privately in `.env`.
6. Set `GITHUB_PAGES_TOKEN` to a GitHub token with Contents read/write permission for `blacklist-bot/blacklist-bot`. The bot uses it to publish the public JSON snapshot. Never put this token in the website files.
7. Install dependencies with `npm install`.

Keep `.env` private. Do not commit your bot token. The SQLite database is stored at `data/blacklist.sqlite` by default; use a persistent disk when hosting the bot.

## Run

```sh
npm run deploy
npm start
```

`npm run deploy` registers `/blacklist add`, `/blacklist remove`, `/blacklist list`, `/deep-search`, `/check-user`, and `/report-user` globally. They become available in servers where the bot is installed with the `applications.commands` scope; global updates can take up to an hour to appear. Start the bot and keep it running for the commands to respond. Use a process manager or hosting provider to keep it online.

`/report-user` accepts a Discord user ID, reason, and either a proof URL or uploaded image. It sends a review embed to `REPORT_WEBHOOK_URL`; admins must review and add a blacklist entry separately. Website reports use the fixed reporter label `Website visitor`.

`/check-user` shows a user's current source-server blacklist status and up to five recorded add/remove events, with reasons and evidence. The website's **Appeal Blacklist** form submits the user ID, original blacklist reason, and appeal statement to `APPEAL_WEBHOOK_URL`; admins review appeals manually. Removing an entry records history, but existing removals from before history tracking are not recoverable.

`/blacklist add` and `/blacklist remove` take a Discord user ID and can only be used in the source server by users with Ban Members permission, the configured manager role, or an ID in `BLACKLIST_ADMIN_IDS`. Adding a user can include a reason, a public evidence URL, and an uploaded image; it attempts to DM the user with the reason before banning. `/blacklist remove` accepts an optional reason. Both commands send audit embeds after successful actions. `/blacklist list` is available to all users and displays the source server's entries. `/deep-search` requires Ban Members permission in the server where it is run; it bans users on the source server's blacklist and unbans users previously banned by deep search who have since been removed from that blacklist. It does not remove unrelated/manual bans. The bot needs the `Ban Members` permission and a role above its targets. Responses and list contents are visible only to the command user. Enable Server Members Intent in the Developer Portal for join-time enforcement.

The public site is available at `https://blacklist-bot.github.io/blacklist-bot/`. It publishes only Discord user IDs and dates; reasons and moderator IDs are not included. The bot refreshes the public snapshot on startup and after source blacklist additions/removals. Removed users disappear from the current published snapshot, though earlier public Git history may retain prior snapshots.
The public site is available at `https://blacklist-bot.github.io/blacklist-bot/`. It publishes usernames, user IDs, dates, reasons, proof URLs, and uploaded proof images; moderator IDs are not included. This information is public, so never enter private or sensitive material in reasons or evidence. The bot refreshes the public snapshot on startup and after source blacklist additions/removals. Removed users disappear from the current published snapshot, though earlier public Git history may retain prior snapshots.

## Tests

```sh
npm test
```
