const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/warnings.json");

const LOG_CHANNEL_ID = "1380874052855529605"; // 관리진 공유 채널ID

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

    const userId = target.id;

    const removed = warnings[userId].pop();
    saveWarnings(warnings);

    // 타임아웃 해제
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (member && member.isCommunicationDisabled()) {
      try {
        await member.timeout(null, "경고 취소에 따른 타임아웃 해제");
      } catch (e) {}
    }

    // 만약 차단(ban) 상태라면 해제
    const bans = await interaction.guild.bans.fetch();
    const banned = bans.get(userId);
    if (banned) {
      try {
        await interaction.guild.bans.remove(userId, "경고 취소에 따른 차단 해제");
      } catch (e) {}
    }

    // === 경고취소 DM ===
    try {
      const user = await interaction.client.users.fetch(userId);
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔄 경고 취소 안내")
            .setDescription(
              "서버에서 부여된 가장 최근 경고가 취소(철회)되었습니다.\n\n" +
              `🚫 **취소된 경고:** [${removed.code}] ${removed.detail}\n` +
              "⏳ 만약 차단/타임아웃이 적용되어 있었다면 모두 해제되었습니다."
            )
            .setColor("Green")
        ]
      });
    } catch (e) {}

    // === 관리 채널 로그 Embed 전송 ===
    try {
      const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("🔄 경고 취소 처리 로그")
              .setDescription(`<@${userId}> (${userId})의 가장 최근 경고 1건이 취소됨`)
              .addFields(
                { name: "취소된 사유", value: `[${removed.code}] ${removed.detail}` },
                { name: "부여일", value: `<t:${Math.floor(new Date(removed.date).getTime() / 1000)}:f>` },
                { name: "처리자", value: `<@${removed.mod}>` },
                { name: "처리 일시", value: `<t:${Math.floor(Date.now() / 1000)}:f>` }
              )
              .setColor("Green")
          ]
        });
      }
    } catch (e) {}

    // 관리자 안내
    const embed = new EmbedBuilder()
      .setTitle("🔄 경고 취소 처리됨")
      .setDescription(`<@${userId}> 유저의 가장 최근 경고 1건이 취소되었습니다.`)
      .addFields(
        { name: "🚫 취소된 경고 사유", value: `[${removed.code}] ${removed.detail}` },
        { name: "📅 부여일", value: `<t:${Math.floor(new Date(removed.date).getTime() / 1000)}:f>` },
        { name: "📎 담당자", value: `<@${removed.mod}>` }
      )
      .setColor("Green");

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
