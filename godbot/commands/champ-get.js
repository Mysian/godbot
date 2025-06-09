const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const champions = require("../utils/champion-data");

const dataPath = path.join(__dirname, "../data/champion-users.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath));
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언획득")
    .setDescription("무작위 챔피언 1개를 획득합니다 (1회 제한)"),

  async execute(interaction) {
    const userId = interaction.user.id;
    const data = loadData();

    if (data[userId]) {
      return interaction.reply({
        content: `❌ 이미 챔피언을 보유 중입니다: **${data[userId].name}**`,
        ephemeral: true
      });
    }

    const randomChampion = champions[Math.floor(Math.random() * champions.length)];

    data[userId] = {
      name: randomChampion.name,
      level: 0,
      success: 0,
      stats: { ...randomChampion.stats } // 기본 능력치 복사
    };

    saveData(data);

    return interaction.reply(`🎉 <@${userId}> 님이 **${randomChampion.name}** 챔피언을 획득했습니다!`);
  }
};
