const entriesElement = document.querySelector('#entries');
const countElement = document.querySelector('#entry-count');
const resultCountElement = document.querySelector('#result-count');
const updatedElement = document.querySelector('#last-updated');
const sourceElement = document.querySelector('#source-name');
const searchElement = document.querySelector('#search');
const refreshButton = document.querySelector('#refresh');
const errorElement = document.querySelector('#error');
const reportDialog = document.querySelector('#report-dialog');
const reportForm = document.querySelector('#report-form');
const reportStatus = document.querySelector('#report-status');
const reportSubmitButton = document.querySelector('#submit-report');

let entries = [];

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function makeLink(url, label) {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) return null;

  const link = document.createElement('a');
  link.href = safeUrl.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

function makeEntryCard(entry, index) {
  const card = document.createElement('article');
  card.className = 'entry-card';

  const top = document.createElement('div');
  top.className = 'card-top';
  const identity = document.createElement('div');
  identity.className = 'card-identity';
  const label = document.createElement('span');
  label.className = 'card-index';
  label.textContent = `ENTRY ${String(index + 1).padStart(3, '0')}`;
  const username = document.createElement('span');
  username.className = 'card-username';
  username.textContent = entry.username || 'Username unavailable';
  const userLink = makeLink(`https://discord.com/users/${entry.userId}`, entry.userId);
  userLink.className = 'user-id';
  identity.append(label, username, userLink);
  const status = document.createElement('span');
  status.className = 'status-tag';
  status.textContent = 'Listed';
  top.append(identity, status);
  card.append(top);

  const date = document.createElement('p');
  date.className = 'card-date';
  date.textContent = `ADDED ${formatDate(entry.addedAt)}`;
  card.append(date);

  const reasonBlock = document.createElement('section');
  reasonBlock.className = 'card-section';
  const reasonLabel = document.createElement('h3');
  reasonLabel.textContent = 'Reason';
  const reason = document.createElement('p');
  reason.className = 'reason-copy';
  reason.textContent = entry.reason || 'No reason provided.';
  reasonBlock.append(reasonLabel, reason);
  card.append(reasonBlock);

  const evidence = document.createElement('section');
  evidence.className = 'card-section evidence-section';
  const evidenceLabel = document.createElement('h3');
  evidenceLabel.textContent = 'Proof';
  const evidenceItems = document.createElement('div');
  evidenceItems.className = 'evidence-items';
  const proofLink = makeLink(entry.proofUrl, 'Open evidence link');
  if (proofLink) evidenceItems.append(proofLink);

  const imageUrl = safeHttpUrl(entry.proofImageUrl);
  const imageHostAllowed = imageUrl && ['cdn.discordapp.com', 'media.discordapp.net'].includes(imageUrl.hostname);
  if (imageHostAllowed && typeof entry.proofImageType === 'string' && entry.proofImageType.startsWith('image/')) {
    const imageLink = makeLink(imageUrl.href, 'Open uploaded image');
    const image = document.createElement('img');
    image.className = 'proof-image';
    image.src = imageUrl.href;
    image.alt = 'Uploaded blacklist evidence';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    imageLink.className = 'image-proof-link';
    imageLink.append(image);
    evidenceItems.append(imageLink);
  } else if (entry.proofImageUrl) {
    const imageLink = makeLink(entry.proofImageUrl, 'Open uploaded evidence');
    if (imageLink) evidenceItems.append(imageLink);
  }

  if (!evidenceItems.childElementCount) {
    const none = document.createElement('span');
    none.className = 'no-proof';
    none.textContent = 'No proof attached.';
    evidenceItems.append(none);
  }
  evidence.append(evidenceLabel, evidenceItems);
  card.append(evidence);
  return card;
}

function render() {
  const query = searchElement.value.trim().toLowerCase();
  const visibleEntries = entries.filter((entry) => [entry.userId, entry.username, entry.reason, entry.proofUrl]
    .some((value) => value.toLowerCase().includes(query)));
  entriesElement.replaceChildren();
  countElement.textContent = String(entries.length).padStart(2, '0');
  resultCountElement.textContent = `${visibleEntries.length} ${visibleEntries.length === 1 ? 'ENTRY' : 'ENTRIES'} SHOWN`;

  if (visibleEntries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = entries.length === 0 ? 'No blacklist entries published.' : 'No matching entries.';
    entriesElement.append(empty);
    return;
  }

  visibleEntries.forEach((entry, index) => entriesElement.append(makeEntryCard(entry, index)));
}

async function loadBlacklist() {
  refreshButton.disabled = true;
  errorElement.hidden = true;
  try {
    const response = await fetch(`blacklist-data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Data request returned ${response.status}`);
    const data = await response.json();
    entries = Array.isArray(data.entries)
      ? data.entries.filter((entry) => /^\d{17,20}$/.test(entry.userId) && typeof entry.addedAt === 'string')
        .map((entry) => ({
          ...entry,
          username: typeof entry.username === 'string' ? entry.username.slice(0, 100) : '',
          reason: typeof entry.reason === 'string' ? entry.reason.slice(0, 400) : '',
          proofUrl: safeHttpUrl(entry.proofUrl)?.href || '',
          proofImageUrl: safeHttpUrl(entry.proofImageUrl)?.href || '',
          proofImageType: typeof entry.proofImageType === 'string' ? entry.proofImageType : '',
        }))
      : [];
    sourceElement.textContent = data.sourceGuildName || 'SOURCE REGISTER';
    updatedElement.textContent = data.generatedAt ? formatDate(data.generatedAt) : 'Waiting for first sync';
    updatedElement.dateTime = data.generatedAt || '';
    render();
  } catch {
    errorElement.textContent = 'Could not load the public blacklist data. Try refreshing in a moment.';
    errorElement.hidden = false;
    entriesElement.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Register unavailable.';
    entriesElement.append(empty);
    resultCountElement.textContent = 'DATA UNAVAILABLE';
  } finally {
    refreshButton.disabled = false;
  }
}

searchElement.addEventListener('input', render);
refreshButton.addEventListener('click', loadBlacklist);
document.querySelector('#open-report').addEventListener('click', () => {
  reportStatus.textContent = '';
  reportDialog.showModal();
});
document.querySelector('#close-report').addEventListener('click', () => reportDialog.close());
document.querySelector('#cancel-report').addEventListener('click', () => reportDialog.close());
reportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  reportStatus.textContent = '';

  const formData = new FormData(reportForm);
  const userId = String(formData.get('userId') || '').trim();
  const discordUsername = String(formData.get('discordUsername') || '').trim();
  const reason = String(formData.get('reason') || '').trim();
  const proofUrl = String(formData.get('proofUrl') || '').trim();
  const image = formData.get('proofImage');
  const hasImage = image instanceof File && image.size > 0;

  if (!/^\d{17,20}$/.test(userId)) {
    reportStatus.textContent = 'Enter a valid Discord user ID.';
    return;
  }
  if (discordUsername.length < 2 || discordUsername.length > 100) {
    reportStatus.textContent = 'Enter a Discord username between 2 and 100 characters.';
    return;
  }
  if (reason.length < 5 || reason.length > 1000) {
    reportStatus.textContent = 'Reason must be between 5 and 1,000 characters.';
    return;
  }
  if (!proofUrl && !hasImage) {
    reportStatus.textContent = 'Add a proof URL or upload an image.';
    return;
  }
  if (proofUrl && !safeHttpUrl(proofUrl)) {
    reportStatus.textContent = 'Proof URL must use http:// or https://.';
    return;
  }
  const allowedImageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  if (hasImage && (!allowedImageTypes.includes(image.type) || image.size > 4 * 1024 * 1024)) {
    reportStatus.textContent = 'Choose a PNG, JPEG, GIF, or WebP image smaller than 4 MB.';
    return;
  }

  reportSubmitButton.disabled = true;
  reportStatus.textContent = 'Sending report...';
  try {
    let proofImage;
    if (hasImage) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the selected image.'));
        reader.readAsDataURL(image);
      });
      proofImage = {
        contentType: image.type,
        dataBase64: String(dataUrl).split(',')[1],
      };
    }

    const response = await fetch(window.REPORT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, discordUsername, reason, proofUrl, proofImage, website: formData.get('website') }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Report could not be sent.');

    reportForm.reset();
    reportStatus.textContent = 'Report sent to admins for review. No automatic blacklist or ban was applied.';
  } catch (error) {
    reportStatus.textContent = error.message || 'Report service is unavailable. Try again later.';
  } finally {
    reportSubmitButton.disabled = false;
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== searchElement) {
    event.preventDefault();
    searchElement.focus();
  }
});

loadBlacklist();