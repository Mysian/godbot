// utils/donor-role-expirer.js
const fs = require('fs');
const path = require('path');

const DONOR_ROLE_ID = '1397076919127900171';
const donorRolesPath = path.join(__dirname, '../data/donor_roles.json');

function loadDonorRoles() {
  if (!fs.existsSync(donorRolesPath)) return {};
  try { return JSON.parse(fs.readFileSync(donorRolesPath, 'utf8')); }
  catch { return {}; }
}
function saveDonorRoles(data) {
  fs.writeFileSync(donorRolesPath, JSON.stringify(data, null, 2));
}

async function expireOnce(guild) {
  const data = loadDonorRoles();
  const now = new Date();
  let changed = false;

  for (const [userId, info] of Object.entries(data)) {
    const exp = new Date(info.expiresAt);
    if (!isFinite(exp.getTime())) continue;
    if (exp <= now) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        await member.roles.remove(DONOR_ROLE_ID).catch(() => {});
      }
      delete data[userId];
      changed = true;
    }
  }
  if (changed) saveDonorRoles(data);
}

module.exports = function attachDonorRoleExpirer(client, opts = {}) {
  const guildId = opts.guildId || process.env.GUILD_ID;
  const intervalMs = Number(opts.intervalMs) > 0 ? Number(opts.intervalMs) : 10 * 60 * 1000;

  const run = async () => {
    if (!guildId) return;
    const guild =
      client.guilds.cache.get(guildId) ||
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;
    await expireOnce(guild);
  };

  if (client.isReady?.() || client.readyAt) {
    run();
  } else {
    client.once('ready', run);
  }

  setInterval(run, intervalMs);
};

// 선택: 외부에서 수동 호출용
module.exports.expireOnce = expireOnce;
