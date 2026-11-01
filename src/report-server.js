const http = require('node:http');
const { parseReport, sendReport } = require('./report-webhook');
const { parseAppeal, sendAppeal } = require('./appeal-webhook');

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 8;

function createReportServer({
  webhook,
  appealWebhook,
  allowedOrigin = 'https://blacklist-bot.github.io',
  sendReportFn = sendReport,
  sendAppealFn = sendAppeal,
  logger = console,
} = {}) {
  const submissionsByAddress = new Map();

  return http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin === allowedOrigin) {
      response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (request.url === '/health' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    const submissionType = request.url === '/api/reports'
      ? 'report'
      : request.url === '/api/appeals'
        ? 'appeal'
        : '';
    if (!submissionType) {
      response.writeHead(404);
      response.end();
      return;
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(origin === allowedOrigin ? 204 : 403);
      response.end();
      return;
    }

    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST, OPTIONS' });
      response.end();
      return;
    }

    if (origin !== allowedOrigin) {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Origin not allowed.' }));
      return;
    }

    const destinationWebhook = submissionType === 'appeal' ? appealWebhook : webhook;
    if (!destinationWebhook) {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: `${submissionType === 'appeal' ? 'Appeals' : 'Report submissions'} are not configured yet.` }));
      return;
    }

    const address = request.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || request.socket.remoteAddress
      || 'unknown';
    const now = Date.now();
    const recentSubmissions = (submissionsByAddress.get(address) || [])
      .filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
    if (recentSubmissions.length >= RATE_LIMIT) {
      response.writeHead(429, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Too many reports. Try again later.' }));
      return;
    }

    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      response.writeHead(415, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Send a JSON report.' }));
      return;
    }

    const chunks = [];
    let bodySize = 0;
    for await (const chunk of request) {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_BYTES) {
        response.writeHead(413, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Report is too large.' }));
        return;
      }
      chunks.push(chunk);
    }

    let report;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (body.website) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Invalid submission.' }));
        return;
      }
      report = submissionType === 'appeal'
        ? parseAppeal(body)
        : parseReport({ ...body, reporterName: 'Website visitor', source: 'Website' });
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error.message === 'Unexpected end of JSON input' ? 'Invalid report data.' : error.message }));
      return;
    }

    try {
      if (submissionType === 'appeal') {
        await sendAppealFn(destinationWebhook, report);
      } else {
        await sendReportFn(destinationWebhook, report);
      }
      recentSubmissions.push(now);
      submissionsByAddress.set(address, recentSubmissions);
      response.writeHead(202, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      logger.error('Could not forward user report:', error.message);
      response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Report could not be delivered. Try again later.' }));
    }
  });
}

module.exports = { createReportServer, MAX_BODY_BYTES, RATE_LIMIT, RATE_WINDOW_MS };