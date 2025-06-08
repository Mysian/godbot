const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../data/champion-users.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath));
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function getSuccessRate(level) {
  if (level < 10) return 0.9;
  if (level < 30) return 0.8;
  if (level < 50) return 0.7;
  if (level < 100) return 0.6;
  if (level < 200) return 0.4;
  if (level < 500) return 0.3;
  if (level < 900) return 0.2;
  return 0.1;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언강화")
    .setDescription("보유한 챔피언을 강화합니다 (최대 999강)"),
  async execute(interaction) {
    const userId = interaction.user.id;
    const data = loadData();

    if (!data[userId]) {
      return interaction.reply({
        content: `❌ 먼저 /챔피언획득 으로 챔피언을 얻어야 합니다.`,
        ephemeral: true
      });
    }

    const champ = data[userId];
    if (champ.level >= 999) {
      return interaction.reply(`⚠️ 이미 최대 강화 상태입니다! (**${champ.level}강**)`);
    }

    const rate = getSuccessRate(champ.level);
    const success = Math.random() < rate;

    if (success) {
      champ.level += 1;
      champ.success += 1;
      saveData(data);
      return interaction.reply(`💪 강화 성공! **${champ.name} ${champ.level}강**`);
    } else {
      const survive = Math.random() < 0.3; // 30% 확률로 살아남음
      if (survive) {
        return interaction.reply(`😮 강화는 실패했지만, **${champ.name}**(은)는 무사했습니다! 계속 강화할 수 있어요.`);
      } else {
        delete data[userId];
        saveData(data);
        return interaction.reply(`💥 강화 실패... ⚰️ **${champ.name}**(을)를 잃었습니다. 다시 /챔피언획득 으로 얻으세요.`);
      }
    }
  },
};
