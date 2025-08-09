const {
  SlashCommandBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
          { name: "활동 이력", value: "activity_log" },
          { name: "서버상태", value: "status" },
          { name: "저장파일 백업", value: "json_backup" },
          { name: "스팸의심 계정 추방", value: "spam_kick" }
        )
    )
    .addUserOption((option) =>
      option
        .setName("유저")
        .setDescription("대상 유저 (유저 관리/활동 이력에서 사용)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const option = interaction.options.getString("옵션");
    const targetUser = interaction.options.getUser("유저");
    const guild = interaction.guild;

    if (option === "status") {
      await interaction.deferReply({ ephemeral: true });
      const memory = process.memoryUsage();
      const rssMB = (memory.rss / 1024 / 1024);
      const heapMB = (memory.heapUsed / 1024 / 1024);
      const load = os.loadavg()[0];
      const cpuCount = os.cpus().length;
      const uptimeSec = Math.floor(process.uptime());
      const h = Math.floor(uptimeSec / 3600);
      const m = Math.floor((uptimeSec % 3600) / 60);
      const s = uptimeSec % 60;
      const uptime = `${h}시간 ${m}분 ${s}초`;
      let memState = "🟢";
      if (rssMB > 800) memState = "🔴"; else if (rssMB > 400) memState = "🟡";
      let cpuState = "🟢";
      if (load > cpuCount) cpuState = "🔴"; else if (load > cpuCount / 2) cpuState = "🟡";
      let total = "🟢 안정적";
      if (memState === "🔴" || cpuState === "🔴") total = "🔴 불안정";
      else if (memState === "🟡" || cpuState === "🟡") total = "🟡 주의";
      let comment = "";
      if (total === "🟢 안정적") comment = "서버가 매우 쾌적하게 동작 중이에요!";
      else if (total === "🟡 주의") comment = "서버에 약간의 부하가 있으니 주의하세요.";
      else comment = "지금 서버가 상당히 무거워요! 재시작이나 최적화가 필요할 수 있음!";
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
      const targets = [];
      for (const member of members.values()) {
        if (member.user.bot) continue;
        if (member.roles.cache.has(EXCLUDE_ROLE_ID)) continue;
        const roles = member.roles.cache;
        const hasSpamRole = roles.has(SPAM_ROLE_ID);
        const onlyNewbie = roles.size === 1 && roles.has("1295701019430227988");
        const onlySpam = roles.size === 1 && roles.has(SPAM_ROLE_ID);
        const noRole = roles.filter(r => r.id !== guild.id).size === 0;
        if (noRole || hasSpamRole || onlyNewbie || onlySpam) targets.push(member);
      }
      const descList = [];
      let totalLength = 0;
      for (const m of targets) {
        const line = `• <@${m.id}> (${m.user.tag})`;
        if (totalLength + line.length + 1 < 4000) {
          descList.push(line);
          totalLength += line.length + 1;
        } else {
          descList.push(`외 ${targets.length - descList.length}명...`);
          break;
        }
      }
      const preview = new EmbedBuilder()
        .setTitle("[스팸의심 계정] 추방 대상 미리보기")
        .setDescription(targets.length ? descList.join("\n") : "✅ 추방 대상자가 없습니다.")
        .setColor(0xee4444);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("confirm_spam_kick").setLabel("✅ 예").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("cancel_spam_kick").setLabel("❌ 아니오").setStyle(ButtonStyle.Secondary)
      );
      await interaction.editReply({ embeds: [preview], components: [row] });
      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 20000,
      });
      collector.on("collect", async (i) => {
        if (i.customId === "confirm_spam_kick") {
          await i.update({ content: "⏳ 스팸의심 계정 추방 진행 중...", embeds: [], components: [] });
          let success = 0, failed = [];
          for (const member of targets) {
            try {
              await member.kick("스팸/비정상 계정 자동 추방");
              await new Promise(res => setTimeout(res, 350));
              success++;
            } catch (err) {
              failed.push(`${member.user.tag}(${member.id})`);
            }
          }
          await interaction.followUp({
            content: `✅ ${success}명 추방 완료${failed.length ? `\n❌ 실패: ${failed.join(", ")}` : ""}`,
            ephemeral: true,
          });
        } else {
          await i.update({ content: "❌ 추방이 취소되었습니다.", embeds: [], components: [] });
        }
      });
      collector.on("end", async (collected) => {
        if (collected.size === 0) {
          await interaction.editReply({ content: "⏰ 시간이 초과되어 추방이 취소되었습니다.", embeds: [], components: [] });
        }
      });
      return;
    }

    if (option === "activity_log") {
      if (!targetUser) {
        await interaction.reply({ content: "유저 옵션이 필요해요: `/관리 옵션:활동 이력 유저:@닉네임`", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      await showUserActivityLog(targetUser.id, interaction, 0);
      return;
    }

    if (option === "user") {
      if (!targetUser) {
        await interaction.reply({ content: "유저 옵션이 필요해요: `/관리 옵션:유저 관리 유저:@닉네임``", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      await showUserInfo(targetUser.id, interaction);
      return;
    }

    async function showUserInfo(targetUserId, ctx) {
      const member = await guild.members.fetch(targetUserId).catch(() => null);
      if (!member) {
        await ctx.editReply({ content: "❌ 해당 유저를 찾을 수 없습니다.", ephemeral: true });
        return;
      }
      const user = member.user;
      function formatSeconds(sec) {
        sec = Math.floor(sec || 0);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h) return `${h}시간 ${m}분 ${s}초`;
        if (m) return `${m}분 ${s}초`;
        return `${s}초`;
      }
      const statAll = activityTracker.getStats({}) || [];
      const stat = statAll.find((x) => x.userId === user.id) || { message: 0, voice: 0 };
      let lastActiveStr = "기록 없음";
      let lastTs = null;
      try {
        const logs = activityLogger.getUserActivities(user.id) || [];
        if (logs.length) {
          logs.sort((a, b) => b.time - a.time);
          lastTs = typeof logs[0].time === "number" ? logs[0].time : null;
        }
      } catch {}
      if (lastTs) {
        lastActiveStr = new Date(lastTs).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      } else {
        try {
          const lastActiveDate = activityTracker.getLastActiveDate ? activityTracker.getLastActiveDate(user.id) : null;
          if (lastActiveDate) lastActiveStr = lastActiveDate.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
        } catch {}
      }
      const joinedAt = member.joinedAt;
      const joinedAtStr = joinedAt ? joinedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "기록 없음";
      const topFriends = relationship.getTopRelations ? relationship.getTopRelations(user.id, 3) : [];
      const relDataAll = relationship.loadData ? relationship.loadData() : {};
      const relData = relDataAll[user.id] || {};
      const enemiesArr = Object.entries(relData)
        .sort((a, b) => (a[1].stage - b[1].stage) || (a[1].remain - b[1].remain))
        .slice(0, 3)
        .map(([id, val]) => ({
          userId: id,
          stage: val.stage,
          remain: val.remain,
          relation: relationship.getRelationshipLevel ? relationship.getRelationshipLevel(val.stage - 6) : ""
        }));
      let friendsText = topFriends && topFriends.length ? topFriends.map((x, i) => `#${i + 1} <@${x.userId}> (${x.relation})`).join("\n") : "없음";
      let enemiesText = enemiesArr && enemiesArr.length ? enemiesArr.map((x, i) => `#${i + 1} <@${x.userId}> (${x.relation})`).join("\n") : "없음";
      let timeoutActive = false;
      let timeoutExpireStr = "";
      if (member.communicationDisabledUntil && member.communicationDisabledUntilTimestamp > Date.now()) {
        timeoutActive = true;
        timeoutExpireStr = `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`;
      }
      const hasLongStay = member.roles.cache.has(EXCLUDE_ROLE_ID);
      const embed = new EmbedBuilder()
        .setTitle(`유저 정보: ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: "유저 ID", value: user.id, inline: false },
          { name: "서버 입장일", value: joinedAtStr, inline: false },
          { name: "마지막 활동일", value: lastActiveStr, inline: false },
          { name: "메시지 수", value: `${stat.message || 0}`, inline: true },
          { name: "음성 이용 시간", value: formatSeconds(stat.voice), inline: true },
          { name: "가장 친한 유저 TOP3", value: friendsText, inline: false },
          { name: "가장 적대하는 유저 TOP3", value: enemiesText, inline: false },
          ...(timeoutActive ? [{ name: "⏱️ 타임아웃", value: `**활성화 중**\n만료: ${timeoutExpireStr}`, inline: false }] : [])
        )
        .setColor(0x00bfff);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`refresh_userinfo_${user.id}`).setLabel("🔄 새로고침").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(timeoutActive ? `timeout_release_${user.id}` : `timeout_${user.id}`).setLabel(timeoutActive ? "타임아웃 해제" : "타임아웃 (1일)").setStyle(timeoutActive ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`kick_${user.id}`).setLabel("추방").setStyle(ButtonStyle.Danger)
      );
      const roleRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`toggle_longstay_${user.id}`).setLabel(hasLongStay ? "장기 투숙객 해제" : "장기 투숙객 부여").setStyle(hasLongStay ? ButtonStyle.Secondary : ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`receive_monthly_${user.id}`).setLabel("월세 받기").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`view_activity_log_${user.id}`).setLabel("활동 이력 보기").setStyle(ButtonStyle.Secondary)
      );
      await ctx.editReply({ embeds: [embed], components: [row, roleRow], ephemeral: true });
      const collector = ctx.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id && i.message.id === (await ctx.fetchReply()).id,
        time: 180 * 1000
      });
      collector.on("collect", async (i) => {
        if (!i.customId.endsWith(`_${user.id}`)) return;
        const base = i.customId.replace(`_${user.id}`, "");
        if (base === "refresh_userinfo") {
          await i.deferUpdate();
          await showUserInfo(user.id, ctx);
          collector.stop();
          return;
        }
        if (base === "timeout_release") {
          await i.update({ content: "⏳ 타임아웃 해제 중...", embeds: [], components: [] });
          try {
            await i.guild.members.edit(user.id, { communicationDisabledUntil: null, reason: "관리 명령어로 타임아웃 해제" });
            await i.followUp({ content: `✅ <@${user.id}>님의 타임아웃이 해제되었습니다.`, ephemeral: true });
          } catch (err) {
            await i.followUp({ content: "❌ 타임아웃 해제 실패 (권한 문제일 수 있음)", ephemeral: true });
          }
          await showUserInfo(user.id, ctx);
          collector.stop();
          return;
        }
        if (base === "timeout" || base === "kick") {
          const modal = new ModalBuilder()
            .setCustomId(`adminpw_user_${base}_${user.id}`)
            .setTitle("관리 비밀번호 입력")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("pw").setLabel("비밀번호 4자리").setStyle(TextInputStyle.Short).setMinLength(4).setMaxLength(4).setRequired(true)
              )
            );
          await i.showModal(modal);
          return;
        }
        if (base === "toggle_longstay") {
          const hasLongStayNow = member.roles.cache.has(EXCLUDE_ROLE_ID);
          let action, logMsg;
          if (hasLongStayNow) {
            await member.roles.remove(EXCLUDE_ROLE_ID, "장기 투숙객 해제");
            action = "해제";
            logMsg = `❌ 장기 투숙객 해제: <@${user.id}> (${member.user.tag})\n- 처리자: <@${i.user.id}> (${i.user.tag})`;
          } else {
            await member.roles.add(EXCLUDE_ROLE_ID, "장기 투숙객 부여");
            action = "부여";
            logMsg = `✅ 장기 투숙객 부여: <@${user.id}> (${member.user.tag})\n- 처리자: <@${i.user.id}> (${i.user.tag})`;
          }
          await i.reply({ content: `장기 투숙객 역할을 ${action}했습니다.`, ephemeral: true });
          await i.guild.channels.cache.get(ADMIN_LOG_CHANNEL_ID)?.send({
            embeds: [new EmbedBuilder().setTitle("장기 투숙객 역할 변경").setDescription(logMsg).setColor(hasLongStayNow ? 0xff5555 : 0x55ff55).setTimestamp()]
          });
          await showUserInfo(user.id, ctx);
          collector.stop();
          return;
        }
        if (base === "receive_monthly") {
          const hasMonthly = member.roles.cache.has(MONTHLY_ROLE_ID);
          if (!hasMonthly) {
            await i.reply({ content: "❌ 월세 납부자 역할이 없습니다. 받을 수 없습니다.", ephemeral: true });
            return;
          }
          await member.roles.remove(MONTHLY_ROLE_ID, "월세 받기 처리");
          await i.reply({ content: "월세 납부자 역할을 해제(월세 수령) 처리했습니다.", ephemeral: true });
          await i.guild.channels.cache.get(ADMIN_LOG_CHANNEL_ID)?.send({
            embeds: [new EmbedBuilder().setTitle("월세 수령 처리").setDescription(`💸 월세 받기 처리: <@${user.id}> (${member.user.tag})\n월세 납부자 역할 해제\n- 처리자: <@${i.user.id}> (${i.user.tag})`).setColor(0x4eaaff).setTimestamp()]
          });
          await showUserInfo(user.id, ctx);
          collector.stop();
          return;
        }
        if (base === "view_activity_log") {
          await i.deferUpdate();
          await showUserActivityLog(user.id, ctx, 0);
          collector.stop();
          return;
        }
      });
    }

    async function showUserActivityLog(userId, ctx, page = 0) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        await ctx.editReply({ content: "❌ 해당 유저를 찾을 수 없습니다.", ephemeral: true });
        return;
      }
      const user = member.user;
      const activities = (activityLogger.getUserActivities(userId) || []).sort((a, b) => b.time - a.time);
      if (!activities.length) {
        await ctx.editReply({ content: "최근 활동 기록이 없거나 디스코드 활동 기능을 OFF한 유저입니다.", ephemeral: true });
        return;
      }
      const perPage = 10;
      const startIdx = page * perPage;
      const pageData = activities.slice(startIdx, startIdx + perPage);
      const activityText = pageData.map((a, idx) => {
        const date = new Date(a.time).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
        let info = `\`${date}\` | [${a.activityType}]`;
        if (a.activityType === "game" && a.details?.name) info += `: ${a.details.name}`;
        else if (a.activityType === "music" && a.details?.song) info += `: ${a.details.song} - ${a.details.artist || ''}`;
        else if (a.details && typeof a.details === "object") info += `: ${Object.values(a.details).join(" / ")}`;
        return `${startIdx + idx + 1}. ${info}`;
      }).join("\n");
      const embed = new EmbedBuilder()
        .setTitle(`${user.tag}님의 최근 활동 이력`)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(activityText)
        .setFooter({ text: `페이지 ${page + 1} / ${Math.ceil(activities.length / perPage)}` })
        .setColor(0x7fdfff);
      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`activity_prev_${userId}`).setLabel("◀ 이전").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`activity_next_${userId}`).setLabel("다음 ▶").setStyle(ButtonStyle.Secondary).setDisabled(startIdx + perPage >= activities.length)
      );
      await ctx.editReply({ embeds: [embed], components: [navRow], ephemeral: true });
      const collector = ctx.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id && i.message.id === (await ctx.fetchReply()).id,
        time: 180 * 1000
      });
      collector.on("collect", async (btn) => {
        if (btn.customId === `activity_prev_${userId}`) {
          await btn.deferUpdate();
          await showUserActivityLog(userId, ctx, Math.max(0, page - 1));
          collector.stop();
        } else if (btn.customId === `activity_next_${userId}`) {
          await btn.deferUpdate();
          await showUserActivityLog(userId, ctx, page + 1);
          collector.stop();
        }
      });
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
      const files = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((f) => f.endsWith(".json")) : [];
      if (!files.length) {
        await interaction.reply({ content: "data 폴더에 .json 파일이 없습니다.", ephemeral: true });
        return;
      }
      const zip = new AdmZip();
      for (const file of files) zip.addLocalFile(path.join(dataDir, file), "", file);
      const now = new Date();
      const dateStr = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, "0") + now.getDate().toString().padStart(2, "0") + "_" + now.getHours().toString().padStart(2, "0") + now.getMinutes().toString().padStart(2, "0") + now.getSeconds().toString().padStart(2, "0");
      const filename = `${dateStr}.zip`;
      const tmpPath = path.join(__dirname, `../data/${filename}`);
      zip.writeZip(tmpPath);
      const attachment = new AttachmentBuilder(tmpPath, { name: filename });
      await interaction.reply({ content: `모든 .json 파일을 압축했습니다. (${filename})`, files: [attachment], ephemeral: true });
      setTimeout(() => { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); }, 60 * 1000);
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
          await interaction.reply({ content: `✅ <@${targetUserId}>님에게 1일 타임아웃을 적용했습니다.`, ephemeral: true });
        } catch (err) {
          await interaction.reply({ content: "❌ 타임아웃 실패 (권한 문제일 수 있음)", ephemeral: true });
        }
      } else if (action === "kick") {
        try {
          await interaction.guild.members.kick(targetUserId, "관리 명령어로 추방");
          await interaction.reply({ content: `✅ <@${targetUserId}>님을 서버에서 추방했습니다.`, ephemeral: true });
        } catch (err) {
          await interaction.reply({ content: "❌ 추방 실패 (권한 문제일 수 있음)", ephemeral: true });
        }
      }
    }
  }
};
