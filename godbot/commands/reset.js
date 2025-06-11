const { SlashCommandBuilder } = require("discord.js");
const { rouletteGames, activeChannels } = require("./game"); // 경로는 너 setup 기준으로

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임초기화")
    .setDescription("현재 채널의 게임 상태를 강제로 초기화합니다."),

  async execute(interaction) {
    const channelId = interaction.channel.id;

    // 러시안룰렛 강제 종료
    if (rouletteGames.has(channelId)) {
      const game = rouletteGames.get(channelId);
      if (game.timeout) clearTimeout(game.timeout);
      rouletteGames.delete(channelId);
    }

    // 전체 게임 중단
    if (activeChannels.has(channelId)) {
      activeChannels.delete(channelId);
      return interaction.reply(
        "🧹 이 채널의 게임 상태를 강제로 초기화했습니다.",
      );
    }

    return interaction.reply({
      content: "✅ 이 채널에서는 현재 진행 중인 게임이 없습니다.",
      ephemeral: true,
    });
  },
};
