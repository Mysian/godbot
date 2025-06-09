const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const championList = require("../utils/champion-data");

const dataPath = path.join(__dirname, "../data/champion-users.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function getSuccessRate(level) {
  if (level < 10) return 0.9;
  if (level < 30) return 0.8;
  if (level < 50) return 0.7;
  if (level < 100) return 0.6;
  if (level < 200) return 0.4;
  if (level < 500) return 0.3;
  if (level < 900) return 0.2;
  return 0.1;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언강화")
    .setDescription("보유한 챔피언을 강화합니다 (최대 999강)"),

  async execute(interaction) {
    const userId = interaction.user.id;
    const userMention = `<@${userId}>`;
    const data = loadData();

    const champ = data[userId];
    if (!champ || !champ.name) {
      return interaction.reply({
        content: `❌ 먼저 /챔피언획득 으로 챔피언을 얻어야 합니다.`,
        ephemeral: true
      });
    }

    champ.level = champ.level ?? 0;
    champ.success = champ.success ?? 0;

    if (champ.level >= 999) {
      return interaction.reply({
        content: `⚠️ 이미 최대 강화 상태입니다! (**${champ.level}강**)`
      });
    }

    const startUpgrade = async () => {
      const rate = getSuccessRate(champ.level);
      const percent = Math.floor(rate * 1000) / 10;

      const embed = new EmbedBuilder()
        .setTitle(`🔧 챔피언 강화 준비`)
        .setDescription(`**${champ.name} ${champ.level}강** → **${champ.level + 1}강**
📈 강화 확률: **${percent}%**

📊 성공 시 능력치 상승:
- 공격력 +1
- 주문력 +1
- 체력 +10
- 방어력 +1
- 관통력 +1 (2레벨마다)`)
        .setColor(0x00bcd4);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("champion-upgrade-confirm")
          .setLabel("🔥 강화 시도")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("champion-upgrade-cancel")
          .setLabel("🛑 강화 중단")
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });

      const collector = interaction.channel.createMessageComponentCollector({
        filter: i =>
          i.user.id === userId &&
          ["champion-upgrade-confirm", "champion-upgrade-cancel"].includes(i.customId),
        time: 15000,
        max: 1
      });

      collector.on("collect", async i => {
        if (i.customId === "champion-upgrade-cancel") {
          await i.update({
            content: "⚪ 강화가 취소되었습니다.",
            embeds: [],
            components: [],
            ephemeral: true
          });
          return;
        }

        await i.update({
          content: `⏳ 강화 시도 중...`,
          embeds: [],
          components: [],
          ephemeral: true
        });

        setTimeout(async () => {
          const success = Math.random() < rate;

          if (success) {
            champ.level += 1;
            champ.success += 1;

            const base = championList.find(c => c.name === champ.name)?.stats;
            if (base) {
              champ.stats = champ.stats || { ...base };
              champ.stats.attack += 1;
              champ.stats.ap += 1;
              champ.stats.hp += 10;
              champ.stats.defense += 1;
              if (champ.level % 2 === 0) champ.stats.penetration += 1;
            }

            saveData(data);

            const nextRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("continue-upgrade")
                .setLabel("계속 강화 가보자고~~!")
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId("stop-upgrade")
                .setLabel("일단 중단한다.")
                .setStyle(ButtonStyle.Secondary)
            );

            await interaction.editReply({
              content: `🎉 ${champ.name} 챔피언 ${champ.level}강에 성공했습니다!`,
              embeds: [],
              components: [nextRow],
              ephemeral: true
            });

            const nextCollector = interaction.channel.createMessageComponentCollector({
              filter: i => i.user.id === userId && ["continue-upgrade", "stop-upgrade"].includes(i.customId),
              time: 15000,
              max: 1
            });

            nextCollector.on("collect", async i => {
              if (i.customId === "stop-upgrade") {
                await i.update({
                  content: "🛑 강화 세션이 종료되었습니다.",
                  components: [],
                  ephemeral: true
                });
              } else {
                await i.deferUpdate();
                startUpgrade();
              }
            });

          } else {
            const survive = Math.random() < 0.3;
            if (survive) {
              interaction.followUp({
                content: `😮 ${userMention} 님이 **${champ.name} ${champ.level}강**에 실패했지만, 불굴의 의지로 챔피언이 견뎌냅니다!`
              });
            } else {
              const lostName = champ.name;
              delete data[userId];
              saveData(data);
              interaction.followUp({
                content: `💥 ${userMention} 님이 **${lostName} ${champ.level}강**에 실패하여 챔피언이 소멸되었습니다...`
              });
            }
          }
        }, 2000);
      });
    };

    await interaction.reply({ content: "⏳ 강화 준비 중...", ephemeral: true });
    startUpgrade();
  }
};
