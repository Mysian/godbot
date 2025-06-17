const fs = require('fs').promises;
const path = require('path');

const USER_FILE = path.join(__dirname, '../data/champion-users.json');
const RECORD_FILE = path.join(__dirname, '../data/champion-records.json');

async function readJson(file) {
  try {
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data || '{}');
  } catch (e) {
    return {};
  }
}
async function writeJson(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2));
}

async function loadChampionUser(userId, interaction) {
  const users = await readJson(USER_FILE);
  if (!users[userId]) return null;
  const champ = { ...users[userId] };
  champ.hp = champ.hp ?? champ.stats.hp;
  champ.id = userId;
  if (interaction && interaction.guild) {
    try {
      const member = await interaction.guild.members.fetch(userId);
      champ.nickname = member.nickname || member.user.username;
    } catch {
      champ.nickname = champ.nickname ?? champ.name;
    }
  } else {
    champ.nickname = champ.nickname ?? champ.name;
  }
  champ.items = champ.items || {};
  champ.skills = champ.skills || [];
  champ._itemUsedCount = 0;
  champ.isDefending = false;
  champ.isDodging = false;
  return champ;
}

async function loadRecords() {
  return await readJson(RECORD_FILE);
}
async function saveRecords(records) {
  await writeJson(RECORD_FILE, records);
}
async function updateRecord(userId, champName, type) {
  const records = await loadRecords();
  if (!records[userId]) {
    records[userId] = { name: champName, win: 0, draw: 0, lose: 0 };
  }
  if (type === 'win') records[userId].win += 1;
  if (type === 'lose') records[userId].lose += 1;
  if (type === 'draw') records[userId].draw += 1;
  await saveRecords(records);
}

module.exports = {
  loadChampionUser,
  loadRecords,
  saveRecords,
  updateRecord
};
