const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const champions = require("../utils/champion-data");
const { getChampionIcon, getChampionSplash, getChampionInfo } = require("../utils/champion-utils");

// champ-up.js에서 복붙한 강화 스탯 계산 함수
function calcStatGain(level, baseAtk, baseAp) {
  let mainStat = baseAtk >= baseAp ? 'attack' : 'ap';
  let subStat = baseAtk >= baseAp ? 'ap' : 'attack';
  let mainGain = Math.floor((level / 5) + 2) * 1.5;
  let subGain = Math.floor((level / 7) + 1);
  let hpGain = (level * 5) + 50;
  let defGain = Math.floor((level / 10) + 1);
  let penGain = level % 2 === 0 ? 1 : 0;
  let gain = { attack: 0, ap: 0, hp: hpGain, defense: defGain, penetration: penGain };
  gain[mainStat] = mainGain;
  gain[subStat] = subGain;
  return { gain, mainStat, subStat };
}

const dataPath = path.join(__dirname, "../data/champion-users.json");
const ADMIN_ROLE_IDS = ["786128824365482025", "1201856430580432906"];
const PAGE_SIZE = 6;

async function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath));
}
async function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언지급")
    .setDescription("특정 유저에게 원하는 챔피언을 직접 지급합니다 (관리자 전용)")
    .addUserOption(opt =>
      opt.setName("유저")
        .setDescription("챔피언을 지급할 유저")
        .setRequired(true)
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.hasAny(...ADMIN_ROLE_IDS)) {
      return interaction.reply({ content: "❌ 관리자(스탭)만 사용할 수 있습니다.", ephemeral: true });
    }

    const targetUser = interaction.options.getUser("유저");
    const targetId = targetUser.id;
    let release;
    let page = 0;
    const pageMax = Math.ceil(champions.length / PAGE_SIZE);

    async function renderPage(page) {
      const start = page * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      const champs = champions.slice(start, end);

      const embed = new EmbedBuilder()
        .setTitle(`챔피언 지급 (페이지 ${page + 1}/${pageMax})`)
        .setDescription(`아래에서 지급할 챔피언을 선택하세요.\n\n(유저: <@${targetId}>)`)
        .setColor(0x00bcd4);

      for (const champ of champs) {
        embed.addFields({
          name: champ.name,
          value:
            `타입: ${champ.type}\n` +
            `🗡️ 공격력: ${champ.stats.attack}  ✨ 주문력: ${champ.stats.ap}\n` +
            `❤️ 체력: ${champ.stats.hp}  🛡️ 방어: ${champ.stats.defense}  💥 관통: ${champ.stats.penetration}`
        });
      }

      const buttonRows = [];
      for (let i = 0; i < champs.length; i += 5) {
        const row = new ActionRowBuilder();
        for (const champ of champs.slice(i, i + 5)) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`give-${champ.name}`)
              .setLabel(`${champ.name} 지급`)
              .setStyle(ButtonStyle.Primary)
          );
        }
        buttonRows.push(row);
      }

      const navButtons = new ActionRowBuilder();
      navButtons.addComponents(
        new ButtonBuilder()
          .setCustomId("page-prev")
          .setLabel("◀️ 이전")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("page-next")
          .setLabel("다음 ▶️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === pageMax - 1)
      );
      return { embed, buttonRows, navButtons };
    }

    let { embed, buttonRows, navButtons } = await renderPage(page);

    await interaction.reply({
      embeds: [embed],
      components: [...buttonRows, navButtons],
      ephemeral: true
    });

    const filter = i =>
      i.user.id === interaction.user.id &&
      (i.customId.startsWith("give-") ||
        i.customId === "page-prev" ||
        i.customId === "page-next");

    const collector = interaction.channel.createMessageComponentCollector({
      filter,
      time: 60000
    });

    collector.on("collect", async i => {
      if (i.customId === "page-prev" && page > 0) {
        page--;
        const { embed, buttonRows, navButtons } = await renderPage(page);
        await i.update({ embeds: [embed], components: [...buttonRows, navButtons] });
        return;
      }
      if (i.customId === "page-next" && page < pageMax - 1) {
        page++;
        const { embed, buttonRows, navButtons } = await renderPage(page);
        await i.update({ embeds: [embed], components: [...buttonRows, navButtons] });
        return;
      }
      if (i.customId.startsWith("give-")) {
        const champName = i.customId.replace("give-", "");
        let data;
        try {
          release = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
          data = await loadData();
          if (data[targetId]) {
            await i.update({
              content: `❌ <@${targetId}> 님은 이미 챔피언 **${data[targetId].name}**을(를) 보유 중입니다!`,
              embeds: [],
              components: [],
              ephemeral: true
            });
            collector.stop();
            return;
          }
          // 강화 레벨 입력 모달
          const modal = new ModalBuilder()
            .setCustomId(`give-modal-${champName}-${targetId}`)
            .setTitle("강화 레벨 입력 (0~999)")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("level")
                  .setLabel("지급할 강화 레벨 (0~999)")
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder("예: 0")
                  .setMinLength(1)
                  .setMaxLength(3)
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          collector.stop();
        } catch (err) {
          if (release) try { await release(); } catch {}
          await i.update({
            content: "❌ 지급 도중 오류가 발생했습니다. 다시 시도해 주세요.",
            embeds: [],
            components: [],
            ephemeral: true
          });
        }
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },

  // 여기! 모달 submit 로직만 분리!
  async modalSubmit(interaction) {
    const parts = interaction.customId.split("-");
    const champName = parts.slice(2, parts.length - 1).join("-"); // champName에는 -가 있을 수 있음
    const targetId = parts[parts.length - 1];

    let data, release2;
    try {
      const levelInput = interaction.fields.getTextInputValue("level").replace(/[^0-9]/g, "");
      let level = parseInt(levelInput, 10);
      if (isNaN(level) || level < 0) level = 0;
      if (level > 999) level = 999;

      release2 = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
      data = await loadData();
      if (data[targetId]) {
        await interaction.reply({
          content: `❌ <@${targetId}> 님은 이미 챔피언 **${data[targetId].name}**을(를) 보유 중입니다!`,
          ephemeral: true
        });
        return;
      }
      const champ = champions.find(c => c.name === champName);
      // 스탯계산
      let stats = { ...champ.stats };
      if (level > 0) {
        let { gain } = calcStatGain(level, stats.attack, stats.ap);
        stats.attack += gain.attack;
        stats.ap += gain.ap;
        stats.hp += gain.hp;
        stats.defense += gain.defense;
        stats.penetration += gain.penetration;
      }
      data[targetId] = {
        name: champ.name,
        level,
        success: 0,
        stats,
        timestamp: Date.now()
      };
      await saveData(data);

      const icon   = await getChampionIcon(champ.name);
      const splash = await getChampionSplash(champ.name);
      const lore   = getChampionInfo(champ.name);

      const resultEmbed = new EmbedBuilder()
        .setTitle(`🎁 챔피언 지급 완료!`)
        .setDescription(
          `<@${targetId}> 님에게 **${champ.name}** 챔피언이 지급되었습니다!\n강화 레벨: **${level}강**`
        )
        .addFields(
          { name: "설명", value: lore }
        )
        .setThumbnail(icon)
        .setImage(splash)
        .setColor(0x4caf50)
        .setTimestamp();

      await interaction.reply({
        embeds: [resultEmbed],
        components: [],
        ephemeral: false
      });
    } catch (err) {
      if (release2) try { await release2(); } catch {}
      await interaction.reply({
        content: "❌ 지급 도중 오류가 발생했습니다. 다시 시도해 주세요.",
        ephemeral: true
      });
    } finally {
      if (release2) try { await release2(); } catch {}
    }
  }
};
