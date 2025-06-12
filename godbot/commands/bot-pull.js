// commands/bot-pull.js
const { SlashCommandBuilder } = require("discord.js");
const { exec } = require("child_process");

const MAIN_STAFF_ROLE_ID = "786128824365482025";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("봇깃업데이트")
    .setDescription("메인스탭만 사용 가능: 서버에서 git pull origin main 실행"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: "❌ 서버 내에서만 사용 가능한 명령어입니다.", ephemeral: true });
    }

    const member = await guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(MAIN_STAFF_ROLE_ID)) {
      return interaction.reply({ content: "❌ 이 명령어는 메인스탭(관리진)만 사용할 수 있습니다.", ephemeral: true });
    }

    await interaction.reply({
      content: "⏳ 서버에서 `git pull origin main`을 실행 중입니다...",
      ephemeral: true
    });

    exec("git pull origin main", (err, stdout, stderr) => {
      if (err) {
        interaction.followUp({
          content: `❌ 오류 발생: \`\`\`${stderr || err.message}\`\`\``,
          ephemeral: true
        });
        return;
      }
      interaction.followUp({
        content: `✅ 업데이트 결과:\n\`\`\`${stdout || "업데이트 내용 없음"}\`\`\``,
        ephemeral: true
      });
    });
  }
};
