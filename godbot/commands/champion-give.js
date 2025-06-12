const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const champions = require("../utils/champion-data");
const { getChampionIcon, getChampionSplash, getChampionInfo } = require("../utils/champion-utils");

const dataPath = path.join(__dirname, "../data/champion-users.json");
// 관리자 권한 체크: 필요하면 여기서 역할 ID로 제한 가능
const ADMIN_ROLE_IDS = ["786128824365482025", "1201856430580432906"];

async function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath));
}
async function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

const PAGE_SIZE = 6; // 한 페이지에 보여줄 챔피언 개수

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
    // 관리자 권한 체크 (메인/일반스탭)
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.hasAny(...ADMIN_ROLE_IDS)) {
      return interaction.reply({ content: "❌ 관리자(스탭)만 사용할 수 있습니다.", ephemeral: true });
    }

    const targetUser = interaction.options.getUser("유저");
    const targetId = targetUser.id;
    let release;

    // 첫 페이지 표시
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

      // 버튼을 5개씩 ActionRowBuilder에 나눠 담는다!
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

      // 페이지 이동 버튼
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

      // 버튼 행 반환 (챔피언 지급 버튼 여러 줄 + 네비게이션 1줄)
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
          // 지급 처리
          const champ = champions.find(c => c.name === champName);
          data[targetId] = {
            name: champ.name,
            level: 0,
            success: 0,
            stats: { ...champ.stats },
            timestamp: Date.now()
          };
          await saveData(data);

          const icon   = await getChampionIcon(champ.name);
          const splash = await getChampionSplash(champ.name);
          const lore   = getChampionInfo(champ.name);

          const resultEmbed = new EmbedBuilder()
            .setTitle(`🎁 챔피언 지급 완료!`)
            .setDescription(`<@${targetId}> 님에게 **${champ.name}** 챔피언이 지급되었습니다!`)
            .addFields(
              { name: "설명", value: lore }
            )
            .setThumbnail(icon)
            .setImage(splash)
            .setColor(0x4caf50)
            .setTimestamp();

          await i.update({
            embeds: [resultEmbed],
            components: [],
            ephemeral: false
          });
          collector.stop();
        } catch (err) {
          if (release) try { await release(); } catch {}
          await i.update({
            content: "❌ 지급 도중 오류가 발생했습니다. 다시 시도해 주세요.",
            embeds: [],
            components: [],
            ephemeral: true
          });
        } finally {
          if (release) try { await release(); } catch {}
        }
      }
    });

    collector.on("end", () => {
      // 60초 지나면 버튼 비활성화
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }
};
