// commands/report.js
const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const relationship = require('../utils/relationship.js'); // 👑 관계도 시스템 연동

const configPath = path.join(__dirname, '..', 'logchannel.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('신고')
    .setDescription('유저를 신고합니다.'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('신고_모달')
      .setTitle('🚨 유저 신고');

    const reasonInput = new TextInputBuilder()
      .setCustomId('신고_사유')
      .setLabel('신고 사유 (필수)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('예: 욕설, 비매너, 트롤 등 (자유롭게 작성 가능)');

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

    const anonInput = new TextInputBuilder()
      .setCustomId('신고_익명')
      .setLabel('익명으로 보내시겠습니까? (예/공란=아니오)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('예/아니오');

    modal.addComponents(
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(userInput),
      new ActionRowBuilder().addComponents(dateInput),
      new ActionRowBuilder().addComponents(detailInput),
      new ActionRowBuilder().addComponents(anonInput)
    );

    await interaction.showModal(modal);

    try {
      const modalInter = await interaction.awaitModalSubmit({
        filter: i => i.user.id === interaction.user.id && i.customId === '신고_모달',
        time: 300_000 // 5분
      });

      if (!fs.existsSync(configPath)) {
        return modalInter.reply({ content: '❗ 로그 채널이 아직 등록되지 않았습니다. /로그채널등록 명령어를 먼저 사용해주세요.', ephemeral: true });
      }
      const config = JSON.parse(fs.readFileSync(configPath));
      const logChannel = await modalInter.guild.channels.fetch(config.channelId);
      if (!logChannel) {
        return modalInter.reply({ content: '❗ 로그 채널을 찾을 수 없습니다.', ephemeral: true });
      }

      const selectedReason = modalInter.fields.getTextInputValue('신고_사유').trim();

      const targetNick = modalInter.fields.getTextInputValue('신고_대상').trim();
      const eventDate = modalInter.fields.getTextInputValue('신고_일시') || '미입력';
      const reportDetail = modalInter.fields.getTextInputValue('신고_내용');
      const anonRaw = (modalInter.fields.getTextInputValue('신고_익명') || '').trim();
      const isAnon = anonRaw === '예';

      // 👑 신고 대상 서버 내 실존 유저만 가능!
      const members = await modalInter.guild.members.fetch();
      const matches = members.filter(m => !m.user.bot && (m.displayName === targetNick || m.user.username === targetNick));
      if (matches.size === 0) {
        return modalInter.reply({ content: '❗️해당 닉네임/별명의 유저를 찾을 수 없습니다. (정확히 입력해 주세요)', ephemeral: true });
      }
      if (matches.size > 1) {
        return modalInter.reply({ content: '❗️여러 유저가 일치합니다. (닉네임/별명 정확히 입력)', ephemeral: true });
      }
      const targetMember = matches.first();
      const targetId = targetMember.user.id;

      const reporter = isAnon
        ? '익명'
        : `<@${modalInter.user.id}> (${modalInter.user.tag})`;
      const embed = new EmbedBuilder()
        .setTitle('🚨 유저 신고 접수')
        .setColor(0xff3333)
        .addFields(
          { name: '• 신고 사유', value: `${selectedReason}`, inline: true },
          { name: '• 익명 여부', value: isAnon ? '예 (익명)' : '아니오 (신고자 공개)', inline: true },
          { name: '• 사건 발생 일시', value: eventDate, inline: true },
          { name: '• 신고 대상', value: `${targetMember.displayName} (<@${targetId}>)`, inline: true },
          { name: '• 신고자', value: reporter, inline: true },
          { name: '\u200B', value: '\u200B', inline: false },
          { name: '• 신고 내용', value: reportDetail, inline: false }
        )
        .setFooter({ text: `신고 접수일시: ${new Date().toLocaleString()}` })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });

      // 👑 관계도: 신고자 → 대상, -5점 (단방향)
      relationship.addScore(modalInter.user.id, targetId, -5);

      await modalInter.reply({
        content: '✅ 신고가 정상적으로 접수되었습니다.',
        ephemeral: true
      });
    } catch (err) {
      await interaction.followUp({ content: '❗️시간이 초과되어 신고가 취소되었습니다.', ephemeral: true }).catch(() => {});
    }
  }
};
