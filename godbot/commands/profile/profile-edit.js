const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const profilePath = path.join(__dirname, '../../data/profile-data.json');

function loadProfiles() {
  if (!fs.existsSync(profilePath)) fs.writeFileSync(profilePath, '{}');
  return JSON.parse(fs.readFileSync(profilePath));
}

function saveProfiles(data) {
  fs.writeFileSync(profilePath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('프로필수정')
    .setDescription('등록된 프로필 중 수정할 항목을 선택합니다.'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const profiles = loadProfiles();

    if (!profiles[userId]) {
      return interaction.reply({ content: '⚠️ 먼저 `/프로필등록` 명령어로 프로필을 등록해 주세요.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🛠️ 프로필 수정')
      .setDescription('수정할 항목을 선택해 주세요.')
      .setColor('Orange');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('edit_status').setLabel('상태 메시지').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('edit_games').setLabel('선호 게임').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('edit_owtier').setLabel('오버워치 티어/포지션').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('edit_loltier').setLabel('롤 티어/포지션').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('edit_nicks').setLabel('닉네임들 수정').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }
};
