const { SlashCommandBuilder } = require("discord.js");
const Parser = require("rss-parser");
const parser = new Parser();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임뉴스")
    .setDescription("최신 게임 관련 뉴스 TOP 3개를 보여줘요."),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true }); // 👈 여기도 에페메랄

    try {
      const rssUrl =
        "https://news.google.com/rss/search?q=%EA%B2%8C%EC%9E%84&hl=ko&gl=KR&ceid=KR:ko";
      const feed = await parser.parseURL(rssUrl);

      const top3 = feed.items.slice(0, 3);
      const newsList = top3
        .map((item, idx) => {
          const title =
            item.title.length > 100
              ? item.title.slice(0, 100) + "..."
              : item.title;
          return `**${idx + 1}. [${title}](<${item.link}>)**`;
        })
        .join("\n\n");

      const safeContent = newsList.slice(0, 1990);
      await interaction.editReply({
        content: `📰 **최신 게임 뉴스 TOP 3 (한국 기준)**\n\n${safeContent}`,
        ephemeral: true, // 👈 여기까지 적용!
      });
    } catch (error) {
      console.error("❌ 게임뉴스 불러오기 실패:", error.message);
      await interaction.editReply({
        content: "❌ 뉴스 가져오는 데 실패했어요. 나중에 다시 시도해줘!",
        ephemeral: true,
      });
    }
  },
};
