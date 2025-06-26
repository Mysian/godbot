const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/warnings.json");

function loadWarnings() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

// ★ label에서 사유설명만 추출하는 함수
function extractReasonDesc(desc) {
  if (!desc) return "";
  // 콜론, 점 등으로 분리해서 제일 마지막 설명만
  const parts = desc.split(". ");
  return parts.length > 1 ? parts[parts.length - 1].trim() : desc.trim();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("경고확인")
    .setDescription("자신이 받은 경고 내용을 확인합니다."),

  async execute(interaction) {
    const warnings = loadWarnings();
    const userWarnings = warnings[interaction.user.id];

    if (!userWarnings || userWarnings.length === 0) {
      await interaction.reply({
        content: "✅ 당신은 현재 받은 경고가 없습니다.",
        ephemeral: true
      });
      return;
    }

    // 경고마다 담당자 닉네임 fetch (비동기 병렬)
    const adminIds = [...new Set(userWarnings.map(w => w.mod))];
    const adminMap = {};
    await Promise.all(adminIds.map(async id => {
      try {
        const user = await interaction.client.users.fetch(id);
        adminMap[id] = user.username;
      } catch {
        adminMap[id] = `알 수 없음 (${id})`;
      }
    }));

    const embed = new EmbedBuilder()
      .setTitle("🚨 나의 경고 목록")
      .setColor("Red")
      .setDescription(`총 ${userWarnings.length}회의 경고 기록이 있습니다.`)
      .addFields(
        ...userWarnings.map((w, i) => ({
          name: `${i + 1}. [${w.code}${w.desc ? `: ${extractReasonDesc(w.desc)}` : ""}]`,
          value:
            `• 사유: ${w.detail}\n` +
            `• 일시: <t:${Math.floor(new Date(w.date).getTime() / 1000)}:f>`
        }))
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
