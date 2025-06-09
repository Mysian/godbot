const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const championList = require("../utils/champion-data");

const dataPath = path.join(__dirname, "../data/champion-users.json");
const recordPath = path.join(__dirname, "../data/champion-records.json");

function loadJSON(path) {
  if (!fs.existsSync(path)) fs.writeFileSync(path, "{}");
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언조회")
    .setDescription("해당 유저가 보유한 챔피언을 확인합니다.")
    .addUserOption(option =>
      option.setName("유저").setDescription("확인할 유저를 선택하세요").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저");
    const userId = target.id;

    const userData = loadJSON(dataPath);
    const recordData = loadJSON(recordPath);

    const champInfo = userData[userId];
    const recordInfo = recordData[userId] || { name: champInfo?.name || "?", win: 0, draw: 0, lose: 0 };

    if (!champInfo || !champInfo.name) {
      return interaction.reply({
        content: `❌ <@${userId}>님은 아직 챔피언을 보유하고 있지 않습니다.`,
        ephemeral: true
      });
    }

    const champData = championList.find(c => c.name === champInfo.name);
    if (!champData) {
      return interaction.reply({
        content: `⚠️ 챔피언 데이터에서 '${champInfo.name}' 정보를 찾을 수 없습니다.`,
        ephemeral: true
      });
    }

    const level = champInfo.level ?? 0;
    const success = champInfo.success ?? 0;

    const base = champData.stats;
    const total = {
      attack: base.attack + level,
      ap: base.ap + level,
      hp: base.hp + level * 10,
      defense: base.defense + level,
      penetration: base.penetration + Math.floor(level / 2)
    };

    // 📄 페이지 1: 챔피언 정보
    const infoEmbed = new EmbedBuilder()
      .setTitle(`🧙‍♂️ ${target.username}님의 챔피언`)
      .setDescription(
        `• 이름: **${champData.name}**\n` +
        `• 타입: ${champData.type}\n` +
        `• 강화 레벨: ${level}강\n` +
        `• 강화 성공: ✅ ${success}회\n\n` +
        `📊 능력치 (강화 반영)\n` +
        `> 🗡️ 공격력: **${total.attack}**\n` +
        `> 🔮 주문력: **${total.ap}**\n` +
        `> ❤️ 체력: **${total.hp}**\n` +
        `> 🛡️ 방어력: **${total.defense}**\n` +
        `> 🦾 관통력: **${total.penetration}**`
      )
      .setColor(0x3498db)
      .setTimestamp();

    // 📄 페이지 2: 전적 정보
    const recordEmbed = new EmbedBuilder()
      .setTitle(`📜 ${target.username}님의 챔피언 전적`)
      .setDescription(
        `• 사용 챔피언: **${recordInfo.name}**\n\n` +
        `🥇 승리: **${recordInfo.win}**회\n` +
        `🤝 무승부: **${recordInfo.draw}**회\n` +
        `🩸 패배: **${recordInfo.lose}**회`
      )
      .setColor(0x2ecc71)
      .setTimestamp();

    // ▶️ 버튼 구성
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("page1")
        .setLabel("챔피언 정보")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("page2")
        .setLabel("전적 정보")
        .setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.reply({
      embeds: [infoEmbed],
      components: [row],
      ephemeral: true
    });

    const collector = message.createMessageComponentCollector({
      time: 60_000
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: "❌ 이 버튼은 당신이 사용할 수 없습니다.", ephemeral: true });
      }

      if (i.customId === "page1") {
        await i.update({ embeds: [infoEmbed] });
      } else if (i.customId === "page2") {
        await i.update({ embeds: [recordEmbed] });
      }
    });

    collector.on("end", async () => {
      try {
        await message.edit({ components: [] });
      } catch (e) {
        // ignore
      }
    });
  }
};
