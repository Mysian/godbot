const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/warnings.json");

function loadWarnings() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function saveWarnings(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("경고취소")
    .setDescription("특정 유저에게 부여된 최근 경고를 철회합니다.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(opt =>
      opt.setName("유저").setDescription("경고를 취소할 유저").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저");
    const warnings = loadWarnings();

    if (!warnings[target.id] || warnings[target.id].length === 0) {
      return interaction.reply({
        content: `❌ <@${target.id}> 유저는 현재 경고 기록이 없습니다.`,
        ephemeral: true
      });
    }

    const removed = warnings[target.id].pop();
    saveWarnings(warnings);

    // 타임아웃 해제 로직
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member && member.isCommunicationDisabled()) {
      try {
        await member.timeout(null, "경고 취소에 따른 타임아웃 해제");
      } catch (e) {}
    }

    const embed = new EmbedBuilder()
      .setTitle("🔄 경고 취소 처리됨")
      .setDescription(`<@${target.id}> 유저의 가장 최근 경고 1건이 취소되었습니다.`)
      .addFields(
        { name: "🚫 취소된 경고 사유", value: `[${removed.code}] ${removed.detail}` },
        { name: "📅 부여일", value: `<t:${Math.floor(new Date(removed.date).getTime() / 1000)}:f>` },
        { name: "📎 담당자", value: `<@${removed.mod}>` }
      )
      .setColor("Green");

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

