const entriesElement = document.querySelector('#entries');
const countElement = document.querySelector('#entry-count');
const resultCountElement = document.querySelector('#result-count');
const updatedElement = document.querySelector('#last-updated');
const sourceElement = document.querySelector('#source-name');
const searchElement = document.querySelector('#search');
const refreshButton = document.querySelector('#refresh');
const errorElement = document.querySelector('#error');

let entries = [];

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

function setCellText(row, text, className) {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function render() {
  const query = searchElement.value.trim().toLowerCase();
  const visibleEntries = entries.filter((entry) => entry.userId.toLowerCase().includes(query));
  entriesElement.replaceChildren();
  countElement.textContent = String(entries.length).padStart(2, '0');
  resultCountElement.textContent = `${visibleEntries.length} ${visibleEntries.length === 1 ? 'ENTRY' : 'ENTRIES'} SHOWN`;

  if (visibleEntries.length === 0) {
    const row = document.createElement('tr');
    const cell = setCellText(row, entries.length === 0 ? 'No blacklist entries published.' : 'No matching user IDs.', 'table-state');
    cell.colSpan = 3;
    entriesElement.append(row);
    return;
  }

  for (const entry of visibleEntries) {
    const row = document.createElement('tr');
    const userCell = document.createElement('td');
    const userLink = document.createElement('a');
    userLink.className = 'user-link';
    userLink.href = `https://discord.com/users/${encodeURIComponent(entry.userId)}`;
    userLink.target = '_blank';
    userLink.rel = 'noopener noreferrer';
    userLink.textContent = entry.userId;
    userCell.append(userLink);
    row.append(userCell);
    setCellText(row, formatDate(entry.addedAt));
    const statusCell = document.createElement('td');
    const status = document.createElement('span');
    status.className = 'status-tag';
    status.textContent = 'Listed';
    statusCell.append(status);
    row.append(statusCell);
    entriesElement.append(row);
  }
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
      : [];
    sourceElement.textContent = data.sourceGuildName || 'SOURCE REGISTER';
    updatedElement.textContent = data.generatedAt ? formatDate(data.generatedAt) : 'Waiting for first sync';
    updatedElement.dateTime = data.generatedAt || '';
    render();
  } catch {
    errorElement.textContent = 'Could not load the public blacklist data. Try refreshing in a moment.';
    errorElement.hidden = false;
    entriesElement.replaceChildren();
    const row = document.createElement('tr');
    const cell = setCellText(row, 'Register unavailable.', 'table-state');
    cell.colSpan = 3;
    entriesElement.append(row);
    resultCountElement.textContent = 'DATA UNAVAILABLE';
  } finally {
    refreshButton.disabled = false;
  }
}

searchElement.addEventListener('input', render);
refreshButton.addEventListener('click', loadBlacklist);
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== searchElement) {
    event.preventDefault();
    searchElement.focus();
  }
});

loadBlacklist();