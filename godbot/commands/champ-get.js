// commands/champ-get.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const champions = require("../utils/champion-data");
const passives = require("../utils/passive-skills");
const {
  getChampionIcon,
  getChampionSplash,
  getChampionInfo
} = require("../utils/champion-utils");
const lockfile = require("proper-lockfile");

const dataPath = path.join(__dirname, "../data/champion-users.json");

// 유저별 임시 저장공간 (주사위, 예정 챔피언)
const tempPickMap = new Map();
// 주사위 횟수 제한
const MAX_REROLL = 3;

async function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath));
}
async function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function getRandomChampion(excludeName) {
  let filtered = champions;
  if (excludeName) filtered = champions.filter(c => c.name !== excludeName);
  const randomChampion = filtered[Math.floor(Math.random() * filtered.length)];
  return randomChampion;
}

function makeChampionEmbed(user, champion, rerollLeft) {
  const icon = getChampionIcon(champion.name);
  const splash = getChampionSplash(champion.name);
  const lore = getChampionInfo(champion.name);
  const passiveObj = passives[champion.name];
  let passiveText = '정보 없음';
  if (passiveObj) {
    passiveText = `**${passiveObj.name}**\n${passiveObj.description}`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎲 ${champion.name} (예정)`)
    .setDescription(`🧙 ${champion.type} 타입\n\n🌟 ${lore}`)
    .addFields(
      {
        name: "📊 기본 능력치",
        value: [
          `🗡️ 공격력: ${champion.stats.attack}`,
          `✨ 주문력: ${champion.stats.ap}`,
          `❤️ 체력: ${champion.stats.hp}`,
          `🛡️ 방어력: ${champion.stats.defense}`,
          `💥 관통력: ${champion.stats.penetration}`
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
    .setFooter({ text: `${user.username} 님의 예정 챔피언` })
    .setTimestamp();

  return embed;
}

function makeActionRow(rerollLeft) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pick_champion')
        .setLabel('이 챔피언을 픽한다')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('reroll_champion')
        .setLabel(`주사위 굴리기 (${rerollLeft}회 남음)`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(rerollLeft <= 0)
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언획득")
    .setDescription("무작위 챔피언 1명을 획득합니다. (최대 1회, 3회까지 주사위 가능)"),
  async execute(interaction) {
    const userId = interaction.user.id;
    let release;
    let errorMessage = null;

    try {
      await interaction.deferReply({ ephemeral: true });
      release = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });

      const data = await loadData();

      if (data[userId]) {
        return interaction.editReply({
          content: `❌ 이미 챔피언을 보유 중입니다: **${data[userId].name}**`
        });
      }

      // 임시 pick/reset
      const rerollLeft = MAX_REROLL;
      const randomChampion = getRandomChampion();
      tempPickMap.set(userId, {
        champion: randomChampion,
        rerollLeft,
        interactionId: interaction.id
      });

      const embed = makeChampionEmbed(interaction.user, randomChampion, rerollLeft);
      const row = makeActionRow(rerollLeft);

      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });

    } catch (err) {
      console.error("[챔피언획득] 파일 접근 오류:", err);
      errorMessage = "❌ 오류 발생! 잠시 후 다시 시도해주세요.";
      if (release) try { await release(); } catch {}
      return interaction.editReply({ content: errorMessage });
    } finally {
      if (release) try { await release(); } catch {}
    }
  },

  // 버튼 상호작용 처리
  async handleButton(interaction) {
    const userId = interaction.user.id;
    const data = await loadData();

    if (data[userId]) {
      // 이미 챔피언 있으면 막기
      return interaction.update({
        content: `❌ 이미 챔피언을 보유 중입니다: **${data[userId].name}**`,
        embeds: [],
        components: []
      });
    }

    // 임시 pick 정보
    const pickInfo = tempPickMap.get(userId);
    if (!pickInfo) {
      return interaction.update({
        content: "❗ 명령어를 다시 사용해주세요.",
        embeds: [],
        components: []
      });
    }

    // interactionId 다르면, 새로운 명령어 세션임
    if (pickInfo.interactionId !== interaction.message.interaction.id) {
      return interaction.update({
        content: "⚠️ 다른 명령어 세션입니다. 다시 시도해주세요.",
        embeds: [],
        components: []
      });
    }

    if (interaction.customId === "pick_champion") {
      // 실제로 저장
      data[userId] = {
        name: pickInfo.champion.name,
        level: 0,
        success: 0,
        stats: { ...pickInfo.champion.stats },
        timestamp: Date.now()
      };
      await saveData(data);

      tempPickMap.delete(userId);

      const embed = new EmbedBuilder()
        .setTitle(`🎉 ${pickInfo.champion.name} 챔피언을 획득하였습니다!`)
        .setDescription("이제부터 나만의 챔피언으로 활용할 수 있습니다!")
        .setColor(0x00c853)
        .setFooter({ text: `${interaction.user.username} 님의 챔피언` })
        .setTimestamp();

      return interaction.update({
        embeds: [embed],
        components: []
      });

    } else if (interaction.customId === "reroll_champion") {
      // 주사위 횟수 확인
      if (pickInfo.rerollLeft <= 0) {
        return interaction.update({
          content: "❌ 주사위 굴리기 기회를 모두 소진했습니다.",
          embeds: [],
          components: []
        });
      }

      // 같은 챔피언 중복 방지
      const newChampion = getRandomChampion(pickInfo.champion.name);

      pickInfo.champion = newChampion;
      pickInfo.rerollLeft--;
      tempPickMap.set(userId, pickInfo);

      const embed = makeChampionEmbed(interaction.user, newChampion, pickInfo.rerollLeft);
      const row = makeActionRow(pickInfo.rerollLeft);

      return interaction.update({
        embeds: [embed],
        components: [row]
      });
    }
  }
};
