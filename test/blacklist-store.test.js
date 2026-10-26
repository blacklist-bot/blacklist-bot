const assert = require('node:assert/strict');
const test = require('node:test');
const { createBlacklistStore } = require('../src/blacklist-store');
const { parseAdminIds } = require('../src/authorization');
const { enforceBlacklist } = require('../src/blacklist-enforcement');
const { sendBlacklistNotice } = require('../src/blacklist-notifications');
const { resolveGuildName } = require('../src/source-guild-name');
const { createCommands } = require('../src/commands');
const { createPagesPublisher } = require('../src/pages-publisher');

test('admin ID configuration trims values and ignores empty entries', () => {
  const adminIds = parseAdminIds(' 123, ,456,123 ');

  assert.deepEqual([...adminIds], ['123', '456']);
  assert.equal(adminIds.has('789'), false);
  assert.deepEqual([...parseAdminIds('')], []);
});

test('blacklist entries are unique per user and server', () => {
  const store = createBlacklistStore(':memory:');

  try {
    assert.equal(store.add('guild-a', 'user-1', 'reason', 'mod-1'), true);
    assert.equal(store.add('guild-a', 'user-1', 'duplicate', 'mod-2'), false);
    assert.equal(store.add('guild-b', 'user-1', '', 'mod-2'), true);
    assert.equal(store.get('guild-a', 'user-1').reason, 'reason');
    assert.equal(store.list('guild-a').length, 1);
    assert.deepEqual(
      store.listAll().map((entry) => entry.guild_id),
      ['guild-a', 'guild-b'],
    );
    assert.equal(store.remove('guild-a', 'user-1'), true);
    assert.equal(store.get('guild-a', 'user-1'), undefined);
    assert.ok(store.get('guild-b', 'user-1'));
    assert.equal(store.addManagedBan('target-guild', 'guild-a', 'user-1'), true);
    assert.deepEqual(store.listManagedBans('target-guild', 'guild-a'), [
      { target_guild_id: 'target-guild', source_guild_id: 'guild-a', user_id: 'user-1' },
    ]);
    assert.equal(store.removeManagedBan('target-guild', 'guild-a', 'user-1'), true);
    assert.deepEqual(store.listManagedBans('target-guild', 'guild-a'), []);
  } finally {
    store.close();
  }
});

test('deep search bans every blacklist ID and skips users already banned', async () => {
  const bannedIds = [];
  const guild = {
    id: 'guild-1',
    bans: { fetch: async () => new Map([['already-banned', {}]]) },
    members: {
      ban: async (userId) => bannedIds.push(userId),
    },
  };
  const entries = [
    { user_id: 'already-banned' },
    { user_id: 'member-user' },
    { user_id: 'not-in-server' },
  ];

  const store = {
    listManagedBans: () => [],
    addManagedBan: () => true,
    removeManagedBan: () => true,
  };
  const result = await enforceBlacklist(guild, entries, () => 'test reason', store, 'source-guild');

  assert.deepEqual(bannedIds, ['member-user', 'not-in-server']);
  assert.deepEqual(result, {
    checkedCount: 3,
    bannedCount: 2,
    alreadyBannedCount: 1,
    unbannedCount: 0,
    failedCount: 0,
  });
});

test('deep search only bans a duplicate user once when listed by multiple servers', async () => {
  const bannedIds = [];
  const guild = {
    id: 'target-guild',
    bans: { fetch: async () => new Map() },
    members: { ban: async (userId) => bannedIds.push(userId) },
  };
  const entries = [
    { guild_id: 'source-a', user_id: 'shared-user' },
    { guild_id: 'source-b', user_id: 'shared-user' },
  ];

  const store = {
    listManagedBans: () => [],
    addManagedBan: () => true,
    removeManagedBan: () => true,
  };
  const result = await enforceBlacklist(guild, entries, () => 'test reason', store, 'source-guild');

  assert.deepEqual(bannedIds, ['shared-user']);
  assert.equal(result.checkedCount, 1);
  assert.equal(result.bannedCount, 1);
});

test('deep search unbans only managed users removed from the source list', async () => {
  const store = createBlacklistStore(':memory:');
  const bannedIds = [];
  const unbannedIds = [];
  store.add('source-guild', 'still-blacklisted', '', 'mod');
  store.addManagedBan('target-guild', 'source-guild', 'removed-from-list');

  const guild = {
    id: 'target-guild',
    bans: { fetch: async () => new Map([
      ['removed-from-list', {}],
      ['manual-ban', {}],
    ]) },
    members: {
      ban: async (userId) => bannedIds.push(userId),
      unban: async (userId) => unbannedIds.push(userId),
    },
  };

  try {
    const result = await enforceBlacklist(
      guild,
      store.list('source-guild'),
      () => 'test reason',
      store,
      'source-guild',
    );

    assert.deepEqual(bannedIds, ['still-blacklisted']);
    assert.deepEqual(unbannedIds, ['removed-from-list']);
    assert.equal(store.listManagedBans('target-guild', 'source-guild').length, 1);
    assert.deepEqual(result, {
      checkedCount: 1,
      bannedCount: 1,
      alreadyBannedCount: 0,
      unbannedCount: 1,
      failedCount: 0,
    });
  } finally {
    store.close();
  }
});

test('deep search still unbans managed users when the source list is empty', async () => {
  const store = createBlacklistStore(':memory:');
  const unbannedIds = [];
  store.addManagedBan('target-guild', 'source-guild', 'removed-user');
  const guild = {
    id: 'target-guild',
    bans: { fetch: async () => new Map([['removed-user', {}]]) },
    members: {
      ban: async () => assert.fail('No active blacklist entries should be banned'),
      unban: async (userId) => unbannedIds.push(userId),
    },
  };

  try {
    const result = await enforceBlacklist(guild, [], () => 'unused', store, 'source-guild');

    assert.deepEqual(unbannedIds, ['removed-user']);
    assert.equal(store.listManagedBans('target-guild', 'source-guild').length, 0);
    assert.deepEqual(result, {
      checkedCount: 0,
      bannedCount: 0,
      alreadyBannedCount: 0,
      unbannedCount: 1,
      failedCount: 0,
    });
  } finally {
    store.close();
  }
});

test('blacklist notification DMs the user with the reason', async () => {
  let sentMessage;
  const client = {
    users: {
      fetch: async () => ({ send: async (message) => { sentMessage = message; } }),
    },
  };

  const sent = await sendBlacklistNotice(client, 'user-1', { name: 'Source server' }, 'Reason text');

  assert.equal(sent, true);
  assert.match(sentMessage.embeds[0].data.title, /blacklisted/i);
  assert.match(sentMessage.embeds[0].data.description, /Source server/);
  assert.equal(sentMessage.embeds[0].data.fields[0].value, 'Reason text');
});

test('blacklist notification failure does not throw', async () => {
  const previousWarn = console.warn;
  console.warn = () => {};

  try {
    const sent = await sendBlacklistNotice({ users: { fetch: async () => { throw new Error('DMs unavailable'); } } }, 'user-1', { name: 'Source server' }, '');
    assert.equal(sent, false);
  } finally {
    console.warn = previousWarn;
  }
});

test('source guild name is resolved from cache or fetched by ID', async () => {
  assert.equal(
    await resolveGuildName({ guilds: { cache: new Map([['source-id', { name: 'Main server' }]]) } }, 'source-id'),
    'Main server',
  );

  assert.equal(
    await resolveGuildName({ guilds: { cache: new Map(), fetch: async () => ({ name: 'Main server' }) } }, 'source-id'),
    'Main server',
  );
});

test('source guild name falls back without exposing its ID when unavailable', async () => {
  const name = await resolveGuildName({
    guilds: { cache: new Map(), fetch: async () => { throw new Error('not found'); } },
  }, 'source-id');

  assert.equal(name, 'source server');
});

test('slash-command descriptions use Relay. Blacklists and stay within Discord limits', () => {
  const commands = createCommands();
  const blacklist = commands.find((command) => command.name === 'blacklist');
  const deepSearch = commands.find((command) => command.name === 'deep-search');

  assert.equal(blacklist.description, 'Manage Relay. Blacklists');
  assert.equal(blacklist.options.find((option) => option.name === 'list').description, 'List users in Relay. Blacklists');
  assert.equal(deepSearch.description, 'Ban users in Relay. Blacklists');
  assert.ok(commands.every((command) => command.description.length <= 100));
  assert.ok(blacklist.options.every((option) => option.description.length <= 100));
});

test('Pages publisher writes only public IDs and dates to the repository snapshot', async () => {
  const requests = [];
  const publisher = createPagesPublisher({
    token: 'test-token',
    repository: 'owner/repo',
    branch: 'main',
    logger: { warn() {}, error() {} },
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (!options.method) return { ok: false, status: 404 };
      return { ok: true, status: 201 };
    },
  });

  const published = await publisher.publish([{
    user_id: '123456789012345678',
    created_at: '2026-10-26 12:00:00',
    reason: 'private reason',
    created_by: 'moderator-id',
    guild_id: 'source-guild',
  }], 'Relay. Blacklists');

  const requestBody = JSON.parse(requests[1].options.body);
  const snapshot = JSON.parse(Buffer.from(requestBody.content, 'base64').toString('utf8'));
  assert.equal(published, true);
  assert.equal(snapshot.sourceGuildName, 'Relay. Blacklists');
  assert.deepEqual(snapshot.entries, [{ userId: '123456789012345678', addedAt: '2026-10-26 12:00:00' }]);
  assert.equal(JSON.stringify(snapshot).includes('private reason'), false);
  assert.equal(JSON.stringify(snapshot).includes('moderator-id'), false);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer test-token');
});