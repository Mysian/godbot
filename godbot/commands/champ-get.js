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

function formatNumber(num) {
  return num.toLocaleString("ko-KR");
}

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
    .setDescription(`정수(BE) ${BE_COST.toLocaleString()}개로 무작위 챔피언을 획득합니다 (7월 1일부터 비용 발생)`),

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
        await interaction.editReply(replyContent);

        // 이하 유기 버튼 로직 그대로
        const msg = await interaction.fetchReply();
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
        return;
      }

      // ========== 챔피언 획득 전 확인창 ==========

      const beAmount = getBE(userId);
      if (beAmount < BE_COST) {
        errorMessage = `❌ 파랑 정수(BE)가 부족합니다!\n(필요: ${formatNumber(BE_COST)}, 보유: ${formatNumber(beAmount)})`;
        return interaction.editReply({ content: errorMessage });
      }
      const beAfter = beAmount - BE_COST;

      const confirmEmbed = new EmbedBuilder()
        .setTitle("챔피언 획득 시도")
        .setDescription([
          `파랑 정수 **${formatNumber(BE_COST)}개**로 챔피언을 획득합니다.`,
          `현재 내 BE: **${formatNumber(beAmount)}개**`,
          `획득 시 잔액: **${formatNumber(beAfter)}개**`,
          `\n아래 버튼을 눌러 챔피언을 뽑을지 결정하세요!`
        ].join('\n'))
        .setColor(0x4185f4);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("champion-get-confirm")
          .setLabel(`챔피언 획득!`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("champion-get-cancel")
          .setLabel(`취소`)
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

      // 버튼 상호작용 대기
      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === userId &&
          ["champion-get-confirm", "champion-get-cancel"].includes(i.customId),
        time: 15000,
        max: 1
      });

      collector.on("collect", async i => {
        if (i.customId === "champion-get-cancel") {
          await i.update({
            content: "챔피언 획득이 취소되었습니다.",
            embeds: [],
            components: [],
            ephemeral: true
          });
          return;
        }

        // ========== 실제 BE 차감 및 챔피언 지급 ==========

        // 재확인(동시 클릭 등 대비)
        const beNow = getBE(userId);
        if (beNow < BE_COST) {
          await i.update({
            content: `❌ 파랑 정수(BE)가 부족합니다!\n(필요: ${formatNumber(BE_COST)}, 보유: ${formatNumber(beNow)})`,
            embeds: [],
            components: [],
            ephemeral: true
          });
          return;
        }

        addBE(userId, -BE_COST, "챔피언 획득");

        const randomChampion = champions[Math.floor(Math.random() * champions.length)];
        const data = await loadData();
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

        await i.update({ embeds: [embed], components: [row], ephemeral: true });

        // 유기 버튼(기존 로직과 동일)
        const msg2 = await i.fetchReply();
        const collector2 = msg2.createMessageComponentCollector({
          filter: x => x.user.id === userId && x.customId === "champion-dispose",
          time: 15000,
          max: 1
        });

        collector2.on("collect", async i2 => {
          let disposeRelease;
          try {
            disposeRelease = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
            const data = await loadData();
            const champ = data[userId];
            if (!champ) {
              await i2.update({
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
              await i2.update({
                content: `🗑️ **${name} (${lvl}강)** 챔피언이 유기되었습니다. 다시 /챔피언획득 명령어로 새 챔피언을 얻을 수 있습니다.`,
                embeds: [],
                components: [],
                ephemeral: true
              });
            }
          } catch (e) {
            await i2.update({
              content: "❌ 유기 처리 중 오류! 다시 시도해주세요.",
              embeds: [],
              components: [],
              ephemeral: true
            });
          } finally {
            if (disposeRelease) try { await disposeRelease(); } catch {}
          }
        });
      });

      collector.on("end", collected => { /* 버튼 만료 시 아무 처리 X */ });

    } catch (err) {
      console.error("[챔피언획득] 파일 접근 오류:", err);
      errorMessage = "❌ 오류 발생! 잠시 후 다시 시도해주세요.";
      if (release) try { await release(); } catch {}
      return interaction.editReply({ content: errorMessage });
    } finally {
      if (release) try { await release(); } catch {}
    }
  }
};
