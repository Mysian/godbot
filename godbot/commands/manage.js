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
const relationship     = require("../utils/relationship.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("관리")
    .setDescription("서버 관리 명령어입니다.")
    .addStringOption(option =>
      option
        .setName("옵션")
        .setDescription("실행할 관리 기능을 선택하세요.")
        .setRequired(true)
        .addChoices(
          { name: "유저 관리", value: "user" },
          { name: "서버상태", value: "status" },
          { name: "저장파일 백업", value: "json_backup" },
          { name: "스팸의심 계정 추방", value: "spam_kick" }
        )
    )
    .addUserOption(option =>
      option
        .setName("대상유저")
        .setDescription("정보를 조회할 유저")
        .setRequired(false)
    ),

  async execute(interaction) {
    const option = interaction.options.getString("옵션");
    const guild  = interaction.guild;
    const activityStats = activityTracker.getStats({});

    /* ===============================  서버 상태  =============================== */
    if (option === "status") {
      await interaction.deferReply({ ephemeral: true });

      const memory   = process.memoryUsage();
      const rssMB    = memory.rss       / 1024 / 1024;
      const heapMB   = memory.heapUsed  / 1024 / 1024;
      const load     = os.loadavg()[0];
      const uptimeSec = Math.floor(process.uptime());
      const uptime   = (() => {
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;
        return `${h}시간 ${m}분 ${s}초`;
      })();

      let memState = rssMB  > 1024 ? "🔴" : rssMB  > 500 ? "🟡" : "🟢";
      let cpuState = load   > 3     ? "🔴" : load   > 1.5 ? "🟡" : "🟢";
      let upState  = uptimeSec < 3600 ? "🔴" : uptimeSec < 86400 ? "🟡" : "🟢";

      let total = (memState === "🔴" || cpuState === "🔴") ? "🔴 불안정"
                : (memState === "🟡" || cpuState === "🟡") ? "🟡 주의"
                : "🟢 안정적";

      const comment =
        total === "🟢 안정적" ? "서버가 매우 쾌적하게 동작 중이에요!"
      : total === "🟡 주의"   ? "서버에 약간의 부하가 있으니 주의하세요."
                              : "지금 서버가 상당히 무거워요! 재시작이나 최적화가 필요할 수 있음!";

      let hostInfo = `플랫폼: ${os.platform()} (${os.arch()})\n호스트: ${os.hostname()}`;
      if (process.env.RAILWAY_STATIC_URL) hostInfo += `\nRailway URL: ${process.env.RAILWAY_STATIC_URL}`;

      const embed = new EmbedBuilder()
        .setTitle(`${total} | 서버 상태 진단`)
        .setColor(total === "🔴 불안정" ? 0xff2222 : total === "🟡 주의" ? 0xffcc00 : 0x43e743)
        .setDescription(comment)
        .addFields(
          { name: `메모리 사용량 ${memState}`, value: `RSS: ${rssMB.toFixed(2)}MB\nheapUsed: ${heapMB.toFixed(2)}MB`, inline: true },
          { name: `CPU 부하율 ${cpuState}`, value: `1분 평균: ${load.toFixed(2)}`, inline: true },
          { name: `실행시간(Uptime) ${upState}`, value: uptime, inline: true },
          { name: "호스트정보", value: hostInfo, inline: false },
          { name: "Node 버전",  value: process.version, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], ephemeral: true });
      return;
    }

    /* ===============================  JSON 백업  =============================== */
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

    /* ===============================  스팸 의심 계정 일괄 추방  =============================== */
    if (option === "spam_kick") {
      await interaction.deferReply({ ephemeral: true });
      const members     = await guild.members.fetch();
      const 추방대상 = [];

      for (const member of members.values()) {
        if (member.user.bot) continue;
        if (member.roles.cache.has(EXCLUDE_ROLE_ID)) continue;

        const roles       = member.roles.cache;
        const hasSpamRole = roles.has(SPAM_ROLE_ID);
        const onlyNewbie  = roles.size === 1 && roles.has("1295701019430227988");
        const onlySpam    = roles.size === 1 && roles.has(SPAM_ROLE_ID);
        const noRole      = roles.filter(r => r.id !== guild.id).size === 0;

        if (noRole || hasSpamRole || onlyNewbie || onlySpam) 추방대상.push(member);
      }

      const descList    = [];
      let   totalLength = 0;
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
        .setDescription(추방대상.length ? descList.join("\n") : "✅ 추방 대상자가 없습니다.")
        .setColor(0xee4444);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("confirm_spam_kick").setLabel("✅ 예").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("cancel_spam_kick").setLabel("❌ 아니오").setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [preview], components: [row] });

      const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 20000,
      });

      collector.on("collect", async i => {
        if (i.customId === "confirm_spam_kick") {
          await i.update({ content: "⏳ 스팸의심 계정 추방 진행 중...", embeds: [], components: [] });

          let success = 0,
              failed  = [];
          for (const member of 추방대상) {
            try {
              await member.kick("스팸/비정상 계정 자동 추방");
              await new Promise(res => setTimeout(res, 350));
              success++;
            } catch {
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

      collector.on("end", async collected => {
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

    /* ===============================  유저 관리 (조회/새로고침만)  =============================== */
    if (option === "user") {
      await interaction.deferReply({ ephemeral: true });

      /* ----------  내부 유틸: 유저 정보 표시  ---------- */
      async function showUserInfo(targetUserId, userInteraction) {
        const target = await guild.members.fetch(targetUserId).then(m => m.user).catch(() => null);
        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (!member || !target) {
          const errorReply = { content: "❌ 해당 유저를 찾을 수 없습니다." };
          userInteraction.editReply
            ? await userInteraction.editReply(errorReply)
            : await userInteraction.update({ ...errorReply, embeds: [], components: [] });
          return;
        }

        /* 메시지·음성 통계 */
        const stat        = activityStats.find(x => x.userId === target.id) || { message: 0, voice: 0 };
        const formatSec   = s => {
          s = Math.floor(s || 0);
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          const sec = s % 60;
          if (h) return `${h}시간 ${m}분 ${sec}초`;
          if (m) return `${m}분 ${sec}초`;
          return `${sec}초`;
        };

        /* 마지막 활동일 */
        let lastActiveStr = "기록 없음";
        try {
          const rawPath = path.join(__dirname, "../../activity-data.json");
          if (fs.existsSync(rawPath)) {
            const activityData = JSON.parse(fs.readFileSync(rawPath, "utf8"));
            const userData = activityData[target.id];
            if (userData) {
              const timestamps = Object.keys(userData).filter(ts => !isNaN(Date.parse(ts)));
              const lastActive = timestamps.sort().reverse()[0];
              if (lastActive) lastActiveStr = new Date(lastActive).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
            }
          }
        } catch (err) {
          console.error("📛 마지막 활동일 가져오는 중 오류:", err);
        }

        /* 친구·적대 관계 */
        const joinedAt      = member.joinedAt;
        const joinedAtStr   = joinedAt ? joinedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "기록 없음";
        const topFriends    = relationship.getTopRelations(target.id, 3);
        const relData       = relationship.loadData()[target.id] || {};
        const enemiesArr    = Object.entries(relData)
          .sort((a, b) => (a[1].stage - b[1].stage) || (a[1].remain - b[1].remain))
          .slice(0, 3)
          .map(([id, val]) => ({
            userId: id,
            stage:  val.stage,
            remain: val.remain,
            relation: relationship.getRelationshipLevel(val.stage - 6),
          }));

        const friendsText = topFriends.length
          ? topFriends.map((x, i) => `#${i + 1} <@${x.userId}> (${x.relation})`).join("\n")
          : "없음";
        const enemiesText = enemiesArr.length
          ? enemiesArr.map((x, i) => `#${i + 1} <@${x.userId}> (${x.relation})`).join("\n")
          : "없음";

        /* 타임아웃 상태(표시만) */
        const timeoutActive = member.communicationDisabledUntil && member.communicationDisabledUntilTimestamp > Date.now();
        const timeoutExpireStr = timeoutActive ? `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>` : "";

        /* -----------  Embed & 버튼  ----------- */
        const embed = new EmbedBuilder()
          .setTitle(`유저 정보: ${target.tag}`)
          .setThumbnail(target.displayAvatarURL())
          .addFields(
            { name: "유저 ID",            value: target.id, inline: false },
            { name: "서버 입장일",        value: joinedAtStr, inline: false },
            { name: "마지막 활동일",      value: lastActiveStr, inline: false },
            { name: "메시지 수",          value: `${stat.message || 0}`, inline: true },
            { name: "음성 이용 시간",      value: formatSec(stat.voice), inline: true },
            { name: "가장 친한 유저 TOP3", value: friendsText, inline: false },
            { name: "가장 적대하는 유저 TOP3", value: enemiesText, inline: false },
            ...(timeoutActive
              ? [{ name: "⏱️ 타임아웃", value: `**활성화 중**\n만료: ${timeoutExpireStr}`, inline: false }]
              : [])
          )
          .setColor(0x00bfff);

        /* [새로고침] 단일 버튼 */
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("refresh_userinfo")
            .setLabel("🔄 새로고침")
            .setStyle(ButtonStyle.Secondary)
        );

        if (userInteraction.editReply)
          await userInteraction.editReply({ embeds: [embed], components: [row] });
        else
          await userInteraction.update({ embeds: [embed], components: [row], content: "" });
      }

      /* 최초 표출 */
      const target = interaction.options.getUser("대상유저") || interaction.user;
      await showUserInfo(target.id, interaction);

      /* 버튼 collector (새로고침만 처리) */
      const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 60 * 1000,
      });

      collector.on("collect", async i => {
        if (i.customId === "refresh_userinfo") await showUserInfo(target.id, i);
      });

      collector.on("end", () => {});
      return;
    }
  },

  /* ===============================  모달 처리 =============================== */
  async modalSubmit(interaction) {
    /* ----------  JSON 백업용 비밀번호 ---------- */
    if (interaction.customId === "adminpw_json_backup") {
      const pw      = interaction.fields.getTextInputValue("pw");
      const savedPw = loadAdminPw();
      if (!savedPw || pw !== savedPw) {
        await interaction.reply({ content: "❌ 비밀번호가 일치하지 않습니다.", ephemeral: true });
        return;
      }

      const files = fs.existsSync(dataDir)
        ? fs.readdirSync(dataDir).filter(f => f.endsWith(".json"))
        : [];
      if (!files.length) {
        await interaction.reply({ content: "data 폴더에 .json 파일이 없습니다.", ephemeral: true });
        return;
      }

      const zip = new AdmZip();
      for (const file of files) zip.addLocalFile(path.join(dataDir, file), "", file);

      const now      = new Date();
      const dateStr  = now.toISOString().replace(/[-:]/g, "").split(".")[0]; // YYYYMMDDTHHMMSS
      const filename = `${dateStr}.zip`;
      const tmpPath  = path.join(__dirname, `../data/${filename}`);
      zip.writeZip(tmpPath);

      const attachment = new AttachmentBuilder(tmpPath, { name: filename });
      await interaction.reply({
        content: `모든 .json 파일을 압축했습니다. (${filename})`,
        files:   [attachment],
        ephemeral: true,
      });

      /* 60초 뒤 임시 ZIP 삭제 */
      setTimeout(() => { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); }, 60 * 1000);
    }
  }
};
