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
      // 콘솔에 모든 결과 남김(디버깅용)
      console.log('===== 봇명령어업데이트 실행 결과 =====');
      console.log('err:', err);
      console.log('stdout:', stdout);
      console.log('stderr:', stderr);

      // 결과 취합
      let resultText = '';
      if (err) {
        resultText += `❌ [Error]\n${err.message || ''}\n`;
      }
      if (stderr) {
        resultText += `❗ [stderr]\n${stderr}\n`;
      }
      if (stdout) {
        resultText += `✅ [stdout]\n${stdout}\n`;
      }
      if (!resultText.trim()) {
        resultText = "업데이트 완료!";
      }

      // 2,000자 넘으면 페이지 분할 (임베드 제한 고려)
      const embeds = [];
      for (let i = 0; i < resultText.length; i += EMBED_CHAR_LIMIT) {
        embeds.push(
          new EmbedBuilder()
            .setTitle(`봇 명령어 업데이트 결과${embeds.length ? ` (${embeds.length + 1})` : ""}`)
            .setDescription("```" + resultText.slice(i, i + EMBED_CHAR_LIMIT) + "```")
            .setColor(err ? 0xED4245 : 0x57F287)
        );
      }

      await interaction.editReply({ embeds }).catch(() => {});
    });
  }
};
