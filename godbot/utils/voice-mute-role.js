const fs = require("fs/promises");
const path = require("path");

const ROLE_ID = "1429076711341031465";
const STORE_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(STORE_DIR, "auto-mute-role.json");

let store = {};
let saving = false;
let saveQueued = false;

async function ensureStore() {
  try {
    await fs.mkdir(STORE_DIR, { recursive: true });
    const buf = await fs.readFile(STORE_PATH, "utf8").catch(() => "{}");
    store = JSON.parse(buf || "{}");
  } catch {
    store = {};
  }
}

async function saveStore() {
  if (saving) {
    saveQueued = true;
    return;
  }
  saving = true;
  try {
    await fs.writeFile(STORE_PATH, JSON.stringify(store));
  } finally {
    saving = false;
    if (saveQueued) {
      saveQueued = false;
      await saveStore();
    }
  }
}

function getGuildBucket(guildId) {
  if (!store[guildId]) store[guildId] = {};
  return store[guildId];
}

function isTracked(guildId, userId) {
  return !!getGuildBucket(guildId)[userId];
}

async function trackAdd(guildId, userId) {
  const b = getGuildBucket(guildId);
  if (!b[userId]) {
    b[userId] = true;
    await saveStore();
  }
}

async function trackRemove(guildId, userId) {
  const b = getGuildBucket(guildId);
  if (b[userId]) {
    delete b[userId];
    await saveStore();
  }
}

function isMutedOrDeaf(vs) {
  return vs?.selfMute || vs?.mute || vs?.selfDeaf || vs?.deaf || false;
}

async function addRoleIfNeeded(member) {
  const guildId = member.guild.id;
  const userId = member.id;
  const roles = member.roles;
  if (roles.cache.has(ROLE_ID)) return;
  const role = member.guild.roles.cache.get(ROLE_ID);
  if (!role) return;
  await roles.add(ROLE_ID).catch(() => {});
  await trackAdd(guildId, userId);
}

async function removeRoleIfTracked(member) {
  const guildId = member.guild.id;
  const userId = member.id;
  if (!isTracked(guildId, userId)) return;
  const roles = member.roles;
  if (roles.cache.has(ROLE_ID)) {
    await roles.remove(ROLE_ID).catch(() => {});
  }
  await trackRemove(guildId, userId);
}

async function reconcileGuild(guild) {
  try {
    await guild.roles.fetch().catch(() => {});
    const role = guild.roles.cache.get(ROLE_ID);
    if (!role) return;

    const voiceStates = guild.voiceStates.cache;
    const membersToCheck = new Set();
    voiceStates.forEach(vs => membersToCheck.add(vs.id));

    const tracked = Object.keys(getGuildBucket(guild.id));
    tracked.forEach(uid => membersToCheck.add(uid));

    const fetchList = Array.from(membersToCheck);
    if (fetchList.length > 0) {
      await guild.members.fetch({ user: fetchList, withPresences: false }).catch(() => {});
    }

    for (const userId of membersToCheck) {
      const vs = voiceStates.get(userId);
      const member = guild.members.cache.get(userId);
      if (!member) {
        await trackRemove(guild.id, userId);
        continue;
      }
      const muted = isMutedOrDeaf(vs);
      if (muted) {
        await addRoleIfNeeded(member);
      } else {
        await removeRoleIfTracked(member);
      }
    }
  } catch {}
}

function bindListeners(client) {
  client.on("voiceStateUpdate", async (oldState, newState) => {
    try {
      const member = newState.member || oldState.member;
      if (!member || !member.guild || member.user?.bot) return;
      const guild = member.guild;
      const role = guild.roles.cache.get(ROLE_ID);
      if (!role) return;

      const nowMuted = isMutedOrDeaf(newState);
      if (nowMuted) {
        await addRoleIfNeeded(member);
      } else {
        await removeRoleIfTracked(member);
      }
    } catch {}
  });

  client.on("guildCreate", async guild => {
    await reconcileGuild(guild);
  });

  client.on("ready", async () => {
    const guilds = client.guilds.cache.map(g => g);
    for (const g of guilds) {
      await reconcileGuild(g);
    }
  });
}

async function registerVoiceMuteRole(client) {
  await ensureStore();
  bindListeners(client);
}

module.exports = { registerVoiceMuteRole };
