const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { battles, battleRequests } = require("./champ-battle"); // 배틀 체크용 추가

const dataPath = path.join(__dirname, "../data/champion-users.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언유기")
    .setDescription("보유한 챔피언을 유기(삭제)합니다."),

  async execute(interaction) {
    const userId = interaction.user.id;
    
    // [추가] 배틀 진행/대기 중이면 유기 금지!
    if (battles.has(userId) || battleRequests.has(userId)) {
      return interaction.reply({
        content: "진행중/대기중인 챔피언 배틀이 있어 챔피언을 유기할 수 없습니다!",
        ephemeral: true
      });
    }

    const data = loadData();
    const champ = data[userId];

    if (!champ || !champ.name) {
      return interaction.reply({
        content: `⚠️ 보유한 챔피언이 없습니다.`,
        ephemeral: true
      });
    }

    const champName = champ.name;
    const champLevel = champ.level ?? 0;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("champion-dispose-confirm")
        .setLabel("✅ 예")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("champion-dispose-cancel")
        .setLabel("❌ 아니오")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: `정말 **${champName} (${champLevel}강)** 챔피언을 파기하시겠습니까?`,
      components: [row],
      ephemeral: true
    });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === userId && ["champion-dispose-confirm", "champion-dispose-cancel"].includes(i.customId),
      time: 15000,
      max: 1
    });

    collector.on("collect", async i => {
      if (i.customId === "champion-dispose-cancel") {
        await i.update({
          content: `❎ 파기를 취소하였습니다.`,
          components: [],
          ephemeral: true
        });
        return;
      }

      delete data[userId];
      saveData(data);

      await i.update({
        content: `🗑️ **${champName} (${champLevel}강)** 챔피언이 파기되었습니다.`,
        components: [],
        ephemeral: true
      });
    });
  }
};
