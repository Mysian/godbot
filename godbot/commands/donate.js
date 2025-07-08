// commands/donate.js
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  ChannelType
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('후원')
    .setDescription('소중한 후원을 해주세요!'),
  async execute(interaction) {
    try {
      // 1차: 옵션 선택
      const embed = new EmbedBuilder()
        .setTitle('💖 후원해주셔서 감사합니다!')
        .setDescription('어떤 방식으로 후원하시겠어요?\n\n**정말 감사한 마음을 담아, 모든 후원은 신중하게 관리됩니다.**')
        .setColor(0xf9bb52);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('donate_money')
          .setLabel('후원금')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('donate_item')
          .setLabel('상품')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

      // 버튼 대기
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

      // ============ 후원금 ===============
      if (btnInt.customId === 'donate_money') {
        const moneyEmbed = new EmbedBuilder()
          .setTitle('💸 후원금 계좌')
          .setDescription([
            `후원계좌: \`${DONATE_ACCOUNT}\``,
            '',
            '입금 후 아래 버튼으로 입금 사실을 알려주세요.',
            '진심으로 감사드립니다!'
          ].join('\n'))
          .setColor(0x4caf50);

        const moneyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('donate_money_done')
            .setLabel('후원금 입금했습니다.')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('donate_money_later')
            .setLabel('나중에 진행하기')
            .setStyle(ButtonStyle.Secondary)
        );

        await btnInt.update({ embeds: [moneyEmbed], components: [moneyRow], ephemeral: true });

        // 버튼 대기 (입금/나중에)
        let moneyBtn;
        try {
          moneyBtn = await interaction.channel.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id && ['donate_money_done', 'donate_money_later'].includes(i.customId),
            time: 120_000
          });
        } catch {
          try {
            await interaction.editReply({ content: '⏰ 시간이 초과되었습니다. 다시 시도해주세요.', embeds: [], components: [], ephemeral: true });
          } catch {}
          return;
        }

        if (moneyBtn.customId === 'donate_money_later') {
          try {
            await moneyBtn.update({ content: '언제든 후원해주시면 정말 감사하겠습니다!', embeds: [], components: [], ephemeral: true });
          } catch {}
          return;
        }

        // 모달 - 입금 정보 입력
        const modal = new ModalBuilder()
          .setCustomId('donate_money_modal')
          .setTitle('💸 후원금 정보 입력');

        const amountInput = new TextInputBuilder()
          .setCustomId('donate_amount')
          .setLabel('입금 금액 (원)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('예: 10000')
          .setRequired(true);

        const nameInput = new TextInputBuilder()
          .setCustomId('donate_name')
          .setLabel('입금자 성함')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('예: 김영갓, 박까리')
          .setRequired(true);

        const purposeInput = new TextInputBuilder()
          .setCustomId('donate_purpose')
          .setLabel('후원금이 쓰였으면 하는 곳/목적 (선택)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('예: 장비 구매, 커뮤니티 운영 등')
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(amountInput),
          new ActionRowBuilder().addComponents(nameInput),
          new ActionRowBuilder().addComponents(purposeInput)
        );

        try {
          await moneyBtn.showModal(modal);
        } catch {
          try {
            await interaction.editReply({ content: '❌ 모달 처리 중 오류가 발생했습니다.', embeds: [], components: [], ephemeral: true });
          } catch {}
          return;
        }

        // 모달 결과 대기
        let submitted;
        try {
          submitted = await moneyBtn.awaitModalSubmit({
            filter: m => m.user.id === interaction.user.id && m.customId === 'donate_money_modal',
            time: 180_000
          });
        } catch {
          return;
        }
        if (!submitted) return;

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

        // 비공개 후원 로그 채널로 상세 내용 전송 (스레드 통일)
        try {
          const guild = submitted.guild;
          const logChannel = await guild.channels.fetch(DONATION_LOG_CHANNEL).catch(() => null);
          if (logChannel) {
            const threadName = `[상품후원] ${interaction.user.id}`;
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
              content: `<@${interaction.user.id}> 정말 소중한 후원금, 감사히 잘 사용하겠습니다!`,
              embeds: [
                new EmbedBuilder()
                  .setTitle('💸 후원금 정보')
                  .setColor(0x4caf50)
                  .addFields(
                    { name: '입금자', value: inName, inline: true },
                    { name: '금액', value: `${amount}원`, inline: true },
                    { name: '원하는 사용처', value: purpose, inline: true },
                    { name: '디스코드 유저', value: `<@${interaction.user.id}> (${interaction.user.tag})` }
                  )
                  .setFooter({ text: `후원일시: ${getKSTDateTimeString()}` })
              ]
            });
          }
        } catch {}

        // 공개 감사 메시지(공개채널)
        try {
          const thanksPublic = new EmbedBuilder()
            .setDescription(`**${interaction.member.displayName}**님께서 소중한 후원금을 주셨습니다. 감사합니다!`)
            .setColor(0xf9bb52);

          const thanksChannel = await submitted.guild.channels.fetch(DONATION_THANKS_CHANNEL).catch(() => null);
          if (thanksChannel) await thanksChannel.send({ embeds: [thanksPublic] });
        } catch {}

        return;
      }

      // ============ 상품 후원 ================
      if (btnInt.customId === 'donate_item') {
        // 모달 띄우기(기존과 동일)
        const modal = new ModalBuilder()
          .setCustomId('donate_item_modal')
          .setTitle('🎁 상품 후원 신청');

        const itemInput = new TextInputBuilder()
          .setCustomId('item')
          .setLabel('후원하는 상품 (필수)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const reasonInput = new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('후원하는 이유 (필수)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const situationInput = new TextInputBuilder()
          .setCustomId('situation')
          .setLabel('상품이 소비되었으면 하는 상황/대상 (선택)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const anonInput = new TextInputBuilder()
          .setCustomId('anonymous')
          .setLabel('익명 후원 여부 ("예" 입력시 익명)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('예 / 아니오 / 공란')
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(itemInput),
          new ActionRowBuilder().addComponents(reasonInput),
          new ActionRowBuilder().addComponents(situationInput),
          new ActionRowBuilder().addComponents(anonInput)
        );

        try {
          await btnInt.showModal(modal);
        } catch {
          try {
            await interaction.editReply({ content: '❌ 모달 처리 중 오류가 발생했습니다.', embeds: [], components: [], ephemeral: true });
          } catch {}
          return;
        }

        // 모달 결과 대기
        let submitted;
        try {
          submitted = await btnInt.awaitModalSubmit({
            filter: m => m.user.id === interaction.user.id && m.customId === 'donate_item_modal',
            time: 180_000
          });
        } catch {
          return;
        }
        if (!submitted) return;

        const item = submitted.fields.getTextInputValue('item');
        const reason = submitted.fields.getTextInputValue('reason');
        const situation = submitted.fields.getTextInputValue('situation') || '미입력';
        const anonymous = submitted.fields.getTextInputValue('anonymous')?.trim();

        let displayName = interaction.member.displayName;
        if (anonymous && anonymous.toLowerCase() === '예') displayName = '익명';

        // 1. DM 발송 생략(삭제)
        // 2. 로그 채널에 스레드 없이 Embed만 남김
        try {
          const guild = submitted.guild;
          const logChannel = await guild.channels.fetch(DONATION_LOG_CHANNEL).catch(() => null);
          if (logChannel && logChannel.type === ChannelType.GuildText) {
            await logChannel.send({
              content: `<@${interaction.user.id}> 정말 소중한 상품 후원, 감사히 잘 사용하겠습니다!`,
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

        // 3. 공개 감사 메시지(공개채널) 동일
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

        // 4. 유저 명령어 응답(에페메랄) 동일
        try {
          await submitted.reply({
            content: [
              `정말 소중한 후원, 진심으로 감사드립니다!`,
              '상품 정보, 이미지 등은 영갓 또는 스탭진에게 직접 DM으로 전송해주세요!'
            ].join('\n\n'),
            ephemeral: true
          });
        } catch {}

        return;
      }

    } catch (err) {
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ 명령어 실행 중 오류가 발생했습니다.', ephemeral: true });
        }
      } catch {}
    }
  }
};
