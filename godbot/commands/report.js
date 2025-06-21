// commands/report.js
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const relationship = require('../utils/relationship.js');

const configPath = path.join(__dirname, '..', 'logchannel.json');
const LOG_CHANNEL_ID = "1382168527015776287"; // 로그 채널 ID(수동 세팅시 사용)

// 신고 사유 옵션
const REASONS = [
  { label: '욕설', value: '욕설' },
  { label: '비매너', value: '비매너' },
  { label: '탈주', value: '탈주' },
  { label: '불쾌감 조성', value: '불쾌감 조성' },
  { label: '고의적 트롤', value: '고의적 트롤' },
  { label: '사생활 침해', value: '사생활 침해' },
  { label: '노쇼 및 파토', value: '노쇼 및 파토' },
  { label: '무시 및 인신공격', value: '무시 및 인신공격' },
  { label: '해킹', value: '해킹' },
  { label: '기타', value: '기타' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('신고')
    .setDescription('유저를 서버에 신고합니다.'),

  async execute(interaction) {
    // 1. 신고 사유 선택
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('report_reason')
        .setPlaceholder('신고 사유를 선택하세요')
        .addOptions(REASONS)
    );

    await interaction.reply({
      content: '신고할 사유를 선택하세요. (민원/문의는 `/민원`)',
      components: [selectRow],
      ephemeral: true
    });

    try {
      const reasonSelect = await interaction.channel.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id && i.customId === 'report_reason',
        time: 300_000
      });
      const selectedReason = reasonSelect.values[0];

      // 2. 신고 모달
      const modal = new ModalBuilder()
        .setCustomId('report_modal')
        .setTitle('🚨 유저 신고');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('target_nick')
            .setLabel('신고 대상 닉네임 (필수)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('디스코드 닉네임/별명')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('event_time')
            .setLabel('사건 발생 일시 (선택)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('ex: 2025-07-01 15:00, 오늘 저녁 등')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('detail')
            .setLabel('신고 내용 (필수)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder('구체적으로 작성해주세요.')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('anonymous')
            .setLabel('익명 신고? (예/공란=아니오)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('예/아니오')
        )
      );
      await reasonSelect.showModal(modal);

      // 3. 모달 제출 대기
      const modalSubmit = await reasonSelect.awaitModalSubmit({
        filter: m => m.user.id === interaction.user.id && m.customId === 'report_modal',
        time: 300_000
      });

      // 로그채널 fetch
      let channelId = LOG_CHANNEL_ID;
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath));
          if (config.channelId) channelId = config.channelId;
        } catch { /* 무시 */ }
      }
      let logChannel;
      try {
        logChannel = await modalSubmit.guild.channels.fetch(channelId);
      } catch {
        return modalSubmit.reply({ content: '❗ 로그 채널을 찾을 수 없습니다.', ephemeral: true });
      }
      if (!logChannel) {
        return modalSubmit.reply({ content: '❗ 로그 채널을 찾을 수 없습니다.', ephemeral: true });
      }

      // 대상 유저 찾기
      const targetNick = modalSubmit.fields.getTextInputValue('target_nick').trim();
      const eventDate = modalSubmit.fields.getTextInputValue('event_time') || '미입력';
      const detail = modalSubmit.fields.getTextInputValue('detail');
      const anonRaw = modalSubmit.fields.getTextInputValue('anonymous')?.trim();
      const isAnon = anonRaw === '예';

      // 서버 멤버 중 닉네임/별명/디스코드 이름 매칭
      const members = await modalSubmit.guild.members.fetch();
      const matches = members.filter(m => 
        !m.user.bot && (
          m.displayName === targetNick || 
          m.user.username === targetNick
        )
      );
      if (matches.size === 0) {
        return modalSubmit.reply({ content: '❗️해당 닉네임/별명의 유저를 찾을 수 없습니다. (정확히 입력해 주세요)', ephemeral: true });
      }
      if (matches.size > 1) {
        let multiList = matches.map(m => `• ${m.displayName} / ${m.user.tag}`).join('\n');
        return modalSubmit.reply({ content: `❗️여러 유저가 일치합니다. (정확히 입력)\n${multiList}`, ephemeral: true });
      }
      const targetMember = matches.first();
      const targetId = targetMember.user.id;

      // 익명/실명
      const reporter = isAnon ? '익명' : `<@${modalSubmit.user.id}> (${modalSubmit.user.tag})`;

      // 임베드 생성
      const embed = new EmbedBuilder()
        .setTitle('🚨 유저 신고 접수')
        .setColor(0xff3333)
        .addFields(
          { name: '• 신고 사유', value: `\`${selectedReason}\``, inline: true },
          { name: '• 익명 여부', value: isAnon ? '예 (익명)' : '아니오 (신고자 공개)', inline: true },
          { name: '• 사건 발생 일시', value: eventDate, inline: true },
          { name: '• 신고 대상', value: `\`${targetMember.displayName}\` (<@${targetId}>)`, inline: true },
          { name: '• 신고자', value: reporter, inline: true },
          { name: '\u200B', value: '\u200B', inline: false },
          { name: '• 신고 내용', value: detail, inline: false }
        )
        .setFooter({ text: `신고 접수일시: ${new Date().toLocaleString()}` })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });

      // 관계도: 신고자 → 대상, -5점 (단방향)
      try {
        relationship.addScore(modalSubmit.user.id, targetId, -5);
      } catch { /* 무시 */ }

      await modalSubmit.reply({
        content: `✅ 신고가 정상적으로 접수되었습니다.`,
        ephemeral: true
      });

    } catch (e) {
      await interaction.editReply({ 
        content: '❗️시간이 초과되어 신고가 취소되었습니다.', 
        components: [], 
        ephemeral: true 
      }).catch(() => {});
    }
  }
};
