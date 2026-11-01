const DEFAULT_REPOSITORY = 'blacklist-bot/blacklist-bot';
const DATA_PATH = 'docs/blacklist-data.json';
const { createHash } = require('node:crypto');
const { normalizeHttpUrl } = require('./url-validation');

function hashUserId(userId) {
  return createHash('sha256').update(userId).digest('hex');
}

function createPagesPublisher({
  token = process.env.GITHUB_PAGES_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
  repository = process.env.PAGES_REPOSITORY || DEFAULT_REPOSITORY,
  branch = process.env.PAGES_BRANCH || 'main',
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  async function publish(entries, sourceGuildName, removedUserIds = [], addedUserIds = []) {
    if (!token) {
      logger.warn('GITHUB_PAGES_TOKEN is not configured; public blacklist sync is disabled.');
      return false;
    }

    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      logger.error('PAGES_REPOSITORY must be in owner/repository format.');
      return false;
    }

    const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${DATA_PATH}`;
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const currentEntries = entries
      .filter((entry) => /^\d{17,20}$/.test(entry.user_id))
      .map((entry) => ({
        userId: entry.user_id,
        username: String(entry.username || '').slice(0, 100),
        addedAt: entry.created_at,
        reason: String(entry.reason || '').slice(0, 400),
        proofUrl: normalizeHttpUrl(entry.proof_url),
        proofImageUrl: normalizeHttpUrl(entry.proof_image_url),
        proofImageType: String(entry.proof_image_type || '').slice(0, 100),
      }));
    const removedHashes = new Set(removedUserIds.map(hashUserId));
    const publicData = {
      sourceGuildName: sourceGuildName || 'Relay. Blacklists',
      generatedAt: new Date().toISOString(),
      removedUserHashes: [],
      entries: [],
    };

    try {
      const currentResponse = await fetchImpl(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers });
      let sha;
      if (currentResponse.ok) {
        const currentFile = await currentResponse.json();
        sha = currentFile.sha;
        try {
          const currentData = JSON.parse(Buffer.from(currentFile.content, 'base64').toString('utf8'));
          for (const hash of currentData.removedUserHashes || []) {
            if (/^[a-f0-9]{64}$/.test(hash)) removedHashes.add(hash);
          }
          for (const userId of addedUserIds) removedHashes.delete(hashUserId(userId));
          if (Array.isArray(currentData.entries)) {
            for (const entry of currentData.entries) {
              if (/^\d{17,20}$/.test(entry.userId) && !removedHashes.has(hashUserId(entry.userId))) {
                publicData.entries.push({
                  userId: entry.userId,
                  username: String(entry.username || '').slice(0, 100),
                  addedAt: String(entry.addedAt || ''),
                  reason: String(entry.reason || '').slice(0, 400),
                  proofUrl: normalizeHttpUrl(entry.proofUrl),
                  proofImageUrl: normalizeHttpUrl(entry.proofImageUrl),
                  proofImageType: String(entry.proofImageType || '').slice(0, 100),
                });
              }
            }
          }
        } catch (error) {
          logger.error('Existing public blacklist snapshot is unreadable; refusing to overwrite it:', error.message);
          return false;
        }
      } else if (currentResponse.status !== 404) {
        logger.error(`Could not read Pages data file (HTTP ${currentResponse.status}).`);
        return false;
      }

      publicData.removedUserHashes = [...removedHashes].sort();
      const mergedEntries = new Map(publicData.entries.map((entry) => [entry.userId, entry]));
      for (const entry of currentEntries) {
        if (!removedHashes.has(hashUserId(entry.userId))) mergedEntries.set(entry.userId, entry);
      }
      publicData.entries = [...mergedEntries.values()]
        .sort((left, right) => String(right.addedAt).localeCompare(String(left.addedAt)));

      const body = {
        message: 'Update public blacklist snapshot',
        content: Buffer.from(JSON.stringify(publicData, null, 2)).toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      };
      const updateResponse = await fetchImpl(endpoint, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!updateResponse.ok) {
        logger.error(`Could not publish Pages data (HTTP ${updateResponse.status}).`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Could not publish public blacklist data:', error.message);
      return false;
    }
  }

  return { publish };
}

module.exports = { createPagesPublisher };