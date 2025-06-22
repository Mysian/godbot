// commands/complaint.js
const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'logchannel.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('민원')
    .setDescription('운영진에게 민원을 보냅니다.'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('민원_모달')
      .setTitle('📮 민원 접수');

    const reasonInput = new TextInputBuilder()
      .setCustomId('민원_종류')
      .setLabel('민원 종류 (필수)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('문의, 건의, 제보, 불편사항 등 (자유롭게 작성)');

    const dateInput = new TextInputBuilder()
      .setCustomId('민원_일시')
      .setLabel('관련 일시/시간 (선택)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('ex: 2024-07-01 15:00 또는 어제 저녁');

    const detailInput = new TextInputBuilder()
      .setCustomId('민원_내용')
      .setLabel('민원 내용을 작성해주세요. (필수)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder('상세히 적어주세요.');

    modal.addComponents(
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(dateInput),
      new ActionRowBuilder().addComponents(detailInput)
    );

    await interaction.showModal(modal);
  },

  // 모달 제출 처리
  modal: async function(interaction) {
    if (!fs.existsSync(configPath)) {
      return interaction.reply({ content: '❗ 로그 채널이 아직 등록되지 않았습니다. `/로그채널등록` 명령어를 먼저 사용해주세요.', ephemeral: true });
    }
    const config = JSON.parse(fs.readFileSync(configPath));
    const logChannel = await interaction.guild.channels.fetch(config.channelId);
    if (!logChannel) {
      return interaction.reply({ content: '❗ 로그 채널을 찾을 수 없습니다.', ephemeral: true });
    }
    const selectedReason = interaction.fields.getTextInputValue('민원_종류').trim();
    const eventDate = interaction.fields.getTextInputValue('민원_일시') || '미입력';
    const complaintDetail = interaction.fields.getTextInputValue('민원_내용');

    const embed = new EmbedBuilder()
      .setTitle('📮 민원 접수')
      .setColor(0x3ba1ff)
      .addFields(
        { name: '• 민원 종류', value: `${selectedReason}`, inline: true },
        { name: '• 관련 일시', value: eventDate, inline: true },
        { name: '• 작성자', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: '\u200B', value: '\u200B', inline: false },
        { name: '• 민원 내용', value: complaintDetail, inline: false }
      )
      .setFooter({ text: `접수일시: ${new Date().toLocaleString()}` })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });

    await interaction.reply({
      content: `✅ 민원이 정상적으로 접수되었습니다.`,
      ephemeral: true
    });
  }
};
