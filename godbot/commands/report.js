// commands/report.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'logchannel.json');

// 신고 사유+익명 복합 옵션
const SELECT_OPTIONS = [
  { label: '욕설 (익명)', value: '욕설|Y' },
  { label: '욕설 (공개)', value: '욕설|N' },
  { label: '비매너 (익명)', value: '비매너|Y' },
  { label: '비매너 (공개)', value: '비매너|N' },
  { label: '탈주 (익명)', value: '탈주|Y' },
  { label: '탈주 (공개)', value: '탈주|N' },
  { label: '불쾌감 조성 (익명)', value: '불쾌감 조성|Y' },
  { label: '불쾌감 조성 (공개)', value: '불쾌감 조성|N' },
  { label: '고의적 트롤 (익명)', value: '고의적 트롤|Y' },
  { label: '고의적 트롤 (공개)', value: '고의적 트롤|N' },
  { label: '해킹 (익명)', value: '해킹|Y' },
  { label: '해킹 (공개)', value: '해킹|N' },
  { label: '기타 (익명)', value: '기타|Y' },
  { label: '기타 (공개)', value: '기타|N' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('신고')
    .setDescription('유저를 신고합니다.'),

  async execute(interaction) {
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('신고_옵션')
        .setPlaceholder('신고 사유와 익명여부를 선택하세요')
        .addOptions(SELECT_OPTIONS)
    );

    await interaction.reply({
      content: '신고할 사유와 익명 여부를 선택하세요.',
      components: [selectRow],
      ephemeral: true,
    });

    // 5분 대기
    const filter = i =>
      i.user.id === interaction.user.id &&
      i.customId === '신고_옵션';

    interaction.channel.awaitMessageComponent({ filter, time: 300_000 })
      .then(async i => {
        const [reason, anon] = i.values[0].split('|');

        // 모달 생성
        const modal = new ModalBuilder()
          .setCustomId('신고_모달')
          .setTitle('🚨 유저 신고');
        const userInput = new TextInputBuilder()
          .setCustomId('신고_대상')
          .setLabel('신고 대상 유저 닉네임 (필수)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('디스코드 닉네임/별명');
        const dateInput = new TextInputBuilder()
          .setCustomId('신고_일시')
          .setLabel('사건 발생 일시 (선택)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('ex: 2024-07-01 15:00 또는 오늘 저녁');
        const detailInput = new TextInputBuilder()
          .setCustomId('신고_내용')
          .setLabel('신고 내용을 작성해주세요. (필수)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('상세히 적어주세요.');
        modal.addComponents(
          new ActionRowBuilder().addComponents(userInput),
          new ActionRowBuilder().addComponents(dateInput),
          new ActionRowBuilder().addComponents(detailInput)
        );
        await i.showModal(modal);

        // 모달 5분 타임아웃 보장
        const modalFilter = m => m.user.id === interaction.user.id && m.customId === '신고_모달';
        i.client.once('interactionCreate', async modalInter => {
          if (!modalFilter(modalInter)) return;
          // 로그채널 체크
          if (!fs.existsSync(configPath)) {
            return modalInter.reply({ content: '❗ 로그 채널이 아직 등록되지 않았습니다. `/로그채널등록` 명령어를 먼저 사용해주세요.', ephemeral: true });
          }
          const config = JSON.parse(fs.readFileSync(configPath));
          const logChannel = await modalInter.guild.channels.fetch(config.channelId);
          if (!logChannel) {
            return modalInter.reply({ content: '❗ 로그 채널을 찾을 수 없습니다.', ephemeral: true });
          }
          // 모달 값 추출
          const targetNick = modalInter.fields.getTextInputValue('신고_대상');
          const eventDate = modalInter.fields.getTextInputValue('신고_일시') || '미입력';
          const reportDetail = modalInter.fields.getTextInputValue('신고_내용');
          const reporter = anon === 'Y'
            ? '익명'
            : `<@${modalInter.user.id}> (${modalInter.user.tag})`;
          const embed = new EmbedBuilder()
            .setTitle('🚨 유저 신고 접수')
            .setColor(0xff3333)
            .addFields(
              { name: '• 신고 사유', value: `\`${reason}\``, inline: true },
              { name: '• 익명 여부', value: anon === 'Y' ? '예 (익명)' : '아니오 (신고자 공개)', inline: true },
              { name: '• 사건 발생 일시', value: eventDate, inline: true },
              { name: '• 신고 대상', value: `\`${targetNick}\``, inline: true },
              { name: '• 신고자', value: reporter, inline: true },
              { name: '\u200B', value: '\u200B', inline: false },
              { name: '• 신고 내용', value: reportDetail, inline: false }
            )
            .setFooter({ text: `신고 접수일시: ${new Date().toLocaleString()}` })
            .setTimestamp();

          await logChannel.send({ embeds: [embed] });

          await modalInter.reply({
            content: `✅ 신고가 정상적으로 접수되었습니다.`,
            ephemeral: true
          });
        });
      })
      .catch(async () => {
        await interaction.editReply({ content: '❗️시간이 초과되어 신고가 취소되었습니다.', components: [], ephemeral: true }).catch(() => {});
      });
  }
};
