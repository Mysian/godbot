const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// 경로를 /commands/ 기준으로 재설정
const profilePath = path.join(__dirname, "../data/profile-data.json");
const cooldownPath = path.join(__dirname, "../data/like-cooldown.json");

// data 폴더 및 파일 자동 생성
function load(pathStr) {
  const dataDir = path.dirname(pathStr);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(pathStr)) fs.writeFileSync(pathStr, "{}");
  return JSON.parse(fs.readFileSync(pathStr, "utf8"));
}

function save(pathStr, data) {
  fs.writeFileSync(pathStr, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("호감도차감")
    .setDescription("특정 유저의 호감도를 -1 차감합니다. (대상별 24시간 쿨타임)")
    .addUserOption(opt =>
      opt.setName("유저").setDescription("호감도를 깎을 유저").setRequired(true)
    ),

  async execute(interaction) {
    const giverId = interaction.user.id;
    const target = interaction.options.getUser("유저");
    const now = Date.now();

    if (giverId === target.id) {
      return interaction.reply({
        content: "❗ 자기 자신에게는 호감도를 깎을 수 없어!",
        ephemeral: true,
      });
    }

    const profiles = load(profilePath);
    const cooldowns = load(cooldownPath);

    if (!profiles[target.id]) {
      return interaction.reply({
        content: "❗ 해당 유저는 `/프로필등록`을 아직 하지 않았어.",
        ephemeral: true,
      });
    }

    if (!cooldowns[giverId]) cooldowns[giverId] = {};

    const lastTime = cooldowns[giverId][target.id] || 0;
    const cooldownDuration = 1000 * 60 * 60 * 24; // 24시간

    if (now - lastTime < cooldownDuration) {
      const remainMs = cooldownDuration - (now - lastTime);
      const remainHr = Math.ceil(remainMs / (1000 * 60 * 60));
      return interaction.reply({
        content: `🕒 아직 쿨타임이야! ${target.username}님에게는 약 ${remainHr}시간 후에 다시 차감할 수 있어.`,
        ephemeral: true,
      });
    }

    profiles[target.id].liked = (profiles[target.id].liked || 0) - 1;
    cooldowns[giverId][target.id] = now;

    save(profilePath, profiles);
    save(cooldownPath, cooldowns);

    await interaction.reply({
      content: `✅ ${target.username}님의 호감도를 -1 차감했어.`,
      ephemeral: true,
    });
  },
};
