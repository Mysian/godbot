const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  UserSelectMenuBuilder
} = require("discord.js");
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
    let period = '1';
    let filterType = "all";
    let selectedUser = interaction.options.getUser("유저") || null;
    let mainPage = 0;

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

    // 🔥 유저 셀렉트 메뉴(서버 멤버 최대 25명)
    function getUserSelectRow(selectedUserId = null) {
      // 멤버 리스트 25명만 출력 (서버 인원수 많으면 제한)
      const users = Array.from(interaction.guild.members.cache.values())
        .filter(m => !m.user.bot && !EXCLUDED_USER_IDS.includes(m.id))
        .slice(0, 25);
      return new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId("select_user")
          .setPlaceholder(selectedUserId ? "유저 선택: " + (users.find(m => m.id === selectedUserId)?.user.username || "유저") : "유저 선택")
          .setMinValues(1)
          .setMaxValues(1)
      );
    }

    // === 활동 임베드 (랭킹/단일조회 모두)
    function buildActivityEmbed({ userId = null, userTag = null, guild = null, page = 0, isSingleUser = false }) {
      const pageSize = 10;
      if (!isSingleUser && guild) {
        let activityData = require("fs").existsSync("activity-logs.json")
          ? JSON.parse(require("fs").readFileSync("activity-logs.json", "utf-8"))
          : {};

        let allStats = [];
        for (const uid in activityData) {
          if (EXCLUDED_USER_IDS.includes(uid)) continue;
          const member = guild.members.cache.get(uid);
          if (!member) continue;
          if (member.roles.cache.some(role => EXCLUDED_ROLE_IDS.includes(role.id))) continue;
          const list = activityData[uid];
          const actMap = {};
          for (const act of list) {
            let key = "";
            if (act.activityType === "game") key = `game|${act.details.name}`;
            else if (act.activityType === "music") key = `music|${act.details.song}|${act.details.artist}`;
            else continue;
            if (!actMap[key]) actMap[key] = [];
            actMap[key].push(act);
          }
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
        allStats.sort((a, b) => (b.count - a.count) || (b.last - a.last));
        const totalPages = Math.ceil(allStats.length / pageSize) || 1;
        const show = allStats.slice(page * pageSize, (page + 1) * pageSize);

        let desc = show.length
          ? show.map((a, idx) =>
            `**${page * pageSize + idx + 1}위** <@${a.userId}> \`${a.userTag}\`\n- ${a.activityType === "game" ? "🎮" : "🎵"} ${a.name} (${a.count}회) [최근: ${new Date(a.last).toLocaleString("ko-KR", { hour12: false, timeZone: "Asia/Seoul" })}]`
          ).join("\n\n")
          : "활동 기록 없음";
        return new EmbedBuilder()
          .setTitle(`🎮 서버 전체 활동 TOP`)
          .setDescription(desc)
          .setFooter({ text: `${page + 1} / ${totalPages} 페이지` });
      } else if (isSingleUser && userId) {
        let activities = activityLogger.getUserActivities(userId);
        const actMap = {};
        for (const act of activities) {
          let key = "";
          if (act.activityType === "game") key = `game|${act.details.name}`;
          else if (act.activityType === "music") key = `music|${act.details.song}|${act.details.artist}`;
          else continue;
          if (!actMap[key]) actMap[key] = [];
          actMap[key].push(act);
        }
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
        stats.sort((a, b) => (b.count - a.count) || (b.last - a.last));
        const totalPages = Math.ceil(stats.length / pageSize) || 1;
        const show = stats.slice(page * pageSize, (page + 1) * pageSize);

        let desc = show.length
          ? show.map((a, idx) =>
            `**${page * pageSize + idx + 1}위** ${a.activityType === "game" ? "🎮" : "🎵"} ${a.name} (${a.count}회)\n- 최근 기록: ${new Date(a.last).toLocaleString("ko-KR", { hour12: false, timeZone: "Asia/Seoul" })}`
          ).join("\n\n")
          : "활동 기록 없음";
        return new EmbedBuilder()
          .setTitle(`🎮 ${userTag || "유저"}의 활동 TOP`)
          .setDescription(desc)
          .setFooter({ text: `${page + 1} / ${totalPages} 페이지` });
      }
      return new EmbedBuilder().setDescription("기록 없음");
    }

    async function getStatsEmbed(page, period, filterType, user) {
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
      const { from, to } = getDateRange(period);
      let stats = activity.getStats({ from, to, filterType, userId: user?.id || null });

      stats = stats.filter(s => !EXCLUDED_USER_IDS.includes(s.userId));

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

    // 최초 임베드 응답
    const { embed, totalPages } = await getStatsEmbed(mainPage, period, filterType, selectedUser);

    let replyObj = {
      embeds: [embed],
      components: [
        getUserSelectRow(selectedUser ? selectedUser.id : null), // 유저 셀렉트
        getFilterRow(filterType),
        getPeriodRow(period),
        getPageRow(),
      ],
      ephemeral: true,
    };

    await interaction.reply(replyObj);

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && (
        i.isButton() || i.isStringSelectMenu() || i.isUserSelectMenu()
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
        } else if (i.isUserSelectMenu()) {
          if (i.customId === "select_user" && i.values.length > 0) {
            selectedUser = await interaction.guild.members.fetch(i.values[0]).then(m => m.user).catch(() => null);
            mainPage = 0;
            updateEmbed = true;
          }
        }
        if (updateEmbed) {
          const { embed: newEmbed, totalPages: newTotal } = await getStatsEmbed(mainPage, period, filterType, selectedUser);
          await i.update({
            embeds: [newEmbed],
            components: [
              getUserSelectRow(selectedUser ? selectedUser.id : null),
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
