// commands/donate.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const DONATION_LOG_CHANNEL = '1385860310753087549';      // 후원금 정보(비공개)
const DONATION_THANKS_CHANNEL = '1264514955269640252';    // 상품 후원 공개
const DONATE_ACCOUNT = '지역농협 3521075112463 이*민';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('후원')
    .setDescription('소중한 후원을 해주세요!'),
  async execute(interaction) {
    try {
      // 첫 페이지: 후원 방식 선택
      const embed = new EmbedBuilder()
        .setTitle('💖 후원해주셔서 정말 감사합니다!')
        .setDescription('아래에서 후원 방법을 선택해주세요.\n\n- **후원금**: 계좌로 바로 입금 가능\n- **상품**: 물품 등 다양한 형태의 후원')
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
      const btnInt = await interaction.channel.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id && ['donate_money', 'donate_item'].includes(i.customId),
        time: 120_000
      }).catch(() => null);
      if (!btnInt) return;

      // ============ 후원금 ===============
      if (btnInt.customId === 'donate_money') {
        const moneyEmbed = new EmbedBuilder()
          .setTitle('💸 후원금 계좌 안내')
          .setDescription([
            `**후원계좌** : \`${DONATE_ACCOUNT}\``,
            '',
            '입금 후 아래 버튼으로 입금 사실을 알려주세요.',
            '정말 소중한 마음, 감사합니다!'
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
        const moneyBtn = await interaction.channel.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id && ['donate_money_done', 'donate_money_later'].includes(i.customId),
          time: 120_000
        }).catch(() => null);
        if (!moneyBtn) return;

        if (moneyBtn.customId === 'donate_money_later') {
          await moneyBtn.update({ content: '언제든 후원해주시면 정말 감사하겠습니다!', embeds: [], components: [], ephemeral: true }).catch(() => {});
          return;
        }

        // 모달 - 입금 정보 입력
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
                .setPlaceholder('예: 김영갓,박까리')
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

        try {
          await moneyBtn.showModal(modal);
        } catch { return; }

        const submitted = await moneyBtn.awaitModalSubmit({
          filter: m => m.user.id === interaction.user.id && m.customId === 'donate_money_modal',
          time: 180_000
        }).catch(() => null);
        if (!submitted) return;

        const amount = submitted.fields.getTextInputValue('donate_amount');
        const inName = submitted.fields.getTextInputValue('donate_name');
        const purpose = submitted.fields.getTextInputValue('donate_purpose') || '미입력';

        // 후원 감사 인사 (본인)
        await submitted.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('💖 진심으로 감사드립니다!')
              .setDescription('소중한 후원금, 감사히 잘 사용하겠습니다.\n감사의 마음을 담아, 후원 내역은 안전하게 기록됩니다.')
              .setColor(0xf9bb52)
          ],
          ephemeral: true
        }).catch(() => {});

        // 비공개 로그 채널에 상세 전송
        try {
          const logChannel = await submitted.guild.channels.fetch(DONATION_LOG_CHANNEL).catch(() => null);
          if (logChannel) {
            await logChannel.send({
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
                  .setFooter({ text: `후원일시: ${new Date().toLocaleString()}` })
              ]
            });
          }
        } catch {}

        // 공개 감사 메시지 (입금자/금액/목적 등은 공개되지 않음)
        try {
          const thanksChannel = await submitted.guild.channels.fetch(DONATION_THANKS_CHANNEL).catch(() => null);
          if (thanksChannel) {
            await thanksChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setDescription(`**${interaction.member.displayName}**님께서 소중한 후원금을 주셨습니다. 감사합니다!`)
                  .setColor(0xf9bb52)
              ]
            });
          }
        } catch {}

        return;
      }

      // ============ 상품 후원 ================
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
                .setLabel('익명 후원 여부 (예/아니오/공란=비익명)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('예 / 아니오 / 공란')
                .setRequired(false)
            )
          );

        try {
          await btnInt.showModal(modal);
        } catch { return; }

        const submitted = await btnInt.awaitModalSubmit({
          filter: m => m.user.id === interaction.user.id && m.customId === 'donate_item_modal',
          time: 180_000
        }).catch(() => null);
        if (!submitted) return;

        const item = submitted.fields.getTextInputValue('item');
        const reason = submitted.fields.getTextInputValue('reason');
        const situation = submitted.fields.getTextInputValue('situation') || '미입력';
        const anonymous = submitted.fields.getTextInputValue('anonymous')?.trim();

        let displayName = interaction.member.displayName;
        if (anonymous && anonymous.toLowerCase() === '예') displayName = '익명';

        // 안내 메시지 (상품 링크/사진 전달 안내)
        const dmMsg = [
          '정말 소중한 후원, 진심으로 감사드립니다!',
          '후원 상품의 링크, 이미지, 사진 등은 **영갓**에게 DM 혹은 따로 전달해주세요.',
          '감사한 후원, 꼭 책임지고 관리하겠습니다.'
        ].join('\n');

        // 공개 감사 인사(상품명 포함, 익명 가능)
        try {
          const thanksChannel = await submitted.guild.channels.fetch(DONATION_THANKS_CHANNEL).catch(() => null);
          if (thanksChannel) {
            await thanksChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle('🎁 상품 후원 접수')
                  .setDescription([
                    `**${displayName}**님께서 (${new Date().toLocaleDateString()})`,
                    `\`${item}\` 상품을 후원하셨습니다. 감사합니다!`
                  ].join('\n'))
                  .setColor(0xf9bb52)
              ]
            });
          }
        } catch {}

        // 본인 DM 안내
        await submitted.reply({
          content: dmMsg,
          ephemeral: true
        }).catch(() => {});
      }

    } catch (err) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ 명령어 실행 중 오류가 발생했습니다.', ephemeral: true }).catch(() => {});
      }
    }
  }
};
