const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const activity = require("../utils/activity-tracker");
const activityLogger = require("../utils/activity-logger");

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
    .setDescription("특정 기간, 필터, 유저별 활동량 및 TOP100 순위")
    .addUserOption(opt => opt.setName("유저").setDescription("특정 유저만 조회").setRequired(false)),
  async execute(interaction) {
    let period = '1'; // 기본값 **1일**
    let filterType = "all"; // all|message|voice|activity
    const user = interaction.options.getUser("유저");

    function getDateRange(period) {
      if (period === 'all') return { from: null, to: null };
      const now = new Date();
      const to = now.toISOString().slice(0, 10);
      now.setDate(now.getDate() - (parseInt(period, 10) - 1));
      const from = now.toISOString().slice(0, 10);
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

    // === 버튼 Row ===
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

    // === 활동 임베드 (랭킹/단일조회 모두)
    function buildActivityEmbed({ userId = null, userTag = null, guild = null, page = 0, isSingleUser = false }) {
      const pageSize = 10;
      if (!isSingleUser && guild) {
        // === 전체 랭킹(서버 모든 유저 TOP 활동) ===
        // 1. 전체 유저 활동 집계
        let activityData = require("fs").existsSync("activity-logs.json")
          ? JSON.parse(require("fs").readFileSync("activity-logs.json", "utf-8"))
          : {};

        // 2. 집계: [유저, 활동명, 횟수, 최근날짜] 형태로 정리
        let allStats = [];
        for (const uid in activityData) {
          if (EXCLUDED_USER_IDS.includes(uid)) continue;
          const member = guild.members.cache.get(uid);
          if (!member) continue;
          if (member.roles.cache.some(role => EXCLUDED_ROLE_IDS.includes(role.id))) continue;
          const list = activityData[uid];
          // 활동별 그룹화(게임+노래 따로)
          const actMap = {};
          for (const act of list) {
            let key = "";
            if (act.activityType === "game") key = `game|${act.details.name}`;
            else if (act.activityType === "music") key = `music|${act.details.song}|${act.details.artist}`;
            else continue;
            if (!actMap[key]) actMap[key] = [];
            actMap[key].push(act);
          }
          // 정리: [유저, 활동타입, 이름, 횟수, 최근날짜]
          for (const key in actMap) {
            const arr = actMap[key];
            const [type, ...rest] = key.split("|");
            const name = (type === "game") ? rest[0] : `${rest[0]} - ${rest[1]}`;
            allStats.push({
              userId: uid,
              userTag: member.user.tag,
              activityType: type,
              name,
              count: arr.length,
              last: Math.max(...arr.map(a => a.time)),
            });
          }
        }
        // 3. 횟수→최근 활동순 내림차순 정렬
        allStats.sort((a, b) => (b.count - a.count) || (b.last - a.last));
        const totalPages = Math.ceil(allStats.length / pageSize) || 1;
        const show = allStats.slice(page * pageSize, (page + 1) * pageSize);

        let desc = show.length
          ? show.map((a, idx) =>
            `**${page * pageSize + idx + 1}위** <@${a.userId}> \`${a.userTag}\`\n- ${a.activityType === "game" ? "🎮" : "🎵"} ${a.name} (${a.count}회) [최근: ${new Date(a.last).toLocaleString("ko-KR", { hour12: false })}]`
          ).join("\n\n")
          : "활동 기록 없음";
        return new EmbedBuilder()
          .setTitle(`🎮 서버 전체 활동 TOP`)
          .setDescription(desc)
          .setFooter({ text: `${page + 1} / ${totalPages} 페이지` });
      } else if (isSingleUser && userId) {
        // === 단일 유저 활동 ===
        let activities = activityLogger.getUserActivities(userId);
        // 활동별 그룹화(이름별 묶기)
        const actMap = {};
        for (const act of activities) {
          let key = "";
          if (act.activityType === "game") key = `game|${act.details.name}`;
          else if (act.activityType === "music") key = `music|${act.details.song}|${act.details.artist}`;
          else continue;
          if (!actMap[key]) actMap[key] = [];
          actMap[key].push(act);
        }
        // 정리: [활동타입, 이름, 횟수, 최근날짜]
        let stats = [];
        for (const key in actMap) {
          const arr = actMap[key];
          const [type, ...rest] = key.split("|");
          const name = (type === "game") ? rest[0] : `${rest[0]} - ${rest[1]}`;
          stats.push({
            activityType: type,
            name,
            count: arr.length,
            last: Math.max(...arr.map(a => a.time)),
          });
        }
        // 정렬: 횟수→최근 활동순 내림차순
        stats.sort((a, b) => (b.count - a.count) || (b.last - a.last));
        const totalPages = Math.ceil(stats.length / pageSize) || 1;
        const show = stats.slice(page * pageSize, (page + 1) * pageSize);

        let desc = show.length
          ? show.map((a, idx) =>
            `**${page * pageSize + idx + 1}위** ${a.activityType === "game" ? "🎮" : "🎵"} ${a.name} (${a.count}회)\n- 최근 기록: ${new Date(a.last).toLocaleString("ko-KR", { hour12: false })}`
          ).join("\n\n")
          : "활동 기록 없음";
        return new EmbedBuilder()
          .setTitle(`🎮 ${userTag || "유저"}의 활동 TOP`)
          .setDescription(desc)
          .setFooter({ text: `${page + 1} / ${totalPages} 페이지` });
      }
      // fallback
      return new EmbedBuilder().setDescription("기록 없음");
    }

    // ==== 초기 출력 ====
    let mainPage = 0;
    const { embed, totalPages } = await getStatsEmbed(mainPage, period, filterType, user);

    function getStatsEmbed(page, period, filterType, user) {
      if (filterType === "activity") {
        return {
          embed: buildActivityEmbed({
            userId: user ? user.id : null,
            userTag: user ? user.tag : null,
            guild: interaction.guild,
            page,
            isSingleUser: !!user
          }),
          totalPages: (() => {
            if (!user) {
              // 전체: activity-logs 전체 건수
              let activityData = require("fs").existsSync("activity-logs.json")
                ? JSON.parse(require("fs").readFileSync("activity-logs.json", "utf-8"))
                : {};
              let count = 0;
              for (const uid in activityData) {
                if (EXCLUDED_USER_IDS.includes(uid)) continue;
                const member = interaction.guild.members.cache.get(uid);
                if (!member) continue;
                if (member.roles.cache.some(role => EXCLUDED_ROLE_IDS.includes(role.id))) continue;
                const list = activityData[uid];
                // 활동별 그룹
                const actMap = {};
                for (const act of list) {
                  let key = "";
                  if (act.activityType === "game") key = `game|${act.details.name}`;
                  else if (act.activityType === "music") key = `music|${act.details.song}|${act.details.artist}`;
                  else continue;
                  if (!actMap[key]) actMap[key] = [];
                  actMap[key].push(act);
                }
                count += Object.keys(actMap).length;
              }
              return Math.ceil(count / 10) || 1;
            } else {
              let activities = activityLogger.getUserActivities(user.id);
              // 활동별 그룹
              const actMap = {};
              for (const act of activities) {
                let key = "";
                if (act.activityType === "game") key = `game|${act.details.name}`;
                else if (act.activityType === "music") key = `music|${act.details.song}|${act.details.artist}`;
                else continue;
                if (!actMap[key]) actMap[key] = [];
                actMap[key].push(act);
              }
              let count = Object.keys(actMap).length;
              return Math.ceil(count / 10) || 1;
            }
          })(),
          stats: null
        };
      }
      // 기존 랭킹 임베드
      const { from, to } = getDateRange(period);
      let stats = activity.getStats({ from, to, filterType, userId: user?.id || null });

      // 유저ID 필터
      stats = stats.filter(s => !EXCLUDED_USER_IDS.includes(s.userId));

      // 역할ID 필터 (필요시)
      if (EXCLUDED_ROLE_IDS.length && interaction.guild) {
        const userIds = stats.map(s => s.userId);
        const guildMembers = interaction.guild.members.cache;
        stats = stats.filter(s => {
          const member = guildMembers.get(s.userId);
          if (!member) return true;
          return !member.roles.cache.some(role => EXCLUDED_ROLE_IDS.includes(role.id));
        });
      }

      if (filterType === "message") stats.sort((a, b) => b.message - a.message);
      else if (filterType === "voice") stats.sort((a, b) => b.voice - a.voice);
      else stats.sort((a, b) => (b.message + b.voice) - (a.message + a.voice));
      // 페이징
      const pageSize = 15;
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
      const embed = new EmbedBuilder()
        .setTitle(`📊 활동 랭킹 [${getFilterLabel(filterType)}]`)
        .setDescription(list.length ? list : "해당 조건에 데이터 없음")
        .setFooter({ text: `기간: ${periodLabel} | ${page + 1}/${totalPages}페이지` });
      return { embed, totalPages, stats };
    }

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
      filter: i => i.user.id === interaction.user.id &&
        (i.isButton() || (i.isStringSelectMenu && i.isStringSelectMenu())),
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
        } else if (i.isStringSelectMenu && i.isStringSelectMenu()) {
          if (i.customId === "select_period") {
            period = i.values[0];
            mainPage = 0;
            updateEmbed = true;
          }
        }
        // 중복 reply/update 방지
        if (updateEmbed) {
          const { embed: newEmbed, totalPages: newTotal } = await getStatsEmbed(mainPage, period, filterType, user);
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
