const path = require('node:path');
const { EmbedBuilder } = require('discord.js');
const { normalizeHttpUrl } = require('./url-validation');

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ['image/png', { extension: 'png', signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }],
  ['image/jpeg', { extension: 'jpg', signature: Buffer.from([0xff, 0xd8, 0xff]) }],
  ['image/gif', { extension: 'gif', signature: Buffer.from('GIF8') }],
  ['image/webp', { extension: 'webp', signature: Buffer.from('RIFF') }],
]);

function parseReport(input) {
  const userId = String(input.userId || '').trim();
  const reason = String(input.reason || '').trim();
  const proofUrlInput = String(input.proofUrl || '').trim();
  const proofUrl = normalizeHttpUrl(proofUrlInput);

  if (!/^\d{17,20}$/.test(userId)) throw new Error('Enter a valid Discord user ID.');
  if (reason.length < 5 || reason.length > 1000) throw new Error('Reason must be between 5 and 1,000 characters.');
  if (proofUrlInput && !proofUrl) throw new Error('Proof URL must use http:// or https://.');
  const source = input.source === 'Discord' ? 'Discord' : 'Website';
  const reporterName = String(input.reporterName || input.reporterId || '').trim().slice(0, 100);
  if (source === 'Website' && (reporterName.length < 2 || reporterName.length > 100)) {
    throw new Error('Enter a Discord username between 2 and 100 characters.');
  }

  let proofImage = null;
  if (input.proofImage) {
    const { contentType, dataBase64 } = input.proofImage;
    const imageType = IMAGE_TYPES.get(contentType);
    if (!imageType || typeof dataBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) {
      throw new Error('Proof image must be a PNG, JPEG, GIF, or WebP image.');
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      throw new Error('Proof images must be smaller than 4 MB.');
    }
    const hasSignature = contentType === 'image/webp'
      ? buffer.subarray(0, 4).equals(imageType.signature) && buffer.subarray(8, 12).toString() === 'WEBP'
      : buffer.subarray(0, imageType.signature.length).equals(imageType.signature);
    if (!hasSignature) throw new Error('Proof image content does not match its file type.');

    proofImage = {
      buffer,
      contentType,
      filename: `proof.${imageType.extension}`,
    };
  }

  if (!proofUrl && !proofImage) throw new Error('Add a proof URL or upload an image.');

  return {
    userId,
    reason,
    proofUrl,
    proofImage,
    reporterName: reporterName || 'Discord user',
    source,
  };
}

async function sendReport(webhook, report) {
  const embed = new EmbedBuilder()
    .setColor(0x91a778)
    .setTitle('New user report for review')
    .addFields(
      { name: 'Reported user ID', value: report.userId },
      { name: 'Reason', value: report.reason.slice(0, 1024) },
      { name: 'Submitted via', value: report.source },
      { name: 'Reporter (unverified)', value: report.reporterName },
    )
    .setTimestamp();

  if (report.proofUrl) {
    embed.addFields({ name: 'Proof URL', value: report.proofUrl.slice(0, 1024) });
  }
  if (report.proofImage) {
    embed.setImage(`attachment://${path.basename(report.proofImage.filename)}`);
  }

  await webhook.send({
    embeds: [embed],
    ...(report.proofImage
      ? { files: [{ attachment: report.proofImage.buffer, name: report.proofImage.filename }] }
      : {}),
  });
}

module.exports = { MAX_IMAGE_BYTES, parseReport, sendReport };