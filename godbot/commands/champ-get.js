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
const { getBE, addBE } = require("./be-util");

const dataPath = path.join(__dirname, "../data/champion-users.json");
const BE_COST = 0; // 파랑 정수 소모량

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
    .setDescription(`🔷정수(BE) ${BE_COST}으로 무작위 챔피언을 획득합니다 (7월 1일부터 100원 발생)`),

  async execute(interaction) {
    const userId = interaction.user.id;
    let release;
    let errorMessage = null;
    let replyContent = null;

    try {
      await interaction.deferReply({ ephemeral: true });
      release = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });

      const data = await loadData();

      // 이미 챔피언 보유 시 유기 버튼만 활성화!
      if (data[userId]) {
        const champ = data[userId];
        const embed = new EmbedBuilder()
          .setTitle(`❌ 이미 챔피언을 보유 중입니다!`)
          .setDescription(`현재 보유 중인 챔피언: **${champ.name} (${champ.level ?? 0}강)**`)
          .setColor(0xff6464);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("champion-dispose")
            .setLabel("🗑️ 챔피언 유기")
            .setStyle(ButtonStyle.Danger)
        );

        replyContent = { embeds: [embed], components: [row] };
      } else {
        // 파랑 정수 잔액 확인 및 차감
        const beAmount = getBE(userId);
        if (beAmount < BE_COST) {
          errorMessage = `❌ 정수(BE)가 부족합니다! (필요: ${BE_COST}, 보유: ${beAmount})`;
          return;
        }
        // 차감
        addBE(userId, -BE_COST, "챔피언 획득");

        // 무작위 챔피언 지급
        const randomChampion = champions[Math.floor(Math.random() * champions.length)];
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

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("champion-dispose")
            .setLabel("🗑️ 챔피언 유기")
            .setStyle(ButtonStyle.Danger)
        );

        replyContent = { embeds: [embed], components: [row] };
      }
    } catch (err) {
      console.error("[챔피언획득] 파일 접근 오류:", err);
      errorMessage = "❌ 오류 발생! 잠시 후 다시 시도해주세요.";
    } finally {
      if (release) try { await release(); } catch {}
      if (errorMessage) {
        return interaction.editReply({ content: errorMessage });
      }
      if (replyContent) {
        const msg = await interaction.editReply(replyContent);

        // 버튼 상호작용 핸들러
        const collector = msg.createMessageComponentCollector({
          filter: i => i.user.id === userId && i.customId === "champion-dispose",
          time: 15000,
          max: 1
        });

        collector.on("collect", async i => {
          // 유기 처리
          let disposeRelease;
          try {
            disposeRelease = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
            const data = await loadData();
            const champ = data[userId];
            if (!champ) {
              await i.update({
                content: "이미 유기된 챔피언입니다.",
                embeds: [],
                components: [],
                ephemeral: true
              });
            } else {
              const name = champ.name;
              const lvl = champ.level ?? 0;
              delete data[userId];
              await saveData(data);
              await i.update({
                content: `🗑️ **${name} (${lvl}강)** 챔피언이 유기되었습니다. 다시 /챔피언획득 명령어로 새 챔피언을 얻을 수 있습니다.`,
                embeds: [],
                components: [],
                ephemeral: true
              });
            }
          } catch (e) {
            await i.update({
              content: "❌ 유기 처리 중 오류! 다시 시도해주세요.",
              embeds: [],
              components: [],
              ephemeral: true
            });
          } finally {
            if (disposeRelease) try { await disposeRelease(); } catch {}
          }
        });

        collector.on("end", async collected => {
          // 버튼 클릭 없이 종료됐을 때 락 해제 등 별도처리 X (ephemeral이라 15초 지나면 버튼 사라짐)
        });
        return;
      }
      return interaction.editReply({ content: "❌ 알 수 없는 오류! 잠시 후 다시 시도해주세요." });
    }
  }
};
