// commands/complaint.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'logchannel.json');

// 민원 사유 옵션
const REASONS = [
  { label: '문의', value: '문의' },
  { label: '건의', value: '건의' },
  { label: '제보', value: '제보' },
  { label: '불편사항', value: '불편사항' },
  { label: '기타', value: '기타' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('민원')
    .setDescription('운영진에게 민원을 보냅니다.'),

  async execute(interaction) {
    // 1. 민원 사유 드롭다운
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('민원_사유')
        .setPlaceholder('민원 사유를 선택하세요')
        .addOptions(REASONS)
    );

    await interaction.reply({
      content: '민원의 종류를 선택하세요.',
      components: [selectRow],
      ephemeral: true,
    });

    // 5분 대기
    const filter = i =>
      i.user.id === interaction.user.id &&
      i.customId === '민원_사유';

    interaction.channel.awaitMessageComponent({ filter, time: 300_000 })
      .then(async i => {
        const selectedReason = i.values[0];

        // 모달 생성
        const modal = new ModalBuilder()
          .setCustomId('민원_모달')
          .setTitle('📮 민원 접수');
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
          new ActionRowBuilder().addComponents(dateInput),
          new ActionRowBuilder().addComponents(detailInput)
        );
        await i.showModal(modal);

        // 모달 5분 타임아웃
        const modalFilter = m => m.user.id === interaction.user.id && m.customId === '민원_모달';
        i.client.once('interactionCreate', async modalInter => {
          if (!modalFilter(modalInter)) return;
          if (!fs.existsSync(configPath)) {
            return modalInter.reply({ content: '❗ 로그 채널이 아직 등록되지 않았습니다. `/로그채널등록` 명령어를 먼저 사용해주세요.', ephemeral: true });
          }
          const config = JSON.parse(fs.readFileSync(configPath));
          const logChannel = await modalInter.guild.channels.fetch(config.channelId);
          if (!logChannel) {
            return modalInter.reply({ content: '❗ 로그 채널을 찾을 수 없습니다.', ephemeral: true });
          }
          const eventDate = modalInter.fields.getTextInputValue('민원_일시') || '미입력';
          const complaintDetail = modalInter.fields.getTextInputValue('민원_내용');
          const embed = new EmbedBuilder()
            .setTitle('📮 민원 접수')
            .setColor(0x3ba1ff)
            .addFields(
              { name: '• 민원 종류', value: `\`${selectedReason}\``, inline: true },
              { name: '• 관련 일시', value: eventDate, inline: true },
              { name: '• 작성자', value: `<@${modalInter.user.id}> (${modalInter.user.tag})`, inline: true },
              { name: '\u200B', value: '\u200B', inline: false },
              { name: '• 민원 내용', value: complaintDetail, inline: false }
            )
            .setFooter({ text: `접수일시: ${new Date().toLocaleString()}` })
            .setTimestamp();

          await logChannel.send({ embeds: [embed] });

          await modalInter.reply({
            content: `✅ 민원이 정상적으로 접수되었습니다.`,
            ephemeral: true
          });
        });
      })
      .catch(async () => {
        await interaction.editReply({ content: '❗️시간이 초과되어 민원이 취소되었습니다.', components: [], ephemeral: true }).catch(() => {});
      });
  }
};
