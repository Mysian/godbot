const {
  SlashCommandBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  AttachmentBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const os = require("os");

const EXCLUDE_ROLE_ID = "1371476512024559756";
const MONTHLY_ROLE_ID = "1352583279102001212";
const ADMIN_LOG_CHANNEL_ID = "1380874052855529605";
const SPAM_ROLE_ID = "1205052922296016906";
const PAGE_SIZE = 1900;
const dataDir = path.join(__dirname, "../data");
const adminpwPath = path.join(dataDir, "adminpw.json");

function loadAdminPw() {
  if (!fs.existsSync(adminpwPath)) return null;
  try {
    const { pw } = JSON.parse(fs.readFileSync(adminpwPath, "utf8"));
    return pw;
  } catch {
    return null;
  }
}

const activityTracker = require("../utils/activity-tracker.js");
const activityLogger = require("../utils/activity-logger.js");
const relationship = require("../utils/relationship.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("관리")
    .setDescription("서버 관리 명령어입니다.")
    .addStringOption((option) =>
      option
        .setName("옵션")
        .setDescription("실행할 관리 기능을 선택하세요.")
        .setRequired(true)
        .addChoices(
          { name: "유저 관리", value: "user" },
          { name: "서버상태", value: "status" },
          { name: "저장파일 백업", value: "json_backup" },
          { name: "스팸의심 계정 추방", value: "spam_kick" },
          { name: "활동 이력", value: "activity_log" }
        )
    ),

  async execute(interaction) {
    const option = interaction.options.getString("옵션");
    const guild = interaction.guild;
    const activityStats = activityTracker.getStats({});

    if (option === "status") {
      await interaction.deferReply({ ephemeral: true });

      const memory = process.memoryUsage();
      const rssMB = (memory.rss / 1024 / 1024);
      const heapMB = (memory.heapUsed / 1024 / 1024);

      const load = os.loadavg()[0]; // 1분 평균 CPU load
      const cpuCount = os.cpus().length;

      const uptimeSec = Math.floor(process.uptime());
      const uptime = (() => {
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;
        return `${h}시간 ${m}분 ${s}초`;
      })();

      // 메모리 상태
      let memState = "🟢";
      if (rssMB > 800) memState = "🔴";
      else if (rssMB > 400) memState = "🟡";

      // CPU 상태
      let cpuState = "🟢";
      if (load > cpuCount) cpuState = "🔴";
      else if (load > cpuCount / 2) cpuState = "🟡";

      // 전체 상태 평가
      let total = "🟢 안정적";
      if (memState === "🔴" || cpuState === "🔴") total = "🔴 불안정";
      else if (memState === "🟡" || cpuState === "🟡") total = "🟡 주의";

      // 상태별 코멘트
      let comment = "";
      if (total === "🟢 안정적") comment = "서버가 매우 쾌적하게 동작 중이에요!";
      else if (total === "🟡 주의") comment = "서버에 약간의 부하가 있으니 주의하세요.";
      else comment = "지금 서버가 상당히 무거워요! 재시작이나 최적화가 필요할 수 있음!";

      // 호스트 정보
      let hostInfo = `플랫폼: ${os.platform()} (${os.arch()})\n호스트: ${os.hostname()}`;
      if (process.env.RAILWAY_STATIC_URL) {
        hostInfo += `\nRailway URL: ${process.env.RAILWAY_STATIC_URL}`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${total} | 서버 상태 진단`)
        .setColor(total === "🔴 불안정" ? 0xff2222 : total === "🟡 주의" ? 0xffcc00 : 0x43e743)
        .setDescription(comment)
        .addFields(
          { name: `메모리 사용량 ${memState}`, value: `RSS: ${rssMB.toFixed(2)}MB\nheapUsed: ${heapMB.toFixed(2)}MB`, inline: true },
          { name: `CPU 부하율 ${cpuState}`, value: `1분 평균: ${load.toFixed(2)} / ${cpuCount}코어`, inline: true },
          { name: `실행시간(Uptime)`, value: uptime, inline: true },
          { name: "호스트정보", value: hostInfo, inline: false },
          { name: "Node 버전", value: process.version, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], ephemeral: true });
      return;
    }
    
    if (option === "json_backup") {
      const modal = new ModalBuilder()
        .setCustomId("adminpw_json_backup")
        .setTitle("관리 비밀번호 입력")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pw")
              .setLabel("비밀번호 4자리")
              .setStyle(TextInputStyle.Short)
              .setMinLength(4)
              .setMaxLength(4)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (option === "spam_kick") {
      await interaction.deferReply({ ephemeral: true });
      const members = await guild.members.fetch();
      const 추방대상 = [];

      for (const member of members.values()) {
        if (member.user.bot) continue;
        if (member.roles.cache.has(EXCLUDE_ROLE_ID)) continue;
        const roles = member.roles.cache;
        const hasSpamRole = roles.has(SPAM_ROLE_ID);
        const onlyNewbie =
          roles.size === 1 && roles.has("1295701019430227988");
        const onlySpam =
          roles.size === 1 && roles.has(SPAM_ROLE_ID);
        const noRole = roles.filter(r => r.id !== guild.id).size === 0;

        if (noRole || hasSpamRole || onlyNewbie || onlySpam) {
          추방대상.push(member);
        }
      }

      const descList = [];
      let totalLength = 0;
      for (const m of 추방대상) {
        const line = `• <@${m.id}> (${m.user.tag})`;
        if (totalLength + line.length + 1 < 4000) {
          descList.push(line);
          totalLength += line.length + 1;
        } else {
          descList.push(`외 ${추방대상.length - descList.length}명...`);
          break;
        }
      }

      const preview = new EmbedBuilder()
        .setTitle("[스팸의심 계정] 추방 대상 미리보기")
        .setDescription(
          추방대상.length ? descList.join("\n") : "✅ 추방 대상자가 없습니다."
        )
        .setColor(0xee4444);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("confirm_spam_kick")
          .setLabel("✅ 예")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("cancel_spam_kick")
          .setLabel("❌ 아니오")
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [preview], components: [row] });

      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 20000,
      });

      collector.on("collect", async (i) => {
        if (i.customId === "confirm_spam_kick") {
          await i.update({
            content: "⏳ 스팸의심 계정 추방 진행 중...",
            embeds: [],
            components: [],
          });

          let success = 0, failed = [];
          for (const member of 추방대상) {
            try {
              await member.kick("스팸/비정상 계정 자동 추방");
              await new Promise(res => setTimeout(res, 350));
              success++;
            } catch (err) {
              failed.push(`${member.user.tag}(${member.id})`);
            }
          }
          await interaction.followUp({
            content:
              `✅ ${success}명 추방 완료${failed.length ? `\n❌ 실패: ${failed.join(", ")}` : ""}`,
            ephemeral: true,
          });
        } else {
          await i.update({
            content: "❌ 추방이 취소되었습니다.",
            embeds: [],
            components: [],
          });
        }
      });

      collector.on("end", async (collected) => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: "⏰ 시간이 초과되어 추방이 취소되었습니다.",
            embeds: [],
            components: [],
          });
        }
      });
      return;
    }

    if (option === "activity_log") {
      await interaction.deferReply({ ephemeral: true });
      const userSelectRow = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId("activity_user_select_menu")
          .setPlaceholder("활동 이력 조회할 유저 선택")
          .setMinValues(1)
          .setMaxValues(1)
      );
      await interaction.editReply({
        content: "활동 이력을 조회할 유저를 선택하세요.",
        components: [userSelectRow],
        ephemeral: true
      });

      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id && i.customId === "activity_user_select_menu",
        time: 180 * 1000,
      });

      collector.on("collect", async (i) => {
        const selectedUserId = i.values[0];
        const member = await guild.members.fetch(selectedUserId).catch(() => null);
        if (!member) {
          await i.reply({ content: "❌ 해당 유저를 찾을 수 없습니다.", ephemeral: true });
          return;
        }
        await i.deferReply({ ephemeral: true });
        await showUserActivityLog(selectedUserId, i, 0);
      });

      async function showUserActivityLog(userId, parentInteraction, page = 0) {
        const user = await guild.members.fetch(userId).then(m => m.user).catch(() => null);
        if (!user) {
          await parentInteraction.editReply({ content: "❌ 유저를 찾을 수 없습니다.", ephemeral: true });
          return;
        }
        const activities = activityLogger.getUserActivities(userId).sort((a, b) => b.time - a.time);
        if (!activities.length) {
          await parentInteraction.editReply({ content: "최근 활동 기록이 없거나 디스코드 활동 기능을 OFF한 유저입니다.", ephemeral: true });
          return;
        }

        const perPage = 10;
        const startIdx = page * perPage;
        const pageData = activities.slice(startIdx, startIdx + perPage);

        const activityText = pageData.map((a, idx) => {
          const date = new Date(a.time).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
          let info = `\`${date}\` | [${a.activityType}]`;
          if (a.activityType === "game" && a.details?.name) {
            info += `: ${a.details.name}`;
          } else if (a.activityType === "music" && a.details?.song) {
            info += `: ${a.details.song} - ${a.details.artist || ''}`;
          } else if (a.details && typeof a.details === 'object') {
            info += `: ${Object.values(a.details).join(" / ")}`;
          }
          return `${startIdx + idx + 1}. ${info}`;
        }).join("\n");

        const embed = new EmbedBuilder()
          .setTitle(`${user.tag}님의 최근 활동 이력`)
          .setThumbnail(user.displayAvatarURL())
          .setDescription(activityText)
          .setFooter({ text: `페이지 ${page + 1} / ${Math.ceil(activities.length / perPage)}` })
          .setColor(0x7fdfff);

        const navRow = new ActionRowBuilder();
        navRow.addComponents(
          new ButtonBuilder()
            .setCustomId("activity_prev")
            .setLabel("◀ 이전")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId("activity_next")
            .setLabel("다음 ▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(startIdx + perPage >= activities.length)
        );

        await parentInteraction.editReply({
          embeds: [embed],
          components: [navRow],
          ephemeral: true
        });

        const buttonCollector = parentInteraction.channel.createMessageComponentCollector({
          filter: (btn) =>
            btn.user.id === interaction.user.id &&
            ["activity_prev", "activity_next"].includes(btn.customId),
          time: 180 * 1000,
        });

        buttonCollector.on("collect", async (btn) => {
          await btn.deferUpdate();
          if (btn.customId === "activity_prev" && page > 0) {
            await showUserActivityLog(userId, parentInteraction, page - 1);
            buttonCollector.stop();
          } else if (btn.customId === "activity_next" && startIdx + perPage < activities.length) {
            await showUserActivityLog(userId, parentInteraction, page + 1);
            buttonCollector.stop();
          }
        });
      }
      return;
    }

    if (option === "user") {
      await interaction.deferReply({ ephemeral: true });

      const userSelectRow = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId("user_select_menu")
          .setPlaceholder("관리할 유저 선택 (닉네임 일부 입력 가능)")
          .setMinValues(1)
          .setMaxValues(1)
      );

      await interaction.editReply({
        content: "관리할 유저를 선택하세요.\n(닉네임 일부 입력 시 자동 검색/필터)",
        components: [userSelectRow],
        ephemeral: true
      });

      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id && i.customId === "user_select_menu",
        time: 300 * 1000,
      });

      collector.on("collect", async (i) => {
        const selectedUserId = i.values[0];
        const member = await guild.members.fetch(selectedUserId).catch(() => null);
        if (!member) {
          await i.reply({ content: "❌ 해당 유저를 찾을 수 없습니다.", ephemeral: true });
          return;
        }
        await showUserInfo(selectedUserId, i, collector, i); // i를 parentInteraction으로 전달!
      });

      async function showUserInfo(targetUserId, userInteraction, collector, parentInteraction) {
        if (!userInteraction.deferred && !userInteraction.replied) {
          if (userInteraction.isButton?.() || userInteraction.isStringSelectMenu?.() || userInteraction.isUserSelectMenu?.()) {
            await userInteraction.deferUpdate();
          } else {
            await userInteraction.deferReply({ ephemeral: true });
          }
        }

        function formatSeconds(sec) {
          sec = Math.floor(sec || 0);
          const h = Math.floor(sec / 3600);
          const m = Math.floor((sec % 3600) / 60);
          const s = sec % 60;
          if (h) return `${h}시간 ${m}분 ${s}초`;
          if (m) return `${m}분 ${s}초`;
          return `${s}초`;
        }
        const target = await guild.members.fetch(targetUserId).then(m => m.user).catch(() => null);
        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (!member || !target) {
          const errorReply = { content: "❌ 해당 유저를 찾을 수 없습니다." };
          userInteraction.editReply
            ? await userInteraction.editReply(errorReply)
            : await userInteraction.update({ ...errorReply, embeds: [], components: [] });
          return;
        }

        const stat = activityStats.find((x) => x.userId === target.id) || { message: 0, voice: 0 };

        let lastActiveStr = "기록 없음";
        try {
          const lastActiveDate = activityTracker.getLastActiveDate(target.id);
          if (lastActiveDate) {
            lastActiveStr = lastActiveDate.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
          }
        } catch (err) {}

        const joinedAt = member.joinedAt;
        const joinedAtStr = joinedAt
          ? joinedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
          : "기록 없음";

        const topFriends = relationship.getTopRelations(target.id, 3);
        const relData = relationship.loadData()[target.id] || {};
        const enemiesArr = Object.entries(relData)
          .sort((a, b) => (a[1].stage - b[1].stage) || (a[1].remain - b[1].remain))
          .slice(0, 3)
          .map(([id, val]) => ({
            userId: id,
            stage: val.stage,
            remain: val.remain,
            relation: relationship.getRelationshipLevel(val.stage - 6),
          }));

        let friendsText = topFriends.length
          ? topFriends.map((x, i) => `#${i + 1} <@${x.userId}> (${x.relation})`).join("\n")
          : "없음";
        let enemiesText = enemiesArr.length
          ? enemiesArr.map((x, i) => `#${i + 1} <@${x.userId}> (${x.relation})`).join("\n")
          : "없음";

        let timeoutActive = false;
        let timeoutExpireStr = "";
        if (member.communicationDisabledUntil && member.communicationDisabledUntilTimestamp > Date.now()) {
          timeoutActive = true;
          timeoutExpireStr = `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`;
        }

        const hasLongStay = member.roles.cache.has(EXCLUDE_ROLE_ID);
        const hasMonthly = member.roles.cache.has(MONTHLY_ROLE_ID);

        const embed = new EmbedBuilder()
          .setTitle(`유저 정보: ${target.tag}`)
          .setThumbnail(target.displayAvatarURL())
          .addFields(
            { name: "유저 ID", value: target.id, inline: false },
            { name: "서버 입장일", value: joinedAtStr, inline: false },
            { name: "마지막 활동일", value: lastActiveStr, inline: false },
            { name: "메시지 수", value: `${stat.message || 0}`, inline: true },
            { name: "음성 이용 시간", value: formatSeconds(stat.voice), inline: true },
            { name: "가장 친한 유저 TOP3", value: friendsText, inline: false },
            { name: "가장 적대하는 유저 TOP3", value: enemiesText, inline: false },
            ...(timeoutActive
              ? [{ name: "⏱️ 타임아웃", value: `**활성화 중**\n만료: ${timeoutExpireStr}`, inline: false }]
              : [])
          )
          .setColor(0x00bfff);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(timeoutActive ? "timeout_release" : "timeout")
            .setLabel(timeoutActive ? "타임아웃 해제" : "타임아웃 (1일)")
            .setStyle(timeoutActive ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("kick")
            .setLabel("추방")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("refresh_userinfo")
            .setLabel("🔄 새로고침")
            .setStyle(ButtonStyle.Secondary)
        );

        const roleRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("toggle_longstay")
            .setLabel(hasLongStay ? "장기 투숙객 해제" : "장기 투숙객 부여")
            .setStyle(hasLongStay ? ButtonStyle.Secondary : ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("receive_monthly")
            .setLabel("월세 받기")
            .setStyle(ButtonStyle.Primary)
        );

        await userInteraction.editReply({
          embeds: [embed],
          components: [row, roleRow],
          content: "",
          ephemeral: true
        });

        if (!collector) return;
        collector.on("collect", async (i) => {
          if (i.user.id !== interaction.user.id) return;
          if (i.customId === "refresh_userinfo") {
            await i.deferUpdate();
            await showUserInfo(targetUserId, i, collector, parentInteraction);

          } else if (i.customId === "timeout" || i.customId === "kick") {
            const modal = new ModalBuilder()
              .setCustomId(`adminpw_user_${i.customId}_${targetUserId}`)
              .setTitle("관리 비밀번호 입력")
              .addComponents(
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId("pw")
                    .setLabel("비밀번호 4자리")
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(4)
                    .setMaxLength(4)
                    .setRequired(true)
                )
              );
            await i.showModal(modal);

          } else if (i.customId === "timeout_release") {
            await i.update({ content: "⏳ 타임아웃 해제 중...", embeds: [], components: [] });
            try {
              await i.guild.members.edit(targetUserId, { communicationDisabledUntil: null, reason: "관리 명령어로 타임아웃 해제" });
              await i.followUp({ content: `✅ <@${targetUserId}>님의 타임아웃이 해제되었습니다.`, ephemeral: true });
            } catch (err) {
              await i.followUp({ content: "❌ 타임아웃 해제 실패 (권한 문제일 수 있음)", ephemeral: true });
            }
            await showUserInfo(targetUserId, i, collector, parentInteraction);

          } else if (i.customId === "toggle_longstay") {
            const hasLongStay = member.roles.cache.has(EXCLUDE_ROLE_ID);
            let action, logMsg;
            if (hasLongStay) {
              await member.roles.remove(EXCLUDE_ROLE_ID, "장기 투숙객 해제");
              action = "해제";
              logMsg = `❌ 장기 투숙객 **해제**: <@${targetUserId}> (${member.user.tag})\n- **처리자:** <@${i.user.id}> (${i.user.tag})`;
            } else {
              await member.roles.add(EXCLUDE_ROLE_ID, "장기 투숙객 부여");
              action = "부여";
              logMsg = `✅ 장기 투숙객 **부여**: <@${targetUserId}> (${member.user.tag})\n- **처리자:** <@${i.user.id}> (${i.user.tag})`;
            }
            await i.reply({ content: `장기 투숙객 역할을 ${action}했습니다.`, ephemeral: true });
            await i.guild.channels.cache.get(ADMIN_LOG_CHANNEL_ID)?.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle("장기 투숙객 역할 변경")
                  .setDescription(logMsg)
                  .setColor(hasLongStay ? 0xff5555 : 0x55ff55)
                  .setTimestamp()
              ]
            });
            await showUserInfo(targetUserId, i, collector, parentInteraction);

          } else if (i.customId === "receive_monthly") {
            const hasMonthly = member.roles.cache.has(MONTHLY_ROLE_ID);
            if (!hasMonthly) {
              await i.reply({ content: "❌ 월세 납부자 역할이 없습니다. 받을 수 없습니다.", ephemeral: true });
              return;
            }
            await member.roles.remove(MONTHLY_ROLE_ID, "월세 받기 처리");
            await i.reply({ content: "월세 납부자 역할을 해제(월세 수령) 처리했습니다.", ephemeral: true });
            await i.guild.channels.cache.get(ADMIN_LOG_CHANNEL_ID)?.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle("월세 수령 처리")
                  .setDescription(`💸 월세 받기 처리: <@${targetUserId}> (${member.user.tag})\n월세 납부자 역할 해제\n- **처리자:** <@${i.user.id}> (${i.user.tag})`)
                  .setColor(0x4eaaff)
                  .setTimestamp()
              ]
            });
            await showUserInfo(targetUserId, i, collector, parentInteraction);

          } else if (i.customId === "view_activity_log") {
            await i.deferUpdate();
            await showUserActivityLog(targetUserId, parentInteraction, 0);
          }
        });

        async function showUserActivityLog(userId, parentInteraction, page = 0) {
          const user = await guild.members.fetch(userId).then(m => m.user).catch(() => null);
          if (!user) {
            await parentInteraction.editReply({ content: "❌ 유저를 찾을 수 없습니다.", ephemeral: true });
            return;
          }
          const activities = activityLogger.getUserActivities(userId).sort((a, b) => b.time - a.time);
          if (!activities.length) {
            await parentInteraction.editReply({ content: "최근 활동 기록이 없거나 디스코드 활동 기능을 OFF한 유저", ephemeral: true });
            return;
          }

          const perPage = 10;
          const startIdx = page * perPage;
          const pageData = activities.slice(startIdx, startIdx + perPage);

          const activityText = pageData.map((a, idx) => {
            const date = new Date(a.time).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
            let info = `\`${date}\` | [${a.activityType}]`;
            if (a.activityType === "game" && a.details?.name) {
              info += `: ${a.details.name}`;
            } else if (a.activityType === "music" && a.details?.song) {
              info += `: ${a.details.song} - ${a.details.artist || ''}`;
            } else if (a.details && typeof a.details === 'object') {
              info += `: ${Object.values(a.details).join(" / ")}`;
            }
            return `${startIdx + idx + 1}. ${info}`;
          }).join("\n");

          const embed = new EmbedBuilder()
            .setTitle(`${user.tag}님의 최근 활동 이력`)
            .setThumbnail(user.displayAvatarURL())
            .setDescription(activityText)
            .setFooter({ text: `페이지 ${page + 1} / ${Math.ceil(activities.length / perPage)}` })
            .setColor(0x7fdfff);

          const navRow = new ActionRowBuilder();
          navRow.addComponents(
            new ButtonBuilder()
              .setCustomId("activity_prev")
              .setLabel("◀ 이전")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page === 0),
            new ButtonBuilder()
              .setCustomId("activity_next")
              .setLabel("다음 ▶")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(startIdx + perPage >= activities.length)
          );

          await parentInteraction.editReply({
            embeds: [embed],
            components: [navRow],
            ephemeral: true
          });

          const buttonCollector = parentInteraction.channel.createMessageComponentCollector({
            filter: (btn) =>
              btn.user.id === interaction.user.id &&
              ["activity_prev", "activity_next"].includes(btn.customId),
            time: 180 * 1000,
          });

          buttonCollector.on("collect", async (btn) => {
            await btn.deferUpdate();
            if (btn.customId === "activity_prev" && page > 0) {
              await showUserActivityLog(userId, parentInteraction, page - 1);
              buttonCollector.stop();
            } else if (btn.customId === "activity_next" && startIdx + perPage < activities.length) {
              await showUserActivityLog(userId, parentInteraction, page + 1);
              buttonCollector.stop();
            }
          });
        }
      }
      return;
    } 
  },

  async modalSubmit(interaction) {
    const pw = interaction.fields.getTextInputValue("pw");
    const savedPw = loadAdminPw();
    if (!savedPw || pw !== savedPw) {
      await interaction.reply({ content: "❌ 비밀번호가 일치하지 않습니다.", ephemeral: true });
      return;
    }

    if (interaction.customId === "adminpw_json_backup") {
      const files = fs.existsSync(dataDir)
        ? fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"))
        : [];
      if (!files.length) {
        await interaction.reply({
          content: "data 폴더에 .json 파일이 없습니다.",
          ephemeral: true,
        });
        return;
      }

      const zip = new AdmZip();
      for (const file of files) {
        zip.addLocalFile(path.join(dataDir, file), "", file);
      }
      const now = new Date();
      const dateStr =
        now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, "0") +
        now.getDate().toString().padStart(2, "0") +
        "_" +
        now.getHours().toString().padStart(2, "0") +
        now.getMinutes().toString().padStart(2, "0") +
        now.getSeconds().toString().padStart(2, "0");
      const filename = `${dateStr}.zip`;
      const tmpPath = path.join(__dirname, `../data/${filename}`);
      zip.writeZip(tmpPath);

      const attachment = new AttachmentBuilder(tmpPath, { name: filename });
      await interaction.reply({
        content: `모든 .json 파일을 압축했습니다. (${filename})`,
        files: [attachment],
        ephemeral: true,
      });

      setTimeout(() => {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }, 60 * 1000);
      return;
    }

    if (interaction.customId.startsWith("adminpw_user_")) {
      const arr = interaction.customId.split("_");
      const action = arr[2];
      const targetUserId = arr.slice(3).join("_");
      if (action === "timeout") {
        try {
          await interaction.guild.members.edit(targetUserId, {
            communicationDisabledUntil: Date.now() + 24 * 60 * 60 * 1000,
            reason: "관리 명령어로 타임아웃 (1일)"
          });
          await interaction.reply({
            content: `✅ <@${targetUserId}>님에게 1일 타임아웃을 적용했습니다.`,
            ephemeral: true,
          });
        } catch (err) {
          await interaction.reply({
            content: "❌ 타임아웃 실패 (권한 문제일 수 있음)",
            ephemeral: true,
          });
        }
      } else if (action === "kick") {
        try {
          await interaction.guild.members.kick(targetUserId, "관리 명령어로 추방");
          await interaction.reply({
            content: `✅ <@${targetUserId}>님을 서버에서 추방했습니다.`,
            ephemeral: true,
          });
        } catch (err) {
          await interaction.reply({
            content: "❌ 추방 실패 (권한 문제일 수 있음)",
            ephemeral: true,
          });
        }
      }
    }
  }
};
