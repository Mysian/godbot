// commands/donate.js
const { 
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType
} = require('discord.js');

const DONATION_LOG_CHANNEL = '1385860310753087549';
const DONATION_THANKS_CHANNEL = '1264514955269640252';
const DONATE_ACCOUNT = '지역농협 3521075112463 예금주:이O민';

function getKSTDateString() {
  return new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}
function getKSTDateTimeString() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

// --- 공통 처리 함수(중복 방지) ---
async function handleMoneyModal(submitted) {
  const amount = submitted.fields.getTextInputValue('donate_amount');
  const inName = submitted.fields.getTextInputValue('donate_name');
  const purpose = submitted.fields.getTextInputValue('donate_purpose') || '미입력';

  const thanksEmbed = new EmbedBuilder()
    .setTitle('💖 감사합니다!')
    .setDescription('정말 소중한 후원금, 감사히 잘 사용하겠습니다.')
    .setColor(0xf9bb52);

  try {
    if (!submitted.replied && !submitted.deferred) {
      await submitted.reply({ embeds: [thanksEmbed], ephemeral: true });
    } else {
      await submitted.editReply({ embeds: [thanksEmbed], ephemeral: true });
    }
  } catch {}

  // 로그 채널 전송
  try {
    const guild = submitted.guild;
    const logChannel = await guild.channels.fetch(DONATION_LOG_CHANNEL).catch(() => null);
    if (logChannel) {
      const threadName = `[상품후원] ${submitted.user.id}`;
      let thread = logChannel.threads.cache.find(
        t => t.name === threadName && !t.archived
      );
      if (!thread) {
        thread = await logChannel.threads.create({
          name: threadName,
          autoArchiveDuration: 1440,
          reason: '후원금 내역 정리'
        });
      }
      await thread.send({
        content: `<@${submitted.user.id}> 정말 소중한 후원금, 감사히 잘 사용하겠습니다!`,
        embeds: [
          new EmbedBuilder()
            .setTitle('💸 후원금 정보')
            .setColor(0x4caf50)
            .addFields(
              { name: '입금자', value: inName, inline: true },
              { name: '금액', value: `${amount}원`, inline: true },
              { name: '원하는 사용처', value: purpose, inline: true },
              { name: '디스코드 유저', value: `<@${submitted.user.id}> (${submitted.user.tag})` }
            )
            .setFooter({ text: `후원일시: ${getKSTDateTimeString()}` })
        ]
      });
    }
  } catch {}

  // 공개 감사 메시지(공개채널)
  try {
    const thanksPublic = new EmbedBuilder()
      .setDescription(`**${submitted.member.displayName}**님께서 소중한 후원금을 주셨습니다. 감사합니다!`)
      .setColor(0xf9bb52);

    const thanksChannel = await submitted.guild.channels.fetch(DONATION_THANKS_CHANNEL).catch(() => null);
    if (thanksChannel) await thanksChannel.send({ embeds: [thanksPublic] });
  } catch {}
}

async function handleItemModal(submitted) {
  const item = submitted.fields.getTextInputValue('item');
  const reason = submitted.fields.getTextInputValue('reason');
  const situation = submitted.fields.getTextInputValue('situation') || '미입력';
  const anonymous = submitted.fields.getTextInputValue('anonymous')?.trim();

  let displayName = submitted.member.displayName;
  if (anonymous && anonymous.toLowerCase() === '예') displayName = '익명';

  // 로그 채널
  try {
    const guild = submitted.guild;
    const logChannel = await guild.channels.fetch(DONATION_LOG_CHANNEL).catch(() => null);
    if (logChannel && logChannel.type === ChannelType.GuildText) {
      await logChannel.send({
        content: `<@${submitted.user.id}> 정말 소중한 상품 후원, 감사히 잘 사용하겠습니다!`,
        embeds: [
          new EmbedBuilder()
            .setTitle('🎁 상품 후원 접수')
            .addFields(
              { name: '후원자', value: displayName, inline: true },
              { name: '상품', value: item, inline: true },
              { name: '후원 이유', value: reason, inline: false },
              { name: '소비 희망 상황/대상', value: situation, inline: false }
            )
            .setFooter({ text: `접수일시: ${getKSTDateTimeString()}` })
            .setColor(0x6cc3c1)
        ]
      });
    }
  } catch {}

  // 공개 감사 메시지
  try {
    const thanksEmbed = new EmbedBuilder()
      .setTitle('🎁 상품 후원 접수')
      .setDescription([
        `**${displayName}**님께서 (${getKSTDateString()})`,
        `\`${item}\` 상품을 후원하셨습니다. 감사합니다!`
      ].join('\n'))
      .setColor(0xf9bb52);

    const thanksChannel = await submitted.guild.channels.fetch(DONATION_THANKS_CHANNEL).catch(() => null);
    if (thanksChannel) await thanksChannel.send({ embeds: [thanksEmbed] });
  } catch {}

  // 에페메랄 응답
  try {
    await submitted.reply({
      content: [
        `정말 소중한 후원, 진심으로 감사드립니다!`,
        '상품 정보, 이미지 등은 영갓 또는 스탭진에게 직접 DM으로 전송해주세요!'
      ].join('\n\n'),
      ephemeral: true
    });
  } catch {}
}

// --- 명령어/외부 모두 대응하는 구조 ---
module.exports = {
  data: new SlashCommandBuilder()
    .setName('후원')
    .setDescription('소중한 후원을 해주세요!'),

  async execute(interaction) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('💖 후원해주셔서 감사합니다!')
        .setDescription('어떤 방식으로 후원하시겠어요?\n\n**정말 감사한 마음을 담아, 모든 후원은 신중하게 관리됩니다.**')
        .setColor(0xf9bb52);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('donate_money')
          .setLabel('💸 후원금')
          .setEmoji('💸')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('donate_item')
          .setLabel('🎁 상품 후원')
          .setEmoji('🎁')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

      const filter = btn => btn.user.id === interaction.user.id && ['donate_money', 'donate_item'].includes(btn.customId);
      let btnInt;
      try {
        btnInt = await interaction.channel.awaitMessageComponent({ filter, time: 120_000 });
      } catch {
        try {
          await interaction.editReply({ content: '⏰ 시간이 초과되었습니다. 다시 시도해주세요.', embeds: [], components: [], ephemeral: true });
        } catch {}
        return;
      }

      // --- 후원금 ---
      if (btnInt.customId === 'donate_money') {
        const modal = new ModalBuilder()
          .setCustomId('donate_money_modal')
          .setTitle('💸 후원금 정보 입력')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('donate_amount')
                .setLabel('입금 금액 (원)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('예: 10000')
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('donate_name')
                .setLabel('입금자 성함')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('예: 김영갓, 박까리')
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('donate_purpose')
                .setLabel('후원금이 쓰였으면 하는 곳/목적 (선택)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('예: 장비 구매, 커뮤니티 운영 등')
                .setRequired(false)
            )
          );
        await btnInt.showModal(modal);

        // === 명령어에서 모달 제출도 직접 기다려서 처리 ===
        let submitted;
        try {
          submitted = await btnInt.awaitModalSubmit({
            filter: m => m.user.id === interaction.user.id && m.customId === 'donate_money_modal',
            time: 180_000
          });
        } catch { return; }
        if (!submitted) return;
        await handleMoneyModal(submitted);
        return;
      }

      // --- 상품후원 ---
      if (btnInt.customId === 'donate_item') {
        const modal = new ModalBuilder()
          .setCustomId('donate_item_modal')
          .setTitle('🎁 상품 후원 신청')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('item')
                .setLabel('후원하는 상품 (필수)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('후원하는 이유 (필수)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('situation')
                .setLabel('상품이 소비되었으면 하는 상황/대상 (선택)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('anonymous')
                .setLabel('익명 후원 여부 ("예" 입력시 익명)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('예 / 아니오 / 공란')
                .setRequired(false)
            )
          );
        await btnInt.showModal(modal);

        let submitted;
        try {
          submitted = await btnInt.awaitModalSubmit({
            filter: m => m.user.id === interaction.user.id && m.customId === 'donate_item_modal',
            time: 180_000
          });
        } catch { return; }
        if (!submitted) return;
        await handleItemModal(submitted);
        return;
      }

    } catch (err) {
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ 명령어 실행 중 오류가 발생했습니다.', ephemeral: true });
        }
      } catch {}
    }
  },

  // === 외부 모달 제출 전용 ===
  async modal(interaction) {
    if (interaction.customId === 'donate_money_modal') {
      await handleMoneyModal(interaction);
      return;
    }
    if (interaction.customId === 'donate_item_modal') {
      await handleItemModal(interaction);
      return;
    }
  }
};
