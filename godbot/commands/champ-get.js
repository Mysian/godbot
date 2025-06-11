// commands/champ-get.js
const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const champions = require("../utils/champion-data");
const skills = require("../utils/skills");
const skillCd = require("../utils/skills-cooldown");
const {
  getChampionIcon,
  getChampionSplash,
  getChampionInfo
} = require("../utils/champion-utils");
const lockfile = require("proper-lockfile"); // << 추가!

const dataPath = path.join(__dirname, "../data/champion-users.json");

async function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath));
}

async function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언획득")
    .setDescription("무작위 챔피언 1개를 획득합니다 (1회 제한)"),

  async execute(interaction) {
    const userId = interaction.user.id;

    // ▼▼ 파일 Lock 획득! (다른 명령어와 충돌 방지)
    let release;
    try {
      release = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });

      // -- 반드시 lock 걸린 상태에서만 파일 접근 --
      const data = await loadData();

      if (data[userId]) {
        await release();
        return interaction.reply({
          content: `❌ 이미 챔피언을 보유 중입니다: **${data[userId].name}**`,
          ephemeral: true
        });
      }

      const randomChampion = champions[
        Math.floor(Math.random() * champions.length)
      ];

      data[userId] = {
        name: randomChampion.name,
        level: 0,
        success: 0,
        stats: { ...randomChampion.stats },
        timestamp: Date.now()
      };
      await saveData(data);

      // --- 챔피언 이미지/스킬/쿨타임 정보 추가 ---
      const icon   = await getChampionIcon(randomChampion.name);
      const splash = await getChampionSplash(randomChampion.name);
      const lore   = getChampionInfo(randomChampion.name);

      // 스킬/쿨타임 정보
      const skillObj = skills[randomChampion.name];
      const cdObj = skillCd[randomChampion.name];
      let skillText = '정보 없음';
      if (skillObj && cdObj) {
        skillText =
          `**${skillObj.name}**\n${skillObj.description}\n` +
          `⏳ 최소턴: ${cdObj.minTurn ?? 1}턴, 쿨타임: ${cdObj.cooldown ?? 1}턴`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎉 ${randomChampion.name} 챔피언 획득!`)
        .setDescription(`🧙 ${randomChampion.type} 타입\n\n🌟 ${lore}`)
        .addFields(
          {
            name: "📊 기본 능력치",
            value: [
              `🗡️ 공격력: ${randomChampion.stats.attack}`,
              `✨ 주문력: ${randomChampion.stats.ap}`,
              `❤️ 체력: ${randomChampion.stats.hp}`,
              `🛡️ 방어력: ${randomChampion.stats.defense}`,
              `💥 관통력: ${randomChampion.stats.penetration}`
            ].join("\n"),
            inline: false
          },
          {
            name: "🪄 스킬 정보",
            value: skillText,
            inline: false
          }
        )
        .setThumbnail(icon)
        .setImage(splash)
        .setColor(0xffc107)
        .setFooter({ text: `${interaction.user.username} 님의 챔피언` })
        .setTimestamp();

      await release(); // 파일 lock 해제!

      return interaction.reply({
        embeds: [embed],
        ephemeral: true // 👈 본인만 볼 수 있게!
      });
    } catch (err) {
      if (release) await release();
      console.error("[챔피언획득] 파일 접근 오류:", err);
      return interaction.reply({
        content: "❌ 오류 발생! 잠시 후 다시 시도해주세요.",
        ephemeral: true
      });
    }
  }
};
