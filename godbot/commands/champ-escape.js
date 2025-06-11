const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

    const oppId = (battle.challenger === userId) ? battle.opponent : battle.challenger;
    const records = load(recordPath);
    const userData = load(userDataPath);

    records[userId] = records[userId] || { name: userData[userId]?.name || '탈주자', win: 0, draw: 0, lose: 0 };
    records[oppId]  = records[oppId]  || { name: userData[oppId]?.name || '상대', win: 0, draw: 0, lose: 0 };

    records[userId].lose++;
    records[oppId].win++;
    save(recordPath, records);

    delete bd[battleId];
    save(battlePath, bd);

    // 🔥 배틀 메시지 비활성화(최근 30개 메시지에서 챔피언배틀 메시지 탐색)
    try {
      const channel = interaction.channel;
      const messages = await channel.messages.fetch({ limit: 30 });
      for (const msg of messages.values()) {
        if (
          msg.author.id === interaction.client.user.id &&
          msg.embeds.length &&
          msg.embeds[0].title &&
          msg.embeds[0].title.includes('챔피언 배틀')
        ) {
          // 배틀 참가자 mention 포함인지도 체크 (정확도↑)
          const mentions = [battle.challenger, battle.opponent].map(id => `<@${id}>`);
          const desc = msg.embeds[0].description || '';
          if (mentions.every(mention => desc.includes(mention))) {
            // 버튼 비활성화 + 안내로 메시지 덮어쓰기
            await msg.edit({
              content: '🚫 이 배틀은 탈주로 종료되었습니다.',
              embeds: msg.embeds,
              components: [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId('disabled').setLabel('탈주 처리됨').setStyle(ButtonStyle.Secondary).setDisabled(true)
                )
              ]
            });
            break;
          }
        }
      }
    } catch (err) {
      // 실패 시 무시 (메시지 못찾아도 무관)
    }

    // 채널에 공개 메시지 (탈주)
    await interaction.reply({
      content: `🏃 **${userTag}**이(가) 탈주했습니다!`,
      allowedMentions: { users: [userId] }
    });
  }
};
