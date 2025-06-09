const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const userDataPath = path.join(__dirname, "../data/champion-users.json");
const recordPath = path.join(__dirname, "../data/champion-records.json");
const championList = require("../utils/champion-data");

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

function getChampionImage(name) {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${encodeURIComponent(name)}_0.jpg`;
}

function getChampionInfo(name) {
  const loreMap = {
    "아트록스": "타락한 다르킨 검사로, 전쟁과 파괴의 화신입니다.",
    "아리": "매혹적인 구미호 마법사로, 영혼을 수집하는 능력을 지녔습니다.",
    "가렌": "데마시아의 정의로운 전사, 회전 베기가 주특기입니다.",
    "럭스": "빛의 마법사로, 강력한 레이저 궁극기를 사용합니다.",
    // ✨ 필요시 추가 가능
  };
  return loreMap[name] ?? "설명이 등록되지 않았습니다.";
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
    const baseStats = championList.find(c => c.name === champ.name)?.stats ?? champ.stats;

    const timeElapsed = formatDuration(Date.now() - champ.timestamp);
    const image = getChampionImage(champ.name);
    const lore = getChampionInfo(champ.name);

    const embed = new EmbedBuilder()
      .setTitle(`🏅 ${champ.name} 정보`)
      .setDescription(`**Lv.${champ.level ?? 0} | 강화 ${champ.success ?? 0}회**\n📆 ${timeElapsed}에 만남`)
      .addFields(
        { name: "📜 전적", value: `승: ${record.win} / 무: ${record.draw} / 패: ${record.lose}`, inline: true },
        { name: "📈 능력치", value: 
          `🗡️ 공격력: ${champ.stats.attack}\n✨ 주문력: ${champ.stats.ap}\n❤️ 체력: ${champ.stats.hp}\n🛡️ 방어력: ${champ.stats.defense}\n💥 관통력: ${champ.stats.penetration}`,
          inline: true },
        { name: "🌟 배경 이야기", value: lore }
      )
      .setThumbnail(image)
      .setColor(0x7289da)
      .setImage(image)
      .setFooter({ text: `요청자: ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
