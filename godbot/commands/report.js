// commands/report.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'logchannel.json');

const REASONS = [
  { label: '욕설', value: '욕설' },
  { label: '비매너', value: '비매너' },
  { label: '탈주', value: '탈주' },
  { label: '불쾌감 조성', value: '불쾌감 조성' },
  { label: '고의적 트롤', value: '고의적 트롤' },
  { label: '해킹', value: '해킹' },
  { label: '기타', value: '기타' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('신고')
    .setDescription('유저를 신고합니다.'),

  async execute(interaction) {
    // 1. 드롭다운(신고 사유), 익명 여부(예/아니오) select
    const reasonRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('신고_사유')
        .setPlaceholder('신고 사유를 선택하세요')
        .addOptions(REASONS.map(r => ({ label: r.label, value: r.value })))
    );
    const anonRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('신고_익명')
        .setPlaceholder('익명 여부를 선택하세요')
        .addOptions([
          { label: '예(익명)', value: 'Y' },
          { label: '아니오(신고자 공개)', value: 'N' }
        ])
    );

    await interaction.reply({
      content: '신고할 사유와 익명 여부를 선택하세요.',
      components: [reasonRow, anonRow],
      ephemeral: true,
    });

    // 2. 사유, 익명 선택 받고 모달로 상세 입력받기
    const filter = i =>
      i.user.id === interaction.user.id &&
      (i.customId === '신고_사유' || i.customId === '신고_익명');

    let selectedReason = null;
    let selectedAnon = null;

    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 300_000 }); // 5분

    let modalShown = false;

    collector.on('collect', async i => {
      if (i.customId === '신고_사유') {
        selectedReason = i.values[0];
        await i.deferUpdate();
      }
      if (i.customId === '신고_익명') {
        selectedAnon = i.values[0];
        await i.deferUpdate();
      }
      // 둘 다 선택했으면 모달 오픈
      if (selectedReason && selectedAnon && !modalShown) {
        modalShown = true;
        collector.stop();
        // 모달 생성
        const modal = new ModalBuilder()
          .setCustomId('신고_모달')
          .setTitle('🚨 유저 신고');
        // 신고 대상 유저 닉네임
        const userInput = new TextInputBuilder()
          .setCustomId('신고_대상')
          .setLabel('신고 대상 유저 닉네임 (필수)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('디스코드 닉네임/별명');
        // 발생 일시(선택)
        const dateInput = new TextInputBuilder()
          .setCustomId('신고_일시')
          .setLabel('사건 발생 일시 (선택)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('ex: 2024-07-01 15:00 또는 오늘 저녁');
        // 신고 내용(필수)
        const detailInput = new TextInputBuilder()
          .setCustomId('신고_내용')
          .setLabel('신고 내용을 작성해주세요. (필수)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('상세히 적어주세요.');
        // 모달 빌드
        modal.addComponents(
          new ActionRowBuilder().addComponents(userInput),
          new ActionRowBuilder().addComponents(dateInput),
          new ActionRowBuilder().addComponents(detailInput)
        );
        await interaction.editReply({ content: '입력창이 열렸습니다. 신고 내용을 작성해주세요.', components: [], ephemeral: true });
        await interaction.showModal(modal);
      }
    });

    collector.on('end', async (_, reason) => {
      if (!modalShown && reason === 'time') {
        await interaction.editReply({ content: '❗️시간이 초과되어 신고가 취소되었습니다.', components: [], ephemeral: true }).catch(() => {});
      }
    });

    // 모달 입력받는 리스너도 5분 타임 제한
    const modalTimeout = setTimeout(() => {
      interaction.editReply({ content: '❗️시간이 초과되어 신고가 취소되었습니다.', components: [], ephemeral: true }).catch(() => {});
    }, 300_000);

    interaction.client.once('interactionCreate', async modalInter => {
      if (modalInter.type !== InteractionType.ModalSubmit) return;
      if (modalInter.customId !== '신고_모달') return;
      clearTimeout(modalTimeout);
      // 채널 체크
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

      // 신고자 정보
      const reporter = selectedAnon === 'Y'
        ? '익명'
        : `<@${modalInter.user.id}> (${modalInter.user.tag})`;

      // 예쁜 임베드
      const embed = new EmbedBuilder()
        .setTitle('🚨 유저 신고 접수')
        .setColor(0xff3333)
        .addFields(
          { name: '• 신고 사유', value: `\`${selectedReason}\``, inline: true },
          { name: '• 익명 여부', value: selectedAnon === 'Y' ? '예 (익명)' : '아니오 (신고자 공개)', inline: true },
          { name: '• 사건 발생 일시', value: eventDate, inline: true },
          { name: '• 신고 대상', value: `\`${targetNick}\``, inline: true },
          { name: '• 신고자', value: reporter, inline: true },
          { name: '\u200B', value: '\u200B', inline: false }, // 구분용 빈줄
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
  }
};
