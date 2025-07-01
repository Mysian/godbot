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
const SPAM_ROLE_ID    = "1205052922296016906";
const PAGE_SIZE       = 1900;
const dataDir         = path.join(__dirname, "../data");
const adminpwPath     = path.join(dataDir, "adminpw.json");

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
const relationship    = require("../utils/relationship.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("관리")
    .setDescription("서버 관리 명령어입니다.")
    .addStringOption(option =>
      option
        .setName("옵션")
        .setDescription("실행할 관리 기능")
        .setRequired(true)
        .addChoices(
          { name: "유저 관리",      value: "user" },
          { name: "서버상태",       value: "status" },
          { name: "저장파일 백업",  value: "json_backup" },
          { name: "스팸의심 계정 추방", value: "spam_kick" }
        )
    )
    .addUserOption(option =>
      option
        .setName("대상유저")
        .setDescription("조회할 유저")
        .setRequired(false)
    ),

  /* ========================================================================== */
  async execute(interaction) {
    const option         = interaction.options.getString("옵션");
    const guild          = interaction.guild;
    const activityStats  = activityTracker.getStats({});

    /* ============================== 서버 상태 =============================== */
    if (option === "status") {
      await interaction.deferReply({ ephemeral: true });

      const mem      = process.memoryUsage();
      const rssMB    = mem.rss      / 1024 / 1024;
      const heapMB   = mem.heapUsed / 1024 / 1024;
      const load     = os.loadavg()[0];
      const upSec    = Math.floor(process.uptime());
      const uptime   = `${Math.floor(upSec / 3600)}시간 ${Math.floor((upSec % 3600) / 60)}분 ${upSec % 60}초`;

      const memState = rssMB  > 1024 ? "🔴" : rssMB  > 500 ? "🟡" : "🟢";
      const cpuState = load   > 3    ? "🔴" : load   > 1.5 ? "🟡" : "🟢";
      const total    = (memState === "🔴" || cpuState === "🔴") ? "🔴 불안정"
                     : (memState === "🟡" || cpuState === "🟡") ? "🟡 주의"
                     : "🟢 안정적";

      const comment =
        total === "🟢 안정적" ? "서버가 쾌적하게 동작 중이에요!"
      : total === "🟡 주의"   ? "서버에 약간 부하가 있어요."
                              : "서버 부하 심각! 재시작이나 최적화 필요!";

      const embed = new EmbedBuilder()
        .setTitle(`${total} | 서버 상태`)
        .setColor(total.startsWith("🔴") ? 0xff2222 : total.startsWith("🟡") ? 0xffcc00 : 0x43e743)
        .setDescription(comment)
        .addFields(
          { name: `메모리 ${memState}`, value: `RSS ${rssMB.toFixed(2)} MB\nheap ${heapMB.toFixed(2)} MB`, inline: true },
          { name: `CPU ${cpuState}`,    value: `1분 평균 ${load.toFixed(2)}`, inline: true },
          { name: "Uptime",            value: uptime, inline: true },
          { name: "Node 버전",         value: process.version, inline: true },
          { name: "플랫폼",            value: `${os.platform()} (${os.arch()})`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], ephemeral: true });
      return;
    }

    /* ============================ JSON 백업 ============================== */
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

    /* ====================== 스팸 의심 계정 일괄 추방 ====================== */
    if (option === "spam_kick") {
      await interaction.deferReply({ ephemeral: true });
      const members = await guild.members.fetch();
      const targets = [];

      for (const member of members.values()) {
        if (member.user.bot) continue;
        if (member.roles.cache.has(EXCLUDE_ROLE_ID)) continue;

        const roles      = member.roles.cache;
        const hasSpam    = roles.has(SPAM_ROLE_ID);
        const onlyNewbie = roles.size === 1 && roles.has("1295701019430227988");
        const onlySpam   = roles.size === 1 && roles.has(SPAM_ROLE_ID);
        const noRole     = roles.filter(r => r.id !== guild.id).size === 0;

        if (noRole || hasSpam || onlyNewbie || onlySpam) targets.push(member);
      }

      const desc = targets.length
        ? targets.slice(0, 30).map(m => `• <@${m.id}> (${m.user.tag})`).join("\n")
          + (targets.length > 30 ? `\n외 ${targets.length - 30}명...` : "")
        : "✅ 추방 대상자가 없습니다.";

      const preview = new EmbedBuilder()
        .setTitle("[스팸 의심] 추방 대상")
        .setDescription(desc)
        .setColor(0xee4444);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("confirm_spam_kick").setLabel("✅ 예").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("cancel_spam_kick").setLabel("❌ 아니오").setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [preview], components: [row] });

      const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time:   20_000,
      });

      collector.on("collect", async i => {
        if (i.customId === "confirm_spam_kick") {
          await i.update({ content: "⏳ 추방 진행 중...", embeds: [], components: [] });

          let success = 0, failed = [];
          for (const m of targets) {
            try { await m.kick("스팸/비정상 계정 자동 추방"); success++; }
            catch { failed.push(`${m.user.tag}(${m.id})`); }
            await new Promise(r => setTimeout(r, 350));
          }
          await interaction.followUp({
            content: `✅ ${success}명 추방 완료${failed.length ? `\n❌ 실패: ${failed.join(", ")}` : ""}`,
            ephemeral: true
          });
        } else {
          await i.update({ content: "❌ 취소되었습니다.", embeds: [], components: [] });
        }
      });

      collector.on("end", c => { if (!c.size) interaction.editReply({ content: "⏰ 시간 초과, 취소됨.", embeds: [], components: [] }); });
      return;
    }

    /* ============================ 유저 관리 ============================== */
    if (option === "user") {
      await interaction.deferReply({ ephemeral: true });
      const origin = interaction;                       // 원본 interaction 저장
      const target = interaction.options.getUser("대상유저") || interaction.user;

      /* ---------- 유저 정보 렌더 ---------- */
      async function renderUser(userId, intCtx) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          await intCtx.editReply({ content: "❌ 해당 유저를 찾지 못했어." });
          return;
        }

        /* 통계 */
        const stat      = activityStats.find(x => x.userId === member.id) || { message: 0, voice: 0 };
        const fmtSec    = s => {
          const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
          return h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`;
        };

        /* 친구·적대 관계 */
        const relTop    = relationship.getTopRelations(member.id, 3);
        const relData   = relationship.loadData()[member.id] || {};
        const enemyTop  = Object.entries(relData)
          .sort((a, b) => (a[1].stage - b[1].stage) || (a[1].remain - b[1].remain))
          .slice(0, 3)
          .map(([id, v]) => `<@${id}> (${relationship.getRelationshipLevel(v.stage - 6)})`);

        const embed = new EmbedBuilder()
          .setTitle(`유저 정보: ${member.user.tag}`)
          .setThumbnail(member.displayAvatarURL())
          .addFields(
            { name: "ID",       value: member.id, inline: true },
            { name: "입장일",   value: member.joinedAt.toLocaleString("ko-KR"), inline: true },
            { name: "메시지",   value: `${stat.message}`, inline: true },
            { name: "음성",     value: fmtSec(stat.voice), inline: true },
            { name: "친구 TOP3", value: relTop.length ? relTop.map((x,i)=>`#${i+1} <@${x.userId}> (${x.relation})`).join("\n") : "없음", inline: false },
            { name: "적대 TOP3", value: enemyTop.length ? enemyTop.join("\n") : "없음", inline: false }
          )
          .setColor(0x00bfff);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("refresh_userinfo").setLabel("🔄 새로고침").setStyle(ButtonStyle.Secondary)
        );

        await intCtx.editReply({ embeds: [embed], components: [row] });
      }

      /* 최초 출력 */
      await renderUser(target.id, origin);

      /* 새로고침 버튼 collector */
      const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time:  60_000,
      });

      collector.on("collect", async i => {
        if (i.customId === "refresh_userinfo") {
          await i.deferUpdate();                        // ← 오류 방지
          await renderUser(target.id, origin);          // 원본 메시지 업데이트
        }
      });
      return;
    }
  },

  /* ========================================================================== */
  async modalSubmit(interaction) {
    /* ---------- JSON 백업 ---------- */
    if (interaction.customId === "adminpw_json_backup") {
      const pw      = interaction.fields.getTextInputValue("pw");
      const savedPw = loadAdminPw();
      if (!savedPw || pw !== savedPw) {
        await interaction.reply({ content: "❌ 비밀번호가 일치하지 않아.", ephemeral: true });
        return;
      }

      /* 재귀적으로 .json 파일 수집 */
      const jsonFiles = [];
      (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(abs);
          else if (entry.isFile() && entry.name.endsWith(".json")) jsonFiles.push(abs);
        }
      })(dataDir);

      if (!jsonFiles.length) {
        await interaction.reply({ content: "🔍 .json 파일이 없어!", ephemeral: true });
        return;
      }

      const zip = new AdmZip();
      for (const file of jsonFiles) {
        const relDir = path.relative(dataDir, path.dirname(file));   // 폴더 구조 살리기
        zip.addLocalFile(file, relDir);
      }

      const stamp   = new Date().toISOString().replace(/[-:]/g, "").split(".")[0];
      const zipName = `backup_${stamp}.zip`;
      const tmpPath = path.join(__dirname, `../data/${zipName}`);
      zip.writeZip(tmpPath);

      await interaction.reply({
        content: "✅ JSON 백업 완료!",
        files:   [new AttachmentBuilder(tmpPath, { name: zipName })],
        ephemeral: true
      });

      /* 1분 뒤 임시 ZIP 삭제 */
      setTimeout(() => { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); }, 60_000);
    }
  }
};
