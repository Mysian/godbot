// commands/bot-deploy-commands.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { exec } = require("child_process");
const path = require("path");

const MAIN_STAFF_ROLE_ID = "786128824365482025";
const EMBED_CHAR_LIMIT = 1000; // 각 임베드 최대 표시

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

    await interaction.deferReply({ ephemeral: true });

    const deployScriptPath = path.join(__dirname, "../deploy-commands.js");

    exec(`node "${deployScriptPath}"`, { cwd: process.cwd(), timeout: 30_000 }, async (err, stdout, stderr) => {
      if (err) {
        const embed = new EmbedBuilder()
          .setTitle("❌ 오류 발생")
          .setDescription(`\`\`\`\n${stderr || err.message}\n\`\`\``)
          .setColor(0xED4245);
        await interaction.editReply({ embeds: [embed] }).catch(() => {});
        return;
      }

      const resultText = stdout || "업데이트 완료!";
      const embeds = [];

      // 두 페이지로 분할
      if (resultText.length > EMBED_CHAR_LIMIT) {
        embeds.push(
          new EmbedBuilder()
            .setTitle("✅ 명령어 업데이트 결과 (1/2)")
            .setDescription(`\`\`\`\n${resultText.slice(0, EMBED_CHAR_LIMIT)}\n\`\`\``)
            .setColor(0x57F287)
        );
        embeds.push(
          new EmbedBuilder()
            .setTitle("✅ 명령어 업데이트 결과 (2/2)")
            .setDescription(`\`\`\`\n${resultText.slice(EMBED_CHAR_LIMIT, EMBED_CHAR_LIMIT * 2)}\n\`\`\``)
            .setColor(0x57F287)
        );
      } else {
        embeds.push(
          new EmbedBuilder()
            .setTitle("✅ 명령어 업데이트 결과")
            .setDescription(`\`\`\`\n${resultText}\n\`\`\``)
            .setColor(0x57F287)
        );
      }

      await interaction.editReply({ embeds });
    });
  }
};
