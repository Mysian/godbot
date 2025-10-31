// commands/bot.js
const { SlashCommandBuilder, EmbedBuilder, ApplicationCommandType } = require("discord.js");
const { exec } = require("child_process");
const path = require("path");

const MAIN_STAFF_ROLE_ID = "786128824365482025";
const MAX_COMMANDS = 100;
const DESCRIPTION_LIMIT = 4000;

/** 공통: 권한 체크 */
async function ensureStaff(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "❌ 서버 내에서만 사용 가능한 기능이야.", ephemeral: true }).catch(()=>{});
    return false;
  }
  const member = await guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(MAIN_STAFF_ROLE_ID)) {
    await interaction.reply({ content: "❌ 이 기능은 메인스탭(관리진)만 사용 가능해.", ephemeral: true }).catch(()=>{});
    return false;
  }
  return true;
}

/** 버튼용: git pull */
async function runGitPull(interaction) {
  if (!(await ensureStaff(interaction))) return;
  await interaction.reply({ content: "⏳ 서버에서 `git pull origin main` 실행 중…", ephemeral: true }).catch(()=>{});
  exec("git pull origin main", (err, stdout, stderr) => {
    if (err) {
      return interaction.followUp({ content: `❌ 오류:\n\`\`\`${stderr || err.message}\`\`\``, ephemeral: true }).catch(()=>{});
    }
    interaction.followUp({ content: `✅ 업데이트 결과:\n\`\`\`${stdout || "업데이트 없음"}\`\`\``, ephemeral: true }).catch(()=>{});
  });
}

/** 버튼용: deploy-commands */
async function runDeployCommands(interaction) {
  if (!(await ensureStaff(interaction))) return;

  await interaction.deferReply({ ephemeral: true }).catch(()=>{});

  const deployScriptPath = path.join(__dirname, "../deploy-commands.js");
  exec(`node "${deployScriptPath}"`, { cwd: process.cwd(), timeout: 30_000 }, async (err, stdout, stderr) => {
    let resultText = "";
    if (err) resultText += `❌ [Error]\n${err.message || ""}\n`;
    if (stderr) resultText += `❗ [stderr]\n${stderr}\n`;
    if (stdout) resultText += `✅ [stdout]\n${stdout}\n`;
    if (!resultText.trim()) resultText = "업데이트 완료!";

    let guildSlash = 0, globalSlash = 0, totalSlash = 0;
    try {
      const [globalCmds, guildCmds] = await Promise.all([
        interaction.client.application.commands.fetch().catch(() => null),
        interaction.guild.commands.fetch().catch(() => null),
      ]);
      if (globalCmds) globalSlash = globalCmds.filter(c => c.type === ApplicationCommandType.ChatInput).size;
      if (guildCmds) guildSlash = guildCmds.filter(c => c.type === ApplicationCommandType.ChatInput).size;
      totalSlash = guildSlash + globalSlash;
    } catch {}

    const ok = !err && !(stderr && stderr.trim().length);
    const embed = new EmbedBuilder()
      .setTitle(`봇 명령어 업데이트 결과 [${totalSlash}/${MAX_COMMANDS}]`)
      .setDescription("```" + (resultText.length > DESCRIPTION_LIMIT
        ? resultText.slice(0, DESCRIPTION_LIMIT - 20) + "\n...(길이 제한으로 일부 생략)"
        : resultText) + "```")
      .setColor(ok ? 0x57F287 : 0xED4245)
      .setFooter({ text: `슬래시 명령어 수 • 길드 ${guildSlash} · 글로벌 ${globalSlash}` })
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] }).catch(()=>{});
  });
}

/** 버튼용: pm2 restart */
async function runPm2Restart(interaction) {
  if (!(await ensureStaff(interaction))) return;
  await interaction.reply({ content: "♻️ 봇을 재시작할게! 약간 끊길 수 있어.", ephemeral: true }).catch(()=>{});
  setTimeout(() => {
    exec("pm2 restart index.js", () => {});
  }, 1000);
}

/** 슬래시 명령어 (기존 유지, 내부 구현은 위 버튼 함수 재사용) */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("봇")
    .setDescription("메인스탭 전용 봇 관리 명령어 모음")
    .addSubcommand(sc =>
      sc.setName("업데이트")
        .setDescription("서버에서 git pull origin main 실행"))
    .addSubcommand(sc =>
      sc.setName("명령어업데이트")
        .setDescription("deploy-commands 재실행(슬래시 명령어 재등록)"))
    .addSubcommand(sc =>
      sc.setName("재시작")
        .setDescription("pm2로 봇 프로세스 재시작")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "업데이트") return runGitPull(interaction);
    if (sub === "명령어업데이트") return runDeployCommands(interaction);
    if (sub === "재시작") return runPm2Restart(interaction);
  },

  // 버튼에서 직접 호출하기 위한 export
  runGitPull,
  runDeployCommands,
  runPm2Restart,
  ensureStaff,
};
