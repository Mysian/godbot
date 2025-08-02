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

    // === 활동 임베드 (종합/채팅/음성처럼 한장)
    function buildActivityEmbed(userId, userTag, activities, page = 0) {
      // 활동은 "게임/음악"을 함께 보여줌
      let games = activities.filter(a => a.activityType === "game");
      let musics = activities.filter(a => a.activityType === "music");
      const pageSize = 10;
      // 최신순
      games = games.sort((a, b) => b.time - a.time);
      musics = musics.sort((a, b) => b.time - a.time);
      const totalPages = Math.max(
        Math.ceil(games.length / pageSize) || 1,
        Math.ceil(musics.length / pageSize) || 1
      );
      // 한 페이지에 게임/음악 각 5개씩
      let gamesPage = games.slice(page * 5, (page + 1) * 5);
      let musicsPage = musics.slice(page * 5, (page + 1) * 5);
      let descGame = gamesPage.length
        ? gamesPage.map(a => `🎮 **${a.details.name}**\n- ${new Date(a.time).toLocaleString("ko-KR", { hour12: false })}`).join("\n\n")
        : "기록 없음";
      let descMusic = musicsPage.length
        ? musicsPage.map(a => `🎵 **${a.details.song}** - ${a.details.artist}\n- ${new Date(a.time).toLocaleString("ko-KR", { hour12: false })}`).join("\n\n")
        : "기록 없음";
      return new EmbedBuilder()
        .setTitle(`🎮 활동 내역 (최근)`)
        .setDescription(
          `**[게임]**\n${descGame}\n\n**[노래]**\n${descMusic}`
        )
        .setFooter({ text: `${page + 1} / ${totalPages} 페이지 | ${userTag}` });
    }

    // === 기존 랭킹 Embed ===
    async function getStatsEmbed(page, period, filterType, user) {
      if (filterType === "activity") {
        // 활동 임베드
        const activities = activityLogger.getUserActivities(user ? user.id : interaction.user.id);
        return {
          embed: buildActivityEmbed(user ? user.id : interaction.user.id, user ? user.tag : interaction.user.tag, activities, page),
          totalPages: Math.ceil(Math.max(
            (activities.filter(a => a.activityType === "game").length || 1) / 5,
            (activities.filter(a => a.activityType === "music").length || 1) / 5
          )) || 1,
          stats: null
        };
      }
      // --- 기존 랭킹 집계 ---
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

    // ==== 초기 출력 ====
    let mainPage = 0;
    const { embed, totalPages } = await getStatsEmbed(mainPage, period, filterType, user);

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
