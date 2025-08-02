const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder 
} = require("discord.js");
const fs = require("fs");

const PERIODS = [
  { label: '1일', value: '1', description: '최근 1일', },
  { label: '7일', value: '7', description: '최근 7일', },
  { label: '30일', value: '30', description: '최근 30일', },
  { label: '60일', value: '60', description: '최근 60일', },
  { label: '90일', value: '90', description: '최근 90일', },
];

const EXCLUDED_USER_IDS = ["285645561582059520", "638742607861645372"];
const EXCLUDED_ROLE_IDS = ["1205052922296016906"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("이용현황")
    .setDescription("기간별 전체 활동 랭킹을 확인"),
  async execute(interaction) {
    let period = '1';
    let mainPage = 0;

    function getDateRange(period) {
      if (period === 'all') return { from: null, to: null };
      const now = new Date();
      const to = now.toISOString().slice(0, 10);
      now.setDate(now.getDate() - (parseInt(period, 10) - 1));
      const from = now.toISOString().slice(0, 10);
      return { from, to };
    }

    function getPeriodRow(selected) {
      return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("select_period")
          .setPlaceholder("기간 선택")
          .addOptions(PERIODS.map(p => ({
            label: p.label,
            value: p.value,
            description: p.description,
            default: p.value === selected,
          })))
      );
    }

    function getPageRow() {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("prev").setLabel("이전").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("next").setLabel("다음").setStyle(ButtonStyle.Secondary)
      );
    }

    // 활동 임베드(이름별 그대로, 유저별/통합 없음)
    function buildActivityEmbed({ guild, page = 0 }) {
      const pageSize = 10;
      // 활동 로그 불러오기
      let activityData = fs.existsSync("activity-logs.json")
        ? JSON.parse(fs.readFileSync("activity-logs.json", "utf-8"))
        : {};

      // 단순 집계용 Map (활동명별)
      const activityCounts = {};

      for (const uid in activityData) {
        if (EXCLUDED_USER_IDS.includes(uid)) continue;
        const member = guild.members.cache.get(uid);
        if (!member) continue;
        if (member.roles.cache.some(role => EXCLUDED_ROLE_IDS.includes(role.id))) continue;

        const list = activityData[uid];
        for (const act of list) {
          if (act.activityType !== "game") continue;
          const name = act.details.name;
          if (!activityCounts[name]) activityCounts[name] = 0;
          activityCounts[name]++;
        }
      }
      // 순위 정렬
      const sorted = Object.entries(activityCounts)
        .sort((a, b) => b[1] - a[1]);

      const totalPages = Math.ceil(sorted.length / pageSize) || 1;
      const show = sorted.slice(page * pageSize, (page + 1) * pageSize);

      let desc = show.length
        ? show.map((a, idx) =>
          `**${page * pageSize + idx + 1}위** ${a[0]} ${a[1]}회`
        ).join("\n")
        : "활동 기록 없음";
      return new EmbedBuilder()
        .setTitle(`🎮 전체 활동 TOP`)
        .setDescription(desc)
        .setFooter({ text: `${page + 1} / ${totalPages} 페이지` });
    }

    async function getStatsEmbed(page, period) {
      return {
        embed: buildActivityEmbed({
          guild: interaction.guild,
          page,
        }),
        totalPages: (() => {
          let activityData = fs.existsSync("activity-logs.json")
            ? JSON.parse(fs.readFileSync("activity-logs.json", "utf-8"))
            : {};
          const activityCounts = {};
          for (const uid in activityData) {
            if (EXCLUDED_USER_IDS.includes(uid)) continue;
            const member = interaction.guild.members.cache.get(uid);
            if (!member) continue;
            if (member.roles.cache.some(role => EXCLUDED_ROLE_IDS.includes(role.id))) continue;
            const list = activityData[uid];
            for (const act of list) {
              if (act.activityType !== "game") continue;
              const name = act.details.name;
              if (!activityCounts[name]) activityCounts[name] = 0;
              activityCounts[name]++;
            }
          }
          return Math.ceil(Object.keys(activityCounts).length / 10) || 1;
        })(),
      };
    }

    // 최초 임베드
    const { embed, totalPages } = await getStatsEmbed(mainPage, period);

    let replyObj = {
      embeds: [embed],
      components: [
        getPeriodRow(period),
        getPageRow(),
      ],
      ephemeral: true,
    };

    await interaction.reply(replyObj);

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && (
        i.isButton() || i.isStringSelectMenu()
      ),
      time: 2 * 60 * 1000,
    });

    collector.on("collect", async i => {
      try {
        let updateEmbed = false;
        if (i.isButton()) {
          if (i.customId === "prev" && mainPage > 0) {
            mainPage--;
            updateEmbed = true;
          }
          if (i.customId === "next" && mainPage < totalPages - 1) {
            mainPage++;
            updateEmbed = true;
          }
        } else if (i.isStringSelectMenu()) {
          if (i.customId === "select_period") {
            period = i.values[0];
            mainPage = 0;
            updateEmbed = true;
          }
        }
        if (updateEmbed) {
          const { embed: newEmbed, totalPages: newTotal } = await getStatsEmbed(mainPage, period);
          await i.update({
            embeds: [newEmbed],
            components: [
              getPeriodRow(period),
              getPageRow(),
            ],
            ephemeral: true,
          });
        } else {
          if (!i.replied && !i.deferred) {
            await i.deferUpdate();
          }
        }
      } catch (err) {
        if (!String(err).includes("already been sent or deferred")) {
          console.error(err);
        }
      }
    });
  }
};
