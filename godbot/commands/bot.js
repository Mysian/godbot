// commands/bot.js
const { SlashCommandBuilder, EmbedBuilder, ApplicationCommandType } = require("discord.js");
const { exec } = require("child_process");
const path = require("path");

const MAIN_STAFF_ROLE_ID = "786128824365482025";
const MAX_COMMANDS = 100;
const DESCRIPTION_LIMIT = 4000;

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
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: "❌ 서버 내에서만 사용 가능한 명령어입니다.", ephemeral: true });
    }
    const member = await guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(MAIN_STAFF_ROLE_ID)) {
      return interaction.reply({ content: "❌ 이 명령어는 메인스탭(관리진)만 사용할 수 있어.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    // /봇 업데이트
    if (sub === "업데이트") {
      await interaction.reply({ content: "⏳ 서버에서 `git pull origin main` 실행 중…", ephemeral: true });
      exec("git pull origin main", (err, stdout, stderr) => {
        if (err) {
          return interaction.followUp({ content: `❌ 오류:\n\`\`\`${stderr || err.message}\`\`\``, ephemeral: true });
        }
        interaction.followUp({ content: `✅ 업데이트 결과:\n\`\`\`${stdout || "업데이트 없음"}\`\`\``, ephemeral: true });
      });
      return;
    }

    // /봇 명령어업데이트
    if (sub === "명령어업데이트") {
      await interaction.deferReply({ ephemeral: true });

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
            guild.commands.fetch().catch(() => null),
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

        await interaction.editReply({ embeds: [embed] }).catch(() => {});
      });
      return;
    }

    // /봇 재시작
    if (sub === "재시작") {
      await interaction.reply({ content: "♻️ 봇을 재시작할게! 약간 끊길 수 있어.", ephemeral: true });
      setTimeout(() => {
        exec("pm2 restart index.js", () => {});
      }, 1000);
      return;
    }
  }
};
