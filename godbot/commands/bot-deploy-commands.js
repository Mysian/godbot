// commands/bot-deploy-commands.js
const { SlashCommandBuilder } = require("discord.js");
const { exec } = require("child_process");
const path = require("path");

const MAIN_STAFF_ROLE_ID = "786128824365482025";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("봇명령어업데이트")
    .setDescription("메인스탭만 사용 가능: node deploy-commands.js 실행 (슬래시 명령어 재등록)"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: "❌ 서버 내에서만 사용 가능한 명령어입니다.", ephemeral: true });
    }

    const member = await guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(MAIN_STAFF_ROLE_ID)) {
      return interaction.reply({ content: "❌ 이 명령어는 메인스탭(관리진)만 사용할 수 있습니다.", ephemeral: true });
    }

    // 3초 제한 대비, 미리 응답 (defer)
    await interaction.deferReply({ ephemeral: true });

    // deploy-commands.js 실행 경로 보장
    const deployScriptPath = path.join(__dirname, "../deploy-commands.js");

    exec(`node "${deployScriptPath}"`, { cwd: process.cwd(), timeout: 30_000 }, async (err, stdout, stderr) => {
      if (err) {
        await interaction.editReply({
          content: `❌ 오류 발생:\n\`\`\`\n${stderr || err.message}\n\`\`\``,
        }).catch(() => {});
        return;
      }
      await interaction.editReply({
        content: `✅ 명령어 업데이트 결과:\n\`\`\`\n${stdout || "업데이트 완료!"}\n\`\`\``
      }).catch(() => {});
    });
  }
};
