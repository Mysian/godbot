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
    .setDescription("기간별 전체 활동/채팅/음성 랭킹을 확인"),
  async execute(interaction) {
    let period = '1';
    let filterType = "all"; // all, message, voice, activity
    let mainPage = 0;

    function getDateRange(period) {
  if (period === 'all') return { from: null, to: null };
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const to = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  now.setDate(now.getUTCDate() - (parseInt(period, 10) - 1));
  const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  return { from, to };
}


    function getFilterLabel(type) {
      if (type === "message") return "💬 채팅";
      if (type === "voice") return "🔊 음성";
      if (type === "activity") return "🎮 활동";
      return "🏅 종합";
    }

    function formatHourMinute(sec) {
      const totalMinutes = Math.round(sec / 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      let str = '';
      if (hours > 0) str += `${hours}시간`;
      if (minutes > 0 || hours === 0) str += `${minutes}분`;
      return str;
    }

    function getFilterRow(selected) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("filter_all")
          .setStyle(selected === "all" ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setEmoji("🏅")
          .setLabel("종합"),
        new ButtonBuilder()
          .setCustomId("filter_message")
          .setStyle(selected === "message" ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setEmoji("💬")
          .setLabel("채팅"),
        new ButtonBuilder()
          .setCustomId("filter_voice")
          .setStyle(selected === "voice" ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setEmoji("🔊")
          .setLabel("음성"),
        new ButtonBuilder()
          .setCustomId("filter_activity")
          .setStyle(selected === "activity" ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setEmoji("🎮")
          .setLabel("활동")
      );
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

    // 활동 임베드(전체)
    function buildActivityEmbed({ guild, page = 0 }) {
      const pageSize = 10;
      let activityData = fs.existsSync("activity-logs.json")
        ? JSON.parse(fs.readFileSync("activity-logs.json", "utf-8"))
        : {};
      // 활동명별 카운트
      const activityCounts = {};
      for (const uid in activityData) {
        const member = guild.members.cache.get(uid);
        // 모든 봇과 제외 유저/역할 무시
        if (!member || member.user.bot) continue;
        if (EXCLUDED_USER_IDS.includes(uid)) continue;
        if (member.roles.cache.some(role => EXCLUDED_ROLE_IDS.includes(role.id))) continue;
        const list = activityData[uid];
        for (const act of list) {
          if (act.activityType !== "game") continue;
          const name = act.details.name;
          if (!activityCounts[name]) activityCounts[name] = 0;
          activityCounts[name]++;
        }
      }
      // 내림차순 정렬
      const sorted = Object.entries(activityCounts).sort((a, b) => b[1] - a[1]);
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

    // 채팅/음성/종합 임베드(유저별)
    function buildStatsEmbed({ guild, page = 0, filterType = "all", period = "1" }) {
      const pageSize = 15;
      // 활동 통계 모듈로 집계 (기간반영)
      const { from, to } = getDateRange(period);
      const activity = require("../utils/activity-tracker");
      let stats = activity.getStats({ from, to, filterType, userId: null });

      // 봇/제외 유저/역할 필터
      stats = stats.filter(s => {
        const member = guild.members.cache.get(s.userId);
        if (!member) return false;
        if (member.user.bot) return false;
        if (EXCLUDED_USER_IDS.includes(s.userId)) return false;
        if (member.roles.cache.some(role => EXCLUDED_ROLE_IDS.includes(role.id))) return false;
        return true;
      });

      // 정렬
      if (filterType === "message") stats.sort((a, b) => b.message - a.message);
      else if (filterType === "voice") stats.sort((a, b) => b.voice - a.voice);
      else stats.sort((a, b) => (b.message + b.voice) - (a.message + a.voice));

      const totalPages = Math.ceil(Math.min(100, stats.length) / pageSize) || 1;
      let list = "";
      for (let i = page * pageSize; i < Math.min(stats.length, (page + 1) * pageSize); i++) {
        const s = stats[i];
        if (filterType === "message") {
          const msgStr = s.message.toLocaleString();
          list += `**${i + 1}위** <@${s.userId}> — 💬 ${msgStr}개\n`;
        } else if (filterType === "voice") {
          const voiceStr = formatHourMinute(s.voice);
          list += `**${i + 1}위** <@${s.userId}> — 🔊 ${voiceStr}\n`;
        } else {
          const msgStr = s.message.toLocaleString();
          const voiceStr = formatHourMinute(s.voice);
          list += `**${i + 1}위** <@${s.userId}> — 💬 ${msgStr}개, 🔊 ${voiceStr}\n`;
        }
      }
      const periodLabel = PERIODS.find(p => p.value === period)?.label || "전체";
      return new EmbedBuilder()
        .setTitle(`📊 활동 랭킹 [${getFilterLabel(filterType)}]`)
        .setDescription(list.length ? list : "해당 조건에 데이터 없음")
        .setFooter({ text: `기간: ${periodLabel} | ${page + 1}/${totalPages}페이지` });
    }

    async function getStatsEmbed(page, period, filterType) {
      if (filterType === "activity") {
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
              const member = interaction.guild.members.cache.get(uid);
              if (!member || member.user.bot) continue;
              if (EXCLUDED_USER_IDS.includes(uid)) continue;
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
      } else {
        const embed = buildStatsEmbed({
          guild: interaction.guild,
          page,
          filterType,
          period,
        });
        const { from, to } = getDateRange(period);
        const activity = require("../utils/activity-tracker");
        let stats = activity.getStats({ from, to, filterType, userId: null });
        stats = stats.filter(s => {
          const member = interaction.guild.members.cache.get(s.userId);
          if (!member) return false;
          if (member.user.bot) return false;
          if (EXCLUDED_USER_IDS.includes(s.userId)) return false;
          if (member.roles.cache.some(role => EXCLUDED_ROLE_IDS.includes(role.id))) return false;
          return true;
        });
        const pageSize = 15;
        const totalPages = Math.ceil(Math.min(100, stats.length) / pageSize) || 1;
        return { embed, totalPages };
      }
    }

    // 최초 임베드
    const { embed, totalPages } = await getStatsEmbed(mainPage, period, filterType);

    let replyObj = {
      embeds: [embed],
      components: [
        getFilterRow(filterType),
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
          if (i.customId.startsWith("filter_")) {
            const type = i.customId.replace("filter_", "");
            filterType = type;
            mainPage = 0;
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
          const { embed: newEmbed, totalPages: newTotal } = await getStatsEmbed(mainPage, period, filterType);
          await i.update({
            embeds: [newEmbed],
            components: [
              getFilterRow(filterType),
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

