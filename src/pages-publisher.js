const DEFAULT_REPOSITORY = 'blacklist-bot/blacklist-bot';
const DATA_PATH = 'docs/blacklist-data.json';

function createPagesPublisher({
  token = process.env.GITHUB_PAGES_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
  repository = process.env.PAGES_REPOSITORY || DEFAULT_REPOSITORY,
  branch = process.env.PAGES_BRANCH || 'main',
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  async function publish(entries, sourceGuildName) {
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
    const publicData = {
      sourceGuildName: sourceGuildName || 'Relay. Blacklists',
      generatedAt: new Date().toISOString(),
      entries: entries
        .filter((entry) => /^\d{17,20}$/.test(entry.user_id))
        .map((entry) => ({ userId: entry.user_id, addedAt: entry.created_at })),
    };

    try {
      const currentResponse = await fetchImpl(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers });
      let sha;
      if (currentResponse.ok) {
        sha = (await currentResponse.json()).sha;
      } else if (currentResponse.status !== 404) {
        logger.error(`Could not read Pages data file (HTTP ${currentResponse.status}).`);
        return false;
      }

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