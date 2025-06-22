// commands/report.js
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

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
    .setDescription('유저를 신고합니다.'),
  async execute(interaction) {
    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('report_reason')
        .setPlaceholder('신고 사유를 선택하세요')
        .addOptions(REASONS)
    );
    await interaction.reply({
      content: '신고할 사유를 선택하세요. (민원 및 문의는 /민원)',
      components: [selectRow],
      ephemeral: true,
    });
  },

  // 이 아래를 그대로 index.js에서 events로 등록하지 않아도 작동하도록 export
  async handleComponent(interaction) {
    // 신고 사유 선택 후 모달 표시
    if (interaction.customId === 'report_reason') {
      const selectedReason = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`report_modal_${selectedReason}`)
        .setTitle('🚨 유저 신고')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('신고_대상')
              .setLabel('신고 대상 유저 닉네임 (필수)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder('디스코드 닉네임/별명')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('신고_일시')
              .setLabel('사건 발생 일시 (선택)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder('ex: 2024-07-01 15:00 또는 오늘 저녁')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('신고_내용')
              .setLabel('신고 내용을 작성해주세요. (필수)')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setPlaceholder('상세히 적어주세요.')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('신고_익명')
              .setLabel('익명으로 보내시겠습니까? (예/공란=아니오)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder('예/아니오')
          ),
        );
      await interaction.showModal(modal);
    }
  },

  async handleModal(interaction) {
    // CustomId에서 사유 추출
    if (!interaction.customId.startsWith('report_modal_')) return;
    const selectedReason = interaction.customId.replace('report_modal_', '');
    const configPath = path.join(__dirname, '..', 'logchannel.json');
    if (!fs.existsSync(configPath)) {
      return interaction.reply({ content: '❗ 로그 채널이 아직 등록되지 않았습니다. `/로그채널등록` 명령어를 먼저 사용해주세요.', ephemeral: true });
    }
    const config = JSON.parse(fs.readFileSync(configPath));
    const logChannel = await interaction.guild.channels.fetch(config.channelId);
    if (!logChannel) {
      return interaction.reply({ content: '❗ 로그 채널을 찾을 수 없습니다.', ephemeral: true });
    }

    const targetNick = interaction.fields.getTextInputValue('신고_대상').trim();
    const eventDate = interaction.fields.getTextInputValue('신고_일시') || '미입력';
    const reportDetail = interaction.fields.getTextInputValue('신고_내용');
    const anonRaw = interaction.fields.getTextInputValue('신고_익명').trim();
    const isAnon = anonRaw === '예';

    const members = await interaction.guild.members.fetch();
    const matches = members.filter(m => !m.user.bot && (m.displayName === targetNick || m.user.username === targetNick));
    if (matches.size === 0) {
      return interaction.reply({ content: '❗️해당 닉네임/별명의 유저를 찾을 수 없습니다. (정확히 입력해 주세요)', ephemeral: true });
    }
    if (matches.size > 1) {
      return interaction.reply({ content: '❗️여러 유저가 일치합니다. (닉네임/별명 정확히 입력)', ephemeral: true });
    }
    const targetMember = matches.first();
    const targetId = targetMember.user.id;

    // 익명 or 공개자
    const reporter = isAnon
      ? '익명'
      : `<@${interaction.user.id}> (${interaction.user.tag})`;

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
        { name: '• 신고 내용', value: reportDetail, inline: false }
      )
      .setFooter({ text: `신고 접수일시: ${new Date().toLocaleString()}` })
      .setTimestamp();

    // 호감도 차감 처리
    try {
      const relationship = require('../utils/relationship.js');
      relationship.addScore(interaction.user.id, targetId, -5);
    } catch (e) {
      // 무시
    }

    await logChannel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ 신고가 정상적으로 접수되었습니다.`, ephemeral: true });
  },

  // 디스코드 클라이언트에서 다음과 같이 등록되어야 함
  // 이 부분을 index.js에 건드릴 필요 없이 report.js 내부에서 동적으로 핸들링할 수 있게 아래 이벤트 리스너 등록 코드 추가
  register: (client) => {
    client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isStringSelectMenu() && interaction.customId === 'report_reason') {
        await module.exports.handleComponent(interaction);
      } else if (interaction.isModalSubmit() && interaction.customId.startsWith('report_modal_')) {
        await module.exports.handleModal(interaction);
      }
    });
  }
};
