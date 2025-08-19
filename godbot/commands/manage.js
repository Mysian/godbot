// manage.js
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
const SERVER_LOCK_ROLE_ID = "1403748042666151936";
const XP_LOCK_ROLE_ID = "1286237811959140363";
const VOICE_REDIRECT_CHANNEL_ID = "1202971727915651092";

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
    )
    .addUserOption((option) =>
      option
        .setName("유저선택")
        .setDescription("대상 유저를 선택하세요. (유저 관리/활동 이력에서 필요)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const option = interaction.options.getString("옵션");
    const targetUserOpt = interaction.options.getUser("유저선택");
    const guild = interaction.guild;
    const activityStats = activityTracker.getStats({});

    if (option === "status") {
      await interaction.deferReply({ ephemeral: true });

      const memory = process.memoryUsage();
      const rssMB = (memory.rss / 1024 / 1024);
      const heapMB = (memory.heapUsed / 1024 / 1024);

      const load = os.loadavg()[0];
      const cpuCount = os.cpus().length;

      const uptimeSec = Math.floor(process.uptime());
      const uptime = (() => {
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;
        return `${h}시간 ${m}분 ${s}초`;
      })();

      let memState = "🟢";
      if (rssMB > 800) memState = "🔴";
      else if (rssMB > 400) memState = "🟡";

      let cpuState = "🟢";
      if (load > cpuCount) cpuState = "🔴";
      else if (load > cpuCount / 2) cpuState = "🟡";

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
      if (!targetUserOpt) {
        await interaction.reply({ content: "❗ `유저선택` 옵션이 필요해. `/관리 옵션:활동 이력 유저선택:@닉네임` 으로 호출해줘.", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const selectedMember = await guild.members.fetch(targetUserOpt.id).catch(() => null);
      if (!selectedMember) {
        await interaction.editReply({ content: "❌ 해당 유저를 찾을 수 없습니다.", ephemeral: true });
        return;
      }

      let activityCollector;
      await showUserActivityLog(selectedMember.id, interaction, 0);

      async function showUserActivityLog(userId, parentInteraction, page = 0) {
        if (activityCollector) activityCollector.stop("refresh");

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

        const navRow = new ActionRowBuilder().addComponents(
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

        activityCollector = parentInteraction.channel.createMessageComponentCollector({
          filter: (btn) =>
            btn.user.id === interaction.user.id &&
            ["activity_prev", "activity_next"].includes(btn.customId),
          time: 180 * 1000,
        });

        activityCollector.on("collect", async (btn) => {
          await btn.deferUpdate();
          if (btn.customId === "activity_prev" && page > 0) {
            await showUserActivityLog(userId, parentInteraction, page - 1);
          } else if (btn.customId === "activity_next" && startIdx + perPage < activities.length) {
            await showUserActivityLog(userId, parentInteraction, page + 1);
          }
        });
      }
      return;
    }

    if (option === "user") {
      if (!targetUserOpt) {
        await interaction.reply({ content: "❗ `유저선택` 옵션이 필요해. `/관리 옵션:유저 관리 유저선택:@닉네임` 으로 호출해줘.", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });

      const selectedMember = await guild.members.fetch(targetUserOpt.id).catch(() => null);
      if (!selectedMember) {
        await interaction.editReply({ content: "❌ 해당 유저를 찾을 수 없습니다.", ephemeral: true });
        return;
      }

      let userCollector;
      await showUserInfo(selectedMember.id, interaction);

      async function showUserInfo(targetUserId, parentInteraction) {
        if (userCollector) userCollector.stop("refresh");

        function formatSeconds(sec) {
          sec = Math.floor(sec || 0);
          const h = Math.floor(sec / 3600);
          const m = Math.floor((sec % 3600) / 60);
          const s = sec % 60;
          if (h) return `${h}시간 ${m}분 ${s}초`;
          if (m) return `${m}분 ${s}초`;
          return `${s}초`;
        }

        function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
        function hhash(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; } return Math.abs(h); }

        const target = await guild.members.fetch(targetUserId).then(m => m.user).catch(() => null);
        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (!member || !target) {
          await parentInteraction.editReply({ content: "❌ 해당 유저를 찾을 수 없습니다." });
          return;
        }

        const stat = activityStats.find((x) => x.userId === target.id) || { message: 0, voice: 0 };

        let lastActiveStr = "기록 없음";
        let lastActiveDate = null;
        try {
          lastActiveDate = activityTracker.getLastActiveDate(target.id);
          if (lastActiveDate) {
            lastActiveStr = lastActiveDate.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
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
        const hasServerLock = member.roles.cache.has(SERVER_LOCK_ROLE_ID);
        const hasXpLock = member.roles.cache.has(XP_LOCK_ROLE_ID);

        const activitiesArr = (activityLogger.getUserActivities(target.id) || []).sort((a, b) => b.time - a.time);
        const msgCount = stat.message || 0;
        const voiceSec = stat.voice || 0;
        const voiceHours = voiceSec / 3600;
        const now = Date.now();
        const lastActiveDays = lastActiveDate ? Math.floor((now - lastActiveDate.getTime()) / 86400000) : 9999;
        const joinDays = joinedAt ? Math.floor((now - joinedAt.getTime()) / 86400000) : 0;
        const roleCount = member.roles.cache.filter(r => r.id !== guild.id).size;
        const gameNames = activitiesArr.filter(a => a.activityType === "game" && a.details && a.details.name).map(a => a.details.name);
        const uniqueGames = new Set(gameNames).size;
        const musicCount = activitiesArr.filter(a => a.activityType === "music").length;
        const nightCount = activitiesArr.filter(a => {
          const h = new Date(a.time).getHours();
          return h >= 23 || h < 5;
        }).length;
        const nightRate = activitiesArr.length ? nightCount / activitiesArr.length : 0;

        function buildEvaluation() {
          const C = [];
          const add = (p, t, tone = "neutral") => C.push({ p: clamp(p), t, tone });

          const friendlyScore = clamp((Math.min(60, (msgCount / 300) * 60) + Math.min(30, (voiceHours / 50) * 30) + Math.min(10, topFriends.length * 3) - enemiesArr.length * 5 - (hasServerLock || hasXpLock ? 15 : 0) - (timeoutActive ? 20 : 0)));
          add(friendlyScore, `이 유저는 서버에 우호적일 확률 ${friendlyScore}%`, "pos");

          const toxicScore = clamp(enemiesArr.length * 18 + (hasServerLock ? 25 : 0) + (hasXpLock ? 12 : 0) + (timeoutActive ? 35 : 0));
          add(toxicScore, `이 유저는 여러 유저들을 배척할 확률 ${toxicScore}%`, "neg");

          let backScore = 0;
          if (joinDays > 30 && lastActiveDays > 7 && msgCount < 50 && voiceHours < 3) backScore += 70;
          if (topFriends.length >= 1) backScore += 12;
          if (roleCount >= 10) backScore += 8;
          add(backScore, `이 유저는 뒷서버를 파고 있을 가능성 ${clamp(backScore)}%`, "neg");

          add(clamp(Math.min(100, (msgCount / 500) * 100)), `이 유저는 채팅 중심 활동가일 확률 ${clamp(Math.min(100, (msgCount / 500) * 100))}%`, "neutral");
          add(clamp(Math.min(100, (voiceHours / 40) * 100)), `이 유저는 보이스 채널 선호 성향일 확률 ${clamp(Math.min(100, (voiceHours / 40) * 100))}%`, "neutral");

          const lurkScore = clamp((joinDays > 30 ? 25 : 0) + (msgCount < 30 ? 50 : 0) + (voiceHours < 2 ? 25 : 0) + (lastActiveDays > 14 ? 10 : 0));
          add(lurkScore, `이 유저는 관망형(잠수) 성향일 확률 ${lurkScore}%`, "neutral");

          const influenceScore = clamp(Math.min(40, roleCount * 4) + Math.min(40, (msgCount / 800) * 40) + Math.min(20, topFriends.length * 6));
          add(influenceScore, `이 유저는 영향력 높은 핵심 인물일 확률 ${influenceScore}%`, "pos");

          const newbieScore = clamp(joinDays <= 7 ? 80 - Math.min(60, joinDays * 8) : 0);
          add(newbieScore, `이 유저는 신입 적응 단계일 확률 ${newbieScore}%`, "neutral");

          const comebackScore = clamp((joinDays > 30 ? 20 : 0) + (lastActiveDays <= 3 ? 60 : 0) + (msgCount < 120 ? 10 : 0));
          add(comebackScore, `이 유저는 복귀 모멘텀이 있는 편일 확률 ${comebackScore}%`, "pos");

          const churnScore = clamp((lastActiveDays > 30 ? 70 : 0) + (msgCount < 10 ? 20 : 0) + (voiceHours < 1 ? 10 : 0));
          add(churnScore, `이 유저는 이탈 위험 신호가 있을 확률 ${churnScore}%`, "neg");

          const nightScore = clamp(nightRate * 100);
          add(nightScore, `이 유저는 야행성 활동 비중이 높을 확률 ${nightScore}%`, "neutral");

          const dayScore = clamp(100 - nightScore);
          add(dayScore, `이 유저는 주간 활동 비중이 높을 확률 ${dayScore}%`, "neutral");

          const gamerScore = clamp(Math.min(100, uniqueGames * 12));
          add(gamerScore, `이 유저는 게임 중심 활동일 확률 ${gamerScore}%`, "neutral");

          const musicScore = clamp(Math.min(100, musicCount * 5));
          add(musicScore, `이 유저는 음악 감상 중심 활동일 확률 ${musicScore}%`, "neutral");

          const ruleOk = clamp(100 - (hasServerLock ? 30 : 0) - (hasXpLock ? 20 : 0) - (timeoutActive ? 40 : 0));
          add(ruleOk, `이 유저는 규칙 준수도가 높을 확률 ${ruleOk}%`, "pos");

          const riskScore = clamp((hasServerLock ? 45 : 0) + (hasXpLock ? 20 : 0) + (timeoutActive ? 50 : 0));
          add(riskScore, `이 유저는 리스크 관리가 필요한 상태일 확률 ${riskScore}%`, "neg");

          const spamScore = clamp(member.roles.cache.has(SPAM_ROLE_ID) ? 85 : 0);
          add(spamScore, `이 유저는 스팸 의심 패턴이 있을 확률 ${spamScore}%`, "neg");

          const longStayScore = clamp(hasLongStay ? 80 : 0);
          add(longStayScore, `이 유저는 장기 투숙객 성향일 확률 ${longStayScore}%`, "neutral");

          const monthlyScore = clamp(hasMonthly ? 90 : 0);
          add(monthlyScore, `이 유저는 월세 성실 납부자일 확률 ${monthlyScore}%`, "pos");

          const roleCollector = clamp(Math.min(100, Math.max(0, (roleCount - 6) * 10)));
          add(roleCollector, `이 유저는 롤(역할) 수집가 성향일 확률 ${roleCollector}%`, "neutral");

          const noRoleScore = clamp(roleCount === 0 ? 80 : 0);
          add(noRoleScore, `이 유저는 무소속(역할 無) 상태일 확률 ${noRoleScore}%`, "neutral");

          const socialExpand = clamp(Math.min(100, topFriends.length * 28) - enemiesArr.length * 8 + Math.min(30, (msgCount / 300) * 30));
          add(socialExpand, `이 유저는 사회적 확장형 성향일 확률 ${socialExpand}%`, "pos");

          const isolated = clamp((topFriends.length === 0 ? 40 : 0) + (enemiesArr.length >= 1 ? 35 : 0) + (msgCount < 30 ? 25 : 0));
          add(isolated, `이 유저는 고립형 성향일 확률 ${isolated}%`, "neg");

          const mediator = clamp(Math.max(0, socialExpand - toxicScore / 2));
          add(mediator, `이 유저는 중재자형 성향일 확률 ${mediator}%`, "pos");

          const zeal = clamp(Math.min(100, (msgCount / 1000) * 60 + (voiceHours / 80) * 40));
          add(zeal, `이 유저는 열성 참여형일 확률 ${zeal}%`, "pos");

          const overheated = clamp((joinDays <= 7 ? 40 : 0) + (msgCount > 120 ? 30 : 0) + (voiceHours > 10 ? 30 : 0));
          add(overheated, `이 유저는 단기 과열형 패턴일 확률 ${overheated}%`, "neutral");

          const silentVeteran = clamp((joinDays > 180 ? 50 : 0) + (msgCount < 60 ? 30 : 0) + (voiceHours < 5 ? 20 : 0));
          add(silentVeteran, `이 유저는 조용한 베테랑일 확률 ${silentVeteran}%`, "neutral");

          const steady = clamp((joinDays > 60 ? 25 : 0) + (lastActiveDays <= 7 ? 35 : 0) + (msgCount >= 60 ? 25 : 0) + (voiceHours >= 5 ? 15 : 0));
          add(steady, `이 유저는 꾸준한 스테디셀러일 확률 ${steady}%`, "pos");

          const solo = clamp((uniqueGames <= 1 ? 30 : 0) + (voiceHours < 3 ? 30 : 0));
          add(solo, `이 유저는 솔로 플레이 성향일 확률 ${solo}%`, "neutral");

          const partyLead = clamp((voiceHours > 40 ? 45 : 0) + (topFriends.length >= 2 ? 25 : 0));
          add(partyLead, `이 유저는 파티 리더형 성향일 확률 ${partyLead}%`, "pos");

          const clique = clamp((voiceHours > 10 ? 20 : 0) + (topFriends.length >= 1 ? 30 : 0) + (msgCount < 80 ? 20 : 0));
          add(clique, `이 유저는 친목 집중형 성향일 확률 ${clique}%`, "neutral");

          const infoSeeker = clamp((gameNames.length + musicCount) > 10 ? 40 : 0);
          add(infoSeeker, `이 유저는 정보탐색형(콘텐츠 소비) 성향일 확률 ${infoSeeker}%`, "neutral");

          const eventFriendly = clamp((lastActiveDays <= 14 ? 30 : 0) + (msgCount >= 80 ? 30 : 0));
          add(eventFriendly, `이 유저는 이벤트 친화형일 확률 ${eventFriendly}%`, "pos");

          const ruleSensitive = clamp((msgCount < 40 ? 20 : 0) + (!timeoutActive && !hasServerLock ? 40 : 0));
          add(ruleSensitive, `이 유저는 규칙 민감형일 확률 ${ruleSensitive}%`, "neutral");

          const warnCandidate = clamp((toxicScore > 50 ? 30 : 0) + (hasServerLock ? 30 : 0) + (timeoutActive ? 40 : 0));
          add(warnCandidate, `이 유저는 경고 필요 후보일 확률 ${warnCandidate}%`, "neg");

          const staffCandidate = clamp((influenceScore > 60 ? 30 : 0) + (ruleOk > 70 ? 40 : 0));
          add(staffCandidate, `이 유저는 잠재적 운영진 후보일 확률 ${staffCandidate}%`, "pos");

          const newLead = clamp((newbieScore > 40 ? 20 : 0) + (zeal > 50 ? 30 : 0));
          add(newLead, `이 유저는 신규 유입 리드 가능성 ${newLead}%`, "pos");

          const contributor = clamp((msgCount > 500 ? 40 : 0) + (steady > 50 ? 30 : 0));
          add(contributor, `이 유저는 커뮤니티 기여자일 확률 ${contributor}%`, "pos");

          const conflictSensitive = clamp((enemiesArr.length >= 2 ? 50 : 0) + (toxicScore / 2));
          add(conflictSensitive, `이 유저는 분쟁 민감군일 확률 ${conflictSensitive}%`, "neg");

          const learningCurve = clamp((joinDays <= 30 ? 60 : 0) + (msgCount < 120 ? 20 : 0));
          add(learningCurve, `이 유저는 학습 곡선 진행중일 확률 ${learningCurve}%`, "neutral");

          const growthSlow = clamp((joinDays > 90 ? 20 : 0) + (lastActiveDays > 14 ? 40 : 0));
          add(growthSlow, `이 유저는 성장 곡선 둔화 신호가 있을 확률 ${growthSlow}%`, "neg");

          const hybrid = clamp((msgCount >= 60 ? 25 : 0) + (voiceHours >= 5 ? 25 : 0));
          add(hybrid, `이 유저는 텍스트·보이스 복합형일 확률 ${hybrid}%`, "neutral");

          const reactioner = clamp((msgCount >= 30 ? 25 : 0));
          add(reactioner, `이 유저는 텍스트 리액션 위주일 확률 ${reactioner}%`, "neutral");

          const fleeting = clamp((msgCount >= 150 ? 30 : 0));
          add(fleeting, `이 유저는 휘발성 대화 비중이 높을 확률 ${fleeting}%`, "neutral");

          const longform = clamp((msgCount >= 300 ? 30 : 0));
          add(longform, `이 유저는 장문형 대화 비중이 높을 확률 ${longform}%`, "neutral");

          const disrupt = clamp((toxicScore > 60 ? 40 : 0) + (warnCandidate > 40 ? 20 : 0));
          add(disrupt, `이 유저는 분위기 교란 위험 신호가 있을 확률 ${disrupt}%`, "neg");

          const needCare = clamp((newbieScore > 30 ? 40 : 0) + (learningCurve > 40 ? 20 : 0));
          add(needCare, `이 유저는 초심자 케어가 유효할 확률 ${needCare}%`, "pos");

          const friendsOnly = clamp((clique > 40 ? 30 : 0) + (isolated > 20 ? 10 : 0));
          add(friendsOnly, `이 유저는 지인 중심 활동일 확률 ${friendsOnly}%`, "neutral");

          const offsite = clamp((backScore > 40 ? 30 : 0));
          add(offsite, `이 유저는 서버 외부 교류 비중이 높을 확률 ${offsite}%`, "neutral");

          const reportTrail = clamp((warnCandidate > 40 ? 30 : 0) + (timeoutActive ? 40 : 0));
          add(reportTrail, `이 유저는 신고 대응 이력 가능성이 있을 확률 ${reportTrail}%`, "neg");

          const ranked = C.sort((a, b) => b.p - a.p);
          const topP = ranked.length ? ranked[0].p : 0;
          const tops = ranked.filter(x => x.p === topP);
          const pick = tops[(hhash(target.id) % Math.max(1, tops.length))];
          const emoji = pick.tone === "pos" ? "✅" : pick.tone === "neg" ? "⚠️" : "ℹ️";
          return `${emoji} ${pick.t}`;
        }

        const evalLine = buildEvaluation();

        const embed = new EmbedBuilder()
          .setTitle(`유저 정보: ${target.tag}`)
          .setThumbnail(target.displayAvatarURL())
          .addFields(
            { name: "유저 ID", value: target.id, inline: false },
            { name: "서버 입장일", value: joinedAtStr, inline: false },
            { name: "마지막 활동일", value: lastActiveStr, inline: false },
            { name: "메시지 수", value: `${msgCount}`, inline: true },
            { name: "음성 이용 시간", value: formatSeconds(voiceSec), inline: true },
            { name: "가장 친한 유저 TOP3", value: friendsText, inline: false },
            { name: "가장 적대하는 유저 TOP3", value: enemiesText, inline: false },
            ...(timeoutActive
              ? [{ name: "⏱️ 타임아웃", value: `**활성화 중**\n만료: ${timeoutExpireStr}`, inline: false }]
              : []),
            {
              name: "제한 상태",
              value: [
                `• 서버 활동 제한: ${hasServerLock ? "🟥 ON" : "⬜ OFF"}`,
                `• 경험치 획득 제한: ${hasXpLock ? "🟥 ON" : "⬜ OFF"}`
              ].join("\n"),
              inline: false
            },
            { name: "갓봇의 평가", value: evalLine, inline: false }
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
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("view_activity_log")
            .setLabel("활동 이력 보기")
            .setStyle(ButtonStyle.Secondary)
        );

        const restrictRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("toggle_server_lock")
            .setLabel(hasServerLock ? "서버 활동 제한 해제" : "서버 활동 제한 적용")
            .setStyle(hasServerLock ? ButtonStyle.Secondary : ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("toggle_xp_lock")
            .setLabel(hasXpLock ? "경험치 제한 해제" : "경험치 제한 적용")
            .setStyle(hasXpLock ? ButtonStyle.Secondary : ButtonStyle.Danger)
        );

        await parentInteraction.editReply({
          embeds: [embed],
          components: [row, roleRow, restrictRow],
          content: "",
          ephemeral: true
        });

        userCollector = parentInteraction.channel.createMessageComponentCollector({
          filter: (i) => i.user.id === interaction.user.id &&
            [
              "refresh_userinfo", "timeout", "kick", "timeout_release",
              "toggle_longstay", "receive_monthly", "view_activity_log",
              "toggle_server_lock", "toggle_xp_lock"
            ].includes(i.customId),
          time: 300 * 1000,
        });

        userCollector.on("collect", async (i) => {
          if (i.customId === "refresh_userinfo") {
            await i.deferUpdate();
            await showUserInfo(targetUserId, parentInteraction);

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
            await showUserInfo(targetUserId, parentInteraction);

          } else if (i.customId === "toggle_longstay") {
            const hasLongStayNow = member.roles.cache.has(EXCLUDE_ROLE_ID);
            let action, logMsg;
            if (hasLongStayNow) {
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
                  .setColor(hasLongStayNow ? 0xff5555 : 0x55ff55)
                  .setTimestamp()
              ]
            });
            await showUserInfo(targetUserId, parentInteraction);

          } else if (i.customId === "receive_monthly") {
            const hasMonthlyNow = member.roles.cache.has(MONTHLY_ROLE_ID);
            if (!hasMonthlyNow) {
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
            await showUserInfo(targetUserId, parentInteraction);

          } else if (i.customId === "view_activity_log") {
            await i.deferUpdate();
            await showUserActivityLog(targetUserId, parentInteraction, 0);

          } else if (i.customId === "toggle_server_lock") {
            await i.deferReply({ ephemeral: true });
            const hasNow = member.roles.cache.has(SERVER_LOCK_ROLE_ID);
            try {
              if (hasNow) {
                await member.roles.remove(SERVER_LOCK_ROLE_ID, "서버 활동 제한 해제");
              } else {
                await member.roles.add(SERVER_LOCK_ROLE_ID, "서버 활동 제한 적용");
                const currentVcId = member.voice && member.voice.channelId;
                if (currentVcId && currentVcId !== VOICE_REDIRECT_CHANNEL_ID) {
                  const dest = i.guild.channels.cache.get(VOICE_REDIRECT_CHANNEL_ID);
                  if (dest) {
                    try {
                      await member.voice.setChannel(dest, "서버 활동 제한 적용: 지정 음성채널로 이동");
                      await i.followUp({ content: `🔒 서버 활동 제한 적용됨. 현재 음성채널에 있어 ${dest.name}로 이동시켰습니다.`, ephemeral: true });
                    } catch {
                      await i.followUp({ content: "⚠️ 이동 실패: 권한 또는 대상 채널 상태를 확인하세요.", ephemeral: true });
                    }
                  } else {
                    await i.followUp({ content: "⚠️ 이동 실패: 대상 음성채널을 찾을 수 없습니다.", ephemeral: true });
                  }
                }
              }
              await interaction.guild.channels.cache.get(ADMIN_LOG_CHANNEL_ID)?.send({
                embeds: [
                  new EmbedBuilder()
                    .setTitle("서버 활동 제한 변경")
                    .setDescription(`${hasNow ? "❌ 해제" : "🟥 적용"}: <@${targetUserId}> (${member.user.tag})\n- 처리자: <@${i.user.id}> (${i.user.tag})`)
                    .setColor(hasNow ? 0x4caf50 : 0xe53935)
                    .setTimestamp()
                ]
              });
              await i.editReply({ content: `서버 활동 제한을 ${hasNow ? "해제" : "적용"}했습니다.` });
            } catch (e) {
              await i.editReply({ content: "변경 실패 (권한/위치 문제일 수 있음)" });
            }
            await showUserInfo(targetUserId, parentInteraction);

          } else if (i.customId === "toggle_xp_lock") {
            await i.deferReply({ ephemeral: true });
            const hasNow = member.roles.cache.has(XP_LOCK_ROLE_ID);
            try {
              if (hasNow) {
                await member.roles.remove(XP_LOCK_ROLE_ID, "경험치 획득 제한 해제");
              } else {
                await member.roles.add(XP_LOCK_ROLE_ID, "경험치 획득 제한 적용");
              }
              await interaction.guild.channels.cache.get(ADMIN_LOG_CHANNEL_ID)?.send({
                embeds: [
                  new EmbedBuilder()
                    .setTitle("경험치 획득 제한 변경")
                    .setDescription(`${hasNow ? "❌ 해제" : "🟥 적용"}: <@${targetUserId}> (${member.user.tag})\n- 처리자: <@${i.user.id}> (${i.user.tag})`)
                    .setColor(hasNow ? 0x4caf50 : 0xe53935)
                    .setTimestamp()
                ]
              });
              await i.editReply({ content: `경험치 획득 제한을 ${hasNow ? "해제" : "적용"}했습니다.` });
            } catch (e) {
              await i.editReply({ content: "변경 실패 (권한/위치 문제일 수 있음)" });
            }
            await showUserInfo(targetUserId, parentInteraction);
          }
        });

        async function showUserActivityLog(userId, parent, page = 0) {
          const user = await guild.members.fetch(userId).then(m => m.user).catch(() => null);
          if (!user) {
            await parent.editReply({ content: "❌ 유저를 찾을 수 없습니다.", ephemeral: true });
            return;
          }
          const activities = activityLogger.getUserActivities(userId).sort((a, b) => b.time - a.time);
          if (!activities.length) {
            await parent.editReply({ content: "최근 활동 기록이 없거나 디스코드 활동 기능을 OFF한 유저", ephemeral: true });
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

          await parent.editReply({
            embeds: [embed],
            components: [navRow],
            ephemeral: true
          });

          const actCollector = parent.channel.createMessageComponentCollector({
            filter: (btn) =>
              btn.user.id === interaction.user.id &&
              ["activity_prev", "activity_next"].includes(btn.customId),
            time: 180 * 1000,
          });

          actCollector.on("collect", async (btn) => {
            await btn.deferUpdate();
            if (btn.customId === "activity_prev" && page > 0) {
              await showUserActivityLog(userId, parent, page - 1);
              actCollector.stop("refresh");
            } else if (btn.customId === "activity_next" && startIdx + perPage < activities.length) {
              await showUserActivityLog(userId, parent, page + 1);
              actCollector.stop("refresh");
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
