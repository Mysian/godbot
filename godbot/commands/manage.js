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

const warnHistoryPath = path.join(dataDir, "warn-history.json");
function loadWarnHistory() {
  if (!fs.existsSync(warnHistoryPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(warnHistoryPath, "utf8")) || {};
  } catch { return {}; }
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
        function capProb(p, cap, floor) { return Math.max(floor, Math.min(cap, Math.round(p))); }
        function recencyFactor(days) {
          if (!Number.isFinite(days)) return 0.0;
          if (days <= 3) return 1.0;
          if (days <= 7) return 0.85;
          if (days <= 14) return 0.7;
          if (days <= 30) return 0.45;
          if (days <= 45) return 0.3;
          return 0.2;
        }
        function relFromEvidence(msg, vhr, ev, days) {
          const a = Math.log1p(msg) / Math.log(1 + 300);
          const b = Math.log1p(vhr) / Math.log(1 + 50);
          const c = Math.log1p(ev) / Math.log(1 + 200);
          const d = recencyFactor(days);
          const mix = (0.25 * a) + (0.35 * b) + (0.2 * c) + (0.2 * d);
          return Math.max(0.15, Math.min(1, mix));
        }
        function scoreToProb(raw, evidence, cap = 93, floor = 2) {
          const shrink = 0.4 + evidence * 0.4;
          const p = raw * shrink;
          return capProb(p, cap, floor);
        }
        function posCapByRecency(p, days) {
          if (days > 45) return Math.min(p, 25);
          if (days > 30) return Math.min(p, 35);
          if (days > 14) return Math.min(p, 45);
          return p;
        }

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

        const relEntries = Object.entries(relData);
        const friendsByStage = relEntries.filter(([_, v]) => (v.stage || 0) > 0).sort((a, b) => (b[1].stage || 0) - (a[1].stage || 0));
        const totalStage = friendsByStage.reduce((s, [, v]) => s + ((v.stage || 0)), 0);
        const top2Stage = friendsByStage.slice(0, 2).reduce((s, [, v]) => s + ((v.stage || 0)), 0);
        const top3Stage = friendsByStage.slice(0, 3).reduce((s, [, v]) => s + ((v.stage || 0)), 0);
        const dominance2 = totalStage > 0 ? top2Stage / totalStage : 0;
        const dominance3 = totalStage > 0 ? top3Stage / totalStage : 0;
        const strongTies = friendsByStage.filter(([_, v]) => (v.stage || 0) >= 8);
        const strongCount = strongTies.length;

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
        const activitiesCount = activitiesArr.length;

        const warnHistory = loadWarnHistory();
const rawWarnEntry = warnHistory[String(target.id)] || null;
function coerceWarnTsList(entry) {
  if (!entry) return [];
  if (Array.isArray(entry)) return entry.filter(x => typeof x === "number");
  if (typeof entry.ts === "number") return [entry.ts];
  if (Array.isArray(entry.ts)) return entry.ts.filter(x => typeof x === "number");
  if (Array.isArray(entry.events)) return entry.events.filter(x => typeof x === "number");
  return [];
}
const warnTsList = coerceWarnTsList(rawWarnEntry).sort((a,b)=>b-a);
const nowMs = Date.now();
const dayMs = 86400000;
const countInDays = (d) => warnTsList.filter(ts => nowMs - ts <= d*dayMs).length;
const warn7 = countInDays(7);
const warn30 = countInDays(30);
const warn90 = countInDays(90);
const warnTotal = warnTsList.length;
const lastWarnTs = warnTsList[0] || null;
const lastWarnDays = lastWarnTs ? Math.floor((nowMs - lastWarnTs)/dayMs) : 9999;
const warnInfoText = warnTsList.length
  ? `최근: <t:${Math.floor(lastWarnTs/1000)}:R>\n7일:${warn7}  30일:${warn30}  90일:${warn90}  총:${warnTotal}`
  : "없음";


        function buildEvaluations() {
          const C = [];
          const evidence = relFromEvidence(msgCount, voiceHours, activitiesCount, lastActiveDays);
          const push = (raw, text, tone, cap = 93, floor = 2, isPositive = false, extraCap = null) => {
            let p = scoreToProb(raw, evidence, cap, floor);
            if (isPositive) p = posCapByRecency(p, lastActiveDays);
            if (typeof extraCap === "number") p = Math.min(p, extraCap);
            C.push({ p, t: `${text} ${p}%`, tone });
          };

          const rulePenaltyBase = (hasServerLock ? 30 : 0) + (hasXpLock ? 20 : 0) + (timeoutActive ? 45 : 0);
const rulePenaltyWarn = Math.min(35, warn30 * 15) + (lastWarnDays <= 3 ? 10 : lastWarnDays <= 7 ? 6 : 0);
const rulePenalty = rulePenaltyBase + rulePenaltyWarn;

          const socialPlus = Math.min(32, (topFriends.length || 0) * 10);
          const msgPlus = Math.min(30, (msgCount / 600) * 30);
          const vcPlus = Math.min(30, (voiceHours / 50) * 30);

          const offsiteBase =
            (activitiesCount >= 50 ? 45 : activitiesCount >= 25 ? 30 : 10) +
            (voiceHours < 0.1 ? 40 : voiceHours < 0.5 ? 25 : 0) +
            (msgCount >= 150 ? 10 : 0) +
            (uniqueGames >= 3 ? 5 : 0) -
            (voiceHours >= 1 ? 15 : 0);
          const offsiteRaw = Math.max(0, Math.min(95, offsiteBase));

          const voiceBias = voiceHours > 0 ? voiceHours / (voiceHours + (msgCount / 30) + 1e-9) : 0;
          let vcCliqueRaw = 0;
          if (voiceHours >= 3 && strongCount > 0 && strongCount <= 3) {
            vcCliqueRaw = Math.max(0, Math.min(95,
              (voiceHours >= 10 ? 40 : voiceHours >= 5 ? 28 : 18) +
              (strongCount <= 2 ? 30 : 18) +
              Math.round(voiceBias * 25)
            ));
          }

          let samePeersRaw = 0;
          if ((msgCount + voiceHours * 60) >= 80 && totalStage > 0) {
            const domScore = Math.max(dominance2, dominance3);
            samePeersRaw = Math.max(0, Math.min(95,
              (domScore - 0.6) * 140 +
              (strongCount <= 3 ? 10 : 0) +
              (voiceHours >= 5 ? 8 : 0)
            ));
          }

          push(offsiteRaw, "활동 이력 대비 ‘뒷서버’ 의심 정황 확률", "neg", 88, 3, false);
          push(vcCliqueRaw, "소규모 중심 활동 성향 확률", "neutral", 86, 2, false);
          push(samePeersRaw, "동일 유저끼리만 소통하는 편향 성향 확률", "neg", 86, 2, false);

          const warnTrailRaw = Math.min(95,
  warn7 * 35 + warn30 * 20 + warn90 * 10 +
  (lastWarnDays <= 3 ? 20 : lastWarnDays <= 7 ? 12 : lastWarnDays <= 14 ? 8 : 0)
);
push(warnTrailRaw, "최근 경고·제재 이력 신호가 있을 확률", "neg", 92, 2, false);


          let friendlyRaw = Math.max(0,
  10 + msgPlus + vcPlus + socialPlus - rulePenalty
  - Math.min(25, offsiteRaw * 0.4)
  - Math.min(20, samePeersRaw * 0.2)
  - Math.min(15, vcCliqueRaw * 0.15)
  - Math.min(20, warnTrailRaw * 0.25)
);

          const lowEvidence = (msgCount + voiceHours * 60) < 40 || lastActiveDays > 14;
          push(
            friendlyRaw,
            "서버에 우호적일 확률",
            "pos",
            90,
            2,
            true,
            lowEvidence ? 40 : null
          );

          const toxicSignals =
  Math.min(50, enemiesArr.length * 18) +
  (hasServerLock ? 25 : 0) +
  (hasXpLock ? 12 : 0) +
  (timeoutActive ? 35 : 0) +
  Math.min(30, warn90 * 10) +
  (lastWarnDays <= 14 ? 10 : 0);
          const toxicRaw = Math.min(95, 20 + toxicSignals - socialPlus / 2);
          push(toxicRaw, "분쟁/배척 성향 확률", "neg", 90, 2, false);

          const churnRaw = Math.max(0,
            (lastActiveDays > 30 ? 65 : lastActiveDays > 14 ? 40 : 0) +
            (msgCount < 10 ? 20 : msgCount < 40 ? 10 : 0) +
            (voiceHours < 1 ? 15 : 0)
          );
          push(churnRaw, "이탈 위험 확률", "neg", 90, 2, false);

          const ruleOkRaw = Math.max(0, 85 - rulePenalty);
          push(ruleOkRaw, "규칙 준수 확률", "pos", 88, 3, true);

          const riskMgmtRaw = Math.min(95, rulePenalty + (toxicSignals / 2));
          push(riskMgmtRaw, "관리가 필요한 상태일 확률", "neg", 92, 2, false);

          const influenceRaw = Math.min(40, roleCount * 4) + Math.min(40, (msgCount / 800) * 40) + Math.min(20, (topFriends.length || 0) * 6);
          push(influenceRaw, "영향력 있는 핵심 인물 확률", "pos", 86, 2, true);

          const steadyRaw = (joinDays > 60 ? 25 : 0) + (lastActiveDays <= 7 ? 35 : 0) + (msgCount >= 60 ? 25 : 0) + (voiceHours >= 5 ? 15 : 0);
          push(steadyRaw, "꾸준한 스테디셀러 확률", "pos", 86, 3, true);

          const MIN_SHOW = 0; // 전부 보려면 0, 너무 잡음이면 10~20 정도로 올려도 됨
const result = C
  .filter(x => x.p >= MIN_SHOW)
  .sort((a, b) => b.p - a.p);

return result.length
  ? result.map(x => (x.tone === "pos" ? "✅" : x.tone === "neg" ? "⚠️" : "ℹ️") + " " + x.t)
  : ["ℹ️ 데이터가 부족해 평가를 보류합니다."];
        }

        const evalLines = buildEvaluations();

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
            { name: "제재/경고 이력", value: warnInfoText, inline: false },
            { name: "갓봇의 평가", value: Array.isArray(evalLines) ? evalLines.join("\n") : String(evalLines), inline: false }
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
