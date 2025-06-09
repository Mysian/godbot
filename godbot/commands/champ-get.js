const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const champions = require("../utils/champion-data");
const {
  getChampionIcon,
  getChampionSplash,
  getChampionInfo
} = require("../utils/champion-utils");

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
      stats: { ...randomChampion.stats },
      timestamp: Date.now()
    };

    saveData(data);

    const icon = getChampionIcon(randomChampion.name);
    const splash = getChampionSplash(randomChampion.name);
    const lore = getChampionInfo(randomChampion.name);

    const embed = new EmbedBuilder()
      .setTitle(`🎉 ${randomChampion.name} 챔피언 획득!`)
      .setDescription(`🧙 ${randomChampion.type} 타입\n🌟 ${lore}`)
      .addFields({
        name: "📊 기본 능력치",
        value: `🗡️ 공격력: ${randomChampion.stats.attack}\n✨ 주문력: ${randomChampion.stats.ap}\n❤️ 체력: ${randomChampion.stats.hp}\n🛡️ 방어력: ${randomChampion.stats.defense}\n💥 관통력: ${randomChampion.stats.penetration}`
      })
      .setThumbnail(icon)
      .setImage(splash)
      .setColor(0xffc107)
      .setFooter({ text: `${interaction.user.username} 님의 첫 챔피언` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
