// 📁 commands/game.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");

const activeChannels = new Set();
const rouletteGames = new Map();

function logRouletteResult(data) {
  const path = "./roulette_log.json";
  const logs = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : [];
  logs.push(data);
  fs.writeFileSync(path, JSON.stringify(logs, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임")
    .setDescription("게임을 선택해서 시작해보자!")
    .addStringOption((option) =>
      option
        .setName("종류")
        .setDescription("플레이할 게임 종류를 선택하세요.")
        .setRequired(true)
        .addChoices(
          { name: "반응속도 배틀", value: "reaction" },
          { name: "제비뽑기", value: "lottery" },
          { name: "러시안룰렛", value: "roulette" },
        ),
    ),

  async execute(interaction) {
    const gameType = interaction.options.getString("종류");
    const channel = interaction.channel;
    const channelId = channel.id;

    if (activeChannels.has(channelId)) {
      return interaction.reply({
        content: "⚠️ 이 채널에서 이미 게임이 진행 중입니다.",
        ephemeral: true,
      });
    }

    activeChannels.add(channelId);

    // ✅ 반응속도 배틀
    if (gameType === "reaction") {
      const targetChars = ["q", "w", "e", "r"];
      const selected =
        targetChars[Math.floor(Math.random() * targetChars.length)];

      await interaction.reply(
        "🕹️ 반응속도 게임이 시작됩니다! 5초 후 q, w, e, r 중 하나가 등장합니다. (한/영키 미리 눌러두세요!)",
      );

      setTimeout(async () => {
        const sent = await interaction.followUp(
          `‼️ **"${selected}"** 를 입력하세요!`,
        );
        const startTime = Date.now();
        const collected = [];

        const filter = (m) =>
          m.channel.id === channelId &&
          m.content.trim().toLowerCase() === selected &&
          !m.author.bot;

        const collector = channel.createMessageCollector({
          filter,
          time: 3000,
        });

        collector.on("collect", (m) => {
          const reactionTime = Date.now() - startTime;
          collected.push({ user: m.author, time: reactionTime });
        });

        collector.on("end", () => {
          activeChannels.delete(channelId);
          if (collected.length === 0) {
            interaction.followUp("😴 아무도 반응하지 않았어요!");
            return;
          }

          collected.sort((a, b) => a.time - b.time);
          const medals = ["🥇", "🥈", "🥉"];
          const results = collected
            .slice(0, 3)
            .map(
              (entry, idx) =>
                `${medals[idx] || ""} **${entry.user.username}** - ${entry.time}ms`,
            );

          interaction.followUp(`🏁 **반응속도 결과**\n${results.join("\n")}`);
        });
      }, 5000);
    }

    // ✅ 제비뽑기
    else if (gameType === "lottery") {
      const participants = new Set();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("join_lottery")
          .setLabel("참가하기")
          .setStyle(ButtonStyle.Success),
      );

      await interaction.reply({
        content: "🎲 제비뽑기 참가자를 모집합니다! (10초)",
        components: [row],
      });

      const collector = interaction.channel.createMessageComponentCollector({
        time: 10000,
      });

      collector.on("collect", (btn) => {
        if (btn.customId === "join_lottery") {
          participants.add(btn.user);
          btn.reply({ content: "✅ 참가 완료!", ephemeral: true });
        }
      });

      collector.on("end", () => {
        activeChannels.delete(channelId);

        if (participants.size === 0) {
          interaction.followUp("🙈 아무도 참가하지 않았어요.");
          return;
        }

        const winner = [...participants][
          Math.floor(Math.random() * participants.size)
        ];
        interaction.followUp(`🎉 당첨자는... **${winner.username}** 님입니다!`);
      });
    }

    // ✅ 러시안룰렛 - 준비단계
    else if (gameType === "roulette") {
      const participants = [];
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("join_roulette")
          .setLabel("참가하기")
          .setStyle(ButtonStyle.Danger),
      );

      await interaction.reply({
        content: "🔫 러시안룰렛 참가자를 모집합니다! (20초)",
        components: [row],
      });

      const collector = interaction.channel.createMessageComponentCollector({
        time: 20000,
      });

      collector.on("collect", (btn) => {
        if (btn.customId === "join_roulette") {
          if (!participants.find((u) => u.id === btn.user.id)) {
            participants.push(btn.user);
            btn.reply({ content: "💀 참가 완료!", ephemeral: true });
          } else {
            btn.reply({ content: "이미 참가했어요!", ephemeral: true });
          }
        }
      });

      collector.on("end", () => {
        activeChannels.delete(channelId);

        if (participants.length === 0) {
          interaction.followUp(
            "❌ 아무도 참가하지 않아 게임을 시작할 수 없어요.",
          );
          return;
        }

        const game = {
          participants,
          currentTurn: 0,
          isLoaded: false,
          inProgress: true,
          timeout: null,
        };

        rouletteGames.set(channelId, game);
        activeChannels.add(channelId);

        const names = participants.map((u) => `• ${u.username}`).join("\n");
        interaction.followUp(
          `☠️ 까리한 디스코드에 피바람이 분다...\n**${participants.length}명 참가자**\n${names}`,
        );

        const next = game.participants[game.currentTurn];
        interaction.followUp(
          `🎯 첫 타자는 <@${next.id}>님입니다. !장전을 입력해주세요.`,
        );
      });
    }
  },

  rouletteGames,
  activeChannels,
  logRouletteResult,
};
