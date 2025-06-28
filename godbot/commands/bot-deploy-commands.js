// commands/bot-deploy-commands.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { exec } = require("child_process");

const MAIN_STAFF_ROLE_ID = "786128824365482025";
const LINES_PER_PAGE = 25;

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

    await interaction.reply({
      content: "⏳ 서버에서 node deploy-commands.js를 실행 중입니다...",
      ephemeral: true
    });

    exec("node deploy-commands.js", async (err, stdout, stderr) => {
      let output = err ? (stderr || err.message) : (stdout || "업데이트 완료!");
      // 줄 단위로 자르기
      let lines = output.split(/\r?\n/);
      let totalPages = Math.ceil(lines.length / LINES_PER_PAGE);

      // 페이지 생성 함수
      const getPageEmbed = (page) => {
        let start = (page - 1) * LINES_PER_PAGE;
        let end = start + LINES_PER_PAGE;
        let pageLines = lines.slice(start, end).join("\n") || "출력 없음";
        return new EmbedBuilder()
          .setTitle("✅ 명령어 업데이트 결과")
          .setDescription("```" + pageLines + "```")
          .setFooter({ text: `페이지 ${page} / ${totalPages}` });
      };

      let page = 1;

      // 버튼 생성
      const getRow = (current) => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("prev_page")
            .setLabel("⬅ 이전")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(current === 1),
          new ButtonBuilder()
            .setCustomId("next_page")
            .setLabel("다음 ➡")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(current === totalPages)
        );
      };

      // 첫 임베드 전송
      let sent = await interaction.followUp({
        embeds: [getPageEmbed(page)],
        components: [getRow(page)],
        ephemeral: true
      });

      // 버튼 처리
      const collector = sent.createMessageComponentCollector({ time: 1000 * 60 * 2 }); // 2분 대기

      collector.on("collect", async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: "❌ 본인만 조작 가능합니다.", ephemeral: true });
        }

        if (i.customId === "prev_page" && page > 1) {
          page--;
        }
        if (i.customId === "next_page" && page < totalPages) {
          page++;
        }
        await i.update({
          embeds: [getPageEmbed(page)],
          components: [getRow(page)],
          ephemeral: true
        });
      });

      collector.on("end", async () => {
        try {
          await sent.edit({ components: [] });
        } catch (e) {}
      });
    });
  }
};
