// commands/champ-escape.js
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const userDataPath = path.join(__dirname, '../data/champion-users.json');
const recordPath   = path.join(__dirname, '../data/champion-records.json');
const battlePath   = path.join(__dirname, '../data/battle-active.json');

function load(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '{}');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('서렌')
    .setDescription('현재 진행 중인 챔피언 배틀에서 탈주합니다.'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const userTag = `<@${userId}>`;

    const bd = load(battlePath);
    // 본인이 참가중인 배틀 찾기
    let battleId = null, battle = null;
    for (const [id, b] of Object.entries(bd)) {
      if ((b.challenger === userId || b.opponent === userId) && !b.pending) {
        battleId = id;
        battle = b;
        break;
      }
    }

    if (!battle) {
      await interaction.reply({
        content: '❌ 진행 중인 배틀이 없습니다.',
        ephemeral: true
      });
      return;
    }

    // 상대방
    const oppId = (battle.challenger === userId) ? battle.opponent : battle.challenger;

    // 기록 반영
    const records = load(recordPath);
    const userData = load(userDataPath);

    records[userId] = records[userId] || { name: userData[userId]?.name || '탈주자', win: 0, draw: 0, lose: 0 };
    records[oppId]  = records[oppId]  || { name: userData[oppId]?.name || '상대', win: 0, draw: 0, lose: 0 };

    records[userId].lose++;
    records[oppId].win++;
    save(recordPath, records);

    // 배틀 삭제
    delete bd[battleId];
    save(battlePath, bd);

    // 채널에 공개 메시지 (탈주)
    await interaction.reply({
      content: `🏃 **${userTag}**이(가) 탈주했습니다!`,
      allowedMentions: { users: [userId] } // 유저 태그 허용
    });
  }
};
