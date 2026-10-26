function parseAdminIds(value = '') {
  return new Set(value.split(',').map((userId) => userId.trim()).filter(Boolean));
}

module.exports = { parseAdminIds };