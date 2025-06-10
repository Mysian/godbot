// 📁 commands/profile/profile-register.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require("discord.js");
const fs = require("fs");
const path = require("path");

const profilePath = path.join(__dirname, "../../data/profile-data.json");

function loadProfileData() {
  if (!fs.existsSync(profilePath)) fs.writeFileSync(profilePath, "{}");
  return JSON.parse(fs.readFileSync(profilePath, "utf8"));
}

function saveProfileData(data) {
  fs.writeFileSync(profilePath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder().setName("프로필등록").setDescription("서버 프로필을 등록합니다."),

  async execute(interaction) {
    const userId = interaction.user.id;
    const profiles = loadProfileData();
    if (profiles[userId]) {
      await interaction.reply({
        content: "이미 프로필이 등록되어 있어. `/프로필수정` 명령어를 사용해봐!",
        ephemeral: true,
      });
      return;
    }

    profiles[userId] = {
      status: "",
      favoriteGames: [],
      overwatch: { tier: "", position: "" },
      lol: { tier: "", position: "" },
      steam: "",
      lolNick: "",
      battlenet: "",
      liked: 0,
    };
    saveProfileData(profiles);

    const embed = new EmbedBuilder()
      .setTitle(`📋 프로필 등록: ${interaction.user.username}`)
      .setDescription("아래 버튼을 통해 항목을 하나씩 등록해봐!")
      .setColor("Blue")
      .setThumbnail(interaction.user.displayAvatarURL());

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("status_msg").setLabel("상태 메시지 등록").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("favorite_games").setLabel("선호 게임 등록").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("ow_tier").setLabel("오버워치 티어 등록").setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lol_tier").setLabel("롤 티어 등록").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("steam_nick").setLabel("스팀 닉네임 등록").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lol_nick").setLabel("롤 닉네임 등록").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("battlenet_nick").setLabel("배틀넷 닉네임 등록").setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2],
      ephemeral: true,
    });
  },
};
