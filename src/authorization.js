function parseAdminIds(value = '') {
  return new Set(value.split(',').map((userId) => userId.trim()).filter(Boolean));
}

function canManageBlacklist({
  userId,
  guildId,
  sourceGuildId,
  roleIds = [],
  adminRoleId,
  hasBanPermission = false,
  adminIds = new Set(),
}) {
  return adminIds.has(userId) || hasBanPermission || (
    guildId === sourceGuildId && roleIds.includes(adminRoleId)
  );
}

function canRunDeepSearch(hasBanPermission) {
  return hasBanPermission === true;
}

module.exports = { canManageBlacklist, canRunDeepSearch, parseAdminIds };