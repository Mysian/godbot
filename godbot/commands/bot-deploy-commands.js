// commands/bot-deploy-commands.js
const { SlashCommandBuilder, EmbedBuilder, ApplicationCommandType } = require("discord.js");
const { exec } = require("child_process");
const path = require("path");

const MAIN_STAFF_ROLE_ID = "786128824365482025";
const MAX_COMMANDS = 100;
const DESCRIPTION_LIMIT = 4000;

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
      console.log("===== 봇명령어업데이트 실행 결과 =====");
      console.log("err:", err);
      console.log("stdout:", stdout);
      console.log("stderr:", stderr);

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
      } catch {
        totalSlash = 0;
      }

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
  }
};
