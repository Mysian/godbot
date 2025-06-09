// 📁 commands/champion/champ-own.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const userDataPath = path.join(__dirname, "../data/champion-users.json");
const recordPath = path.join(__dirname, "../data/champion-records.json");
const championList = require("../utils/champion-data");
const {
  getChampionIcon,
  getChampionSplash,
  getChampionInfo
} = require("../utils/champion-utils");

function load(filePath) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "{}");
  return JSON.parse(fs.readFileSync(filePath));
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}일 전`;
  if (hours > 0) return `${hours}시간 전`;
  if (minutes > 0) return `${minutes}분 전`;
  return `방금 전`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("내챔피언")
    .setDescription("현재 보유 중인 챔피언 정보를 확인합니다."),

  async execute(interaction) {
    const userId = interaction.user.id;
    const userData = load(userDataPath);
    const recordData = load(recordPath);

    const champ = userData[userId];
    if (!champ || !champ.name) {
      return interaction.reply({
        content: "❌ 현재 보유 중인 챔피언이 없습니다. `/챔피언획득` 으로 하나 얻어보세요!",
        ephemeral: true
      });
    }

    const record = recordData[userId] ?? { win: 0, draw: 0, lose: 0 };
    const baseStats = championList.find(c => c.name === champ.name)?.stats;
    const stats = champ.stats || baseStats;
    const timeElapsed = champ.timestamp
      ? formatDuration(Date.now() - champ.timestamp)
      : "알 수 없음";

    // 비동기 함수이므로 await로 호출
    const icon = await getChampionIcon(champ.name);
    const splash = await getChampionSplash(champ.name);
    const lore = getChampionInfo(champ.name);

    const embed = new EmbedBuilder()
      .setTitle(`🏅 ${champ.name} 정보`)
      .setDescription(`**Lv.${champ.level ?? 0} | 강화 ${champ.success ?? 0}회**\n📆 ${timeElapsed}에 만남`)
      .addFields(
        { name: "📜 전적", value: `승: ${record.win} / 무: ${record.draw} / 패: ${record.lose}`, inline: true },
        {
          name: "📈 능력치",
          value: stats
            ? `🗡️ 공격력: ${stats.attack}\n✨ 주문력: ${stats.ap}\n❤️ 체력: ${stats.hp}\n🛡️ 방어력: ${stats.defense}\n💥 관통력: ${stats.penetration}`
            : "능력치 정보 없음",
          inline: true
        },
        { name: "🌟 설명", value: lore, inline: false }
      )
      .setThumbnail(icon)
      .setImage(splash)
      .setColor(0x7289da)
      .setFooter({ text: `요청자: ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
