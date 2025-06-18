// commands/champ-get.js
const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const champions = require("../utils/champion-data");
const passives = require("../utils/passive-skills"); // 패시브 정보로 교체!
const {
  getChampionIcon,
  getChampionSplash,
  getChampionInfo
} = require("../utils/champion-utils");
const lockfile = require("proper-lockfile");

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
    let release;
    let errorMessage = null;
    let replyContent = null;

    try {
      await interaction.deferReply({ ephemeral: true });
      release = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });

      const data = await loadData();

      if (data[userId]) {
        replyContent = { content: `❌ 이미 챔피언을 보유 중입니다: **${data[userId].name}**` };
      } else {
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

        const icon   = await getChampionIcon(randomChampion.name);
        const splash = await getChampionSplash(randomChampion.name);
        const lore   = getChampionInfo(randomChampion.name);

        // 패시브 정보 출력
        const passiveObj = passives[randomChampion.name];
        let passiveText = '정보 없음';
        if (passiveObj) {
          passiveText = `**${passiveObj.name}**\n${passiveObj.description}`;
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
              name: "🪄 패시브(지속효과) 정보",
              value: passiveText,
              inline: false
            },
            {
              name: "스킬 정보",
              value: '[준비중입니다.]',
              inline: false
            }
          )
          .setThumbnail(icon)
          .setImage(splash)
          .setColor(0xffc107)
          .setFooter({ text: `${interaction.user.username} 님의 챔피언` })
          .setTimestamp();

        replyContent = { embeds: [embed] };
      }
    } catch (err) {
      console.error("[챔피언획득] 파일 접근 오류:", err);
      errorMessage = "❌ 오류 발생! 잠시 후 다시 시도해주세요.";
    } finally {
      if (release) try { await release(); } catch {}
      // 오직 여기서만 editReply 1회 호출!
      if (errorMessage) {
        return interaction.editReply({ content: errorMessage });
      }
      if (replyContent) {
        return interaction.editReply(replyContent);
      }
      // 예외적으로 아무 응답도 못 만들었으면 그냥 editReply 호출 (응답 보장)
      return interaction.editReply({ content: "❌ 알 수 없는 오류! 잠시 후 다시 시도해주세요." });
    }
  }
};
