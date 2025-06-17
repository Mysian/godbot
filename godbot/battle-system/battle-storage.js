const fs = require('fs').promises;
const path = require('path');

const USER_FILE   = path.join(__dirname, '../data/champion-users.json');
const RECORD_FILE = path.join(__dirname, '../data/champion-records.json');
const ITEM_FILE   = path.join(__dirname, '../data/items.json');
const SKILL_FILE  = path.join(__dirname, '../data/skills.json');

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

// 챔피언 유저 데이터(기본 정보+인벤토리) 불러오기
async function loadChampionUser(userId, interaction) {
  const users  = await readJson(USER_FILE);
  const items  = await readJson(ITEM_FILE);
  const skills = await readJson(SKILL_FILE);

  if (!users[userId]) return null;
  const champ = { ...users[userId] };
  champ.hp = champ.hp ?? champ.stats.hp;
  champ.id = userId;

  // 닉네임 처리 (디스코드 fetch)
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
  // 인벤토리: champion-users.json에 저장 X, 별도 파일에서만 관리
  champ.items = items[userId] || {};
  champ.skills = Object.keys(skills[userId] || {}); // 소유한 스킬 이름 배열 (or skills[userId] 원하면 객체 그대로)
  champ._itemUsedCount = 0;
  champ.isDefending = false;
  champ.isDodging = false;
  return champ;
}

// champion-users.json 직접 갱신 (인벤토리 제외)
async function saveChampionUser(userId, champObj) {
  const users = await readJson(USER_FILE);
  users[userId] = { ...champObj };
  // items, skills, 기타 런타임 전용 값은 champion-users.json에 저장 X
  delete users[userId].items;
  delete users[userId].skills;
  delete users[userId]._itemUsedCount;
  delete users[userId].isDefending;
  delete users[userId].isDodging;
  await writeJson(USER_FILE, users);
}

// 아이템 인벤토리 (count 관리)
async function loadItemInventory(userId) {
  const items = await readJson(ITEM_FILE);
  return items[userId] || {};
}
async function saveItemInventory(userId, invObj) {
  const items = await readJson(ITEM_FILE);
  items[userId] = invObj;
  await writeJson(ITEM_FILE, items);
}

// 스킬 인벤토리 (스킬 이름: {desc} 등 관리)
async function loadSkillInventory(userId) {
  const skills = await readJson(SKILL_FILE);
  return skills[userId] || {};
}
async function saveSkillInventory(userId, skillsObj) {
  const skills = await readJson(SKILL_FILE);
  skills[userId] = skillsObj;
  await writeJson(SKILL_FILE, skills);
}

// 전적 (불러오기/저장)
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
  loadChampionUser,   // 챔피언 기본정보+인벤토리 결합해서 반환!
  saveChampionUser,
  loadItemInventory,
  saveItemInventory,
  loadSkillInventory,
  saveSkillInventory,
  loadRecords,
  saveRecords,
  updateRecord
};
