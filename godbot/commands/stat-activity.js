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
    let filterType = "all";
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

    // === 활동 버튼 Row ===
    function getActivityRow(isSingle = false, activityPage = 0, activityTab = "game") {
      if (!isSingle) {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("show_activity")
            .setStyle(ButtonStyle.Secondary)
            .setLabel("🎮 활동")
        );
      } else {
        // 단일조회: 탭 + 페이지
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("activity_tab_game")
            .setStyle(activityTab === "game" ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setLabel("게임"),
          new ButtonBuilder()
            .setCustomId("activity_tab_music")
            .setStyle(activityTab === "music" ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setLabel("노래"),
          new ButtonBuilder()
            .setCustomId("activity_prev")
            .setStyle(ButtonStyle.Secondary)
            .setLabel("이전"),
          new ButtonBuilder()
            .setCustomId("activity_next")
            .setStyle(ButtonStyle.Secondary)
            .setLabel("다음"),
          new ButtonBuilder()
            .setCustomId("activity_close")
            .setStyle(ButtonStyle.Danger)
            .setLabel("닫기"),
        );
      }
    }

    // === 활동 임베드 (Top 1 or 리스트) ===
    function buildActivityEmbed(userId, userTag, activities, type = "game", page = 0, isList = false) {
      let filtered = activities.filter(a => a.activityType === type);
      if (filtered.length === 0) {
        return new EmbedBuilder()
          .setTitle(`🎮 ${type === "game" ? "게임" : "노래"} 기록`)
          .setDescription("기록 없음");
      }
      // 최다 활동
      if (!isList) {
        // 카운트 세기
        const countMap = {};
        filtered.forEach(a => {
          const key = type === "game" ? a.details.name : `${a.details.song} - ${a.details.artist}`;
          countMap[key] = (countMap[key] || 0) + 1;
        });
        // 최다 항목 뽑기
        let maxKey = null;
        let maxCnt = 0;
        for (const key in countMap) {
          if (countMap[key] > maxCnt) {
            maxKey = key;
            maxCnt = countMap[key];
          }
        }
        let desc = maxKey
          ? `**${maxKey}**\n(${maxCnt}회 기록됨)`
          : "기록 없음";
        return new EmbedBuilder()
          .setTitle(`🎮 활동 기록`)
          .setDescription(type === "game" ? `가장 많이 한 게임\n${desc}` : `가장 많이 들은 노래\n${desc}`);
      } else {
        // 리스트 페이지네이션
        const pageSize = 10;
        const totalPages = Math.ceil(filtered.length / pageSize) || 1;
        let pageData = filtered
          .sort((a, b) => b.time - a.time)
          .slice(page * pageSize, (page + 1) * pageSize);
        let desc = pageData
          .map(a => {
            let timeStr = new Date(a.time).toLocaleString("ko-KR", { hour12: false });
            if (type === "game") return `🎮 **${a.details.name}**\n- ${timeStr}`;
            if (type === "music") return `🎵 **${a.details.song}** - ${a.details.artist}\n- ${timeStr}`;
          })
          .join("\n\n");
        return new EmbedBuilder()
          .setTitle(`🎮 활동 내역 (${type === "game" ? "게임" : "노래"})`)
          .setDescription(desc)
          .setFooter({ text: `${page + 1} / ${totalPages} 페이지 | ${userTag}` });
      }
    }

    // === 기존 랭킹 Embed ===
    async function getStatsEmbed(page, period, filterType, user) {
      const { from, to } = getDateRange(period);
      let stats = activity.getStats({ from, to, filterType, userId: user?.id || null });

      // 유저ID 필터
      stats = stats.filter(s => !EXCLUDED_USER_IDS.includes(s.userId));

      // 역할ID 필터 (필요시)
      if (EXCLUDED_ROLE_IDS.length && interaction.guild) {
        const userIds = stats.map(s => s.userId);
        const guildMembers = await interaction.guild.members.fetch({ user: userIds, force: true });
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

    // === 페이징/필터 Row ===
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

    // ==== 초기 출력 ====
    const { embed, totalPages } = await getStatsEmbed(0, period, filterType, user);
    let mainPage = 0;
    let activityTab = "game"; // 단일 활동 탭: 'game' | 'music'
    let activityPage = 0;

    let replyObj = {
      embeds: [embed],
      components: [
        getFilterRow(filterType),
        getPeriodRow(period),
        getPageRow(),
        getActivityRow(!!user),
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
        // === 활동 버튼 클릭 ===
        if (i.isButton() && i.customId === "show_activity" && !user) {
          // 랭킹에서 버튼 누르면: 자기꺼만!
          const activities = activityLogger.getUserActivities(i.user.id);
          let embedGame = buildActivityEmbed(i.user.id, i.user.tag, activities, "game");
          let embedMusic = buildActivityEmbed(i.user.id, i.user.tag, activities, "music");
          await i.reply({
            embeds: [embedGame, embedMusic],
            ephemeral: true,
          });
          return;
        }

        // === 단일조회 → 활동 버튼 클릭 ===
        if (i.isButton() && i.customId === "show_activity" && user) {
          // 단일조회일 땐 '탭+페이지' 방식
          mainPage = 0;
          activityPage = 0;
          activityTab = "game";
          const activities = activityLogger.getUserActivities(user.id);
          let embed = buildActivityEmbed(user.id, user.tag, activities, activityTab, activityPage, true);
          await i.update({
            embeds: [embed],
            components: [getActivityRow(true, activityPage, activityTab)],
            ephemeral: true,
          });
          return;
        }

        // === 단일조회 활동 내역 페이징 및 탭 ===
        if (user && i.customId?.startsWith("activity_")) {
          const activities = activityLogger.getUserActivities(user.id);
          let filtered = activities.filter(a => a.activityType === activityTab);
          const totalPages = Math.ceil(filtered.length / 10) || 1;
          if (i.customId === "activity_tab_game") {
            activityTab = "game"; activityPage = 0;
          }
          if (i.customId === "activity_tab_music") {
            activityTab = "music"; activityPage = 0;
          }
          if (i.customId === "activity_prev") {
            if (activityPage > 0) activityPage--;
          }
          if (i.customId === "activity_next") {
            if (activityPage < totalPages - 1) activityPage++;
          }
          if (i.customId === "activity_close") {
            // 현황메인으로 복귀
            const { embed: mainEmbed } = await getStatsEmbed(mainPage, period, filterType, user);
            await i.update({
              embeds: [mainEmbed],
              components: [
                getFilterRow(filterType),
                getPeriodRow(period),
                getPageRow(),
                getActivityRow(true),
              ],
              ephemeral: true,
            });
            return;
          }
          // 다시 embed 출력
          let embed = buildActivityEmbed(user.id, user.tag, activities, activityTab, activityPage, true);
          await i.update({
            embeds: [embed],
            components: [getActivityRow(true, activityPage, activityTab)],
            ephemeral: true,
          });
          return;
        }

        // === 기존 랭킹 페이징/필터/기간 ===
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
              getActivityRow(!!user),
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
