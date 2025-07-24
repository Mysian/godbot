// commands/donate.js

const { 
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const DONATION_LOG_CHANNEL = '1385860310753087549';
const DONATION_THANKS_CHANNEL = '1264514955269640252';
const DONATE_ACCOUNT = '지역농협 3521075112463 이O민';
const DONOR_ROLE_ID = '1397076919127900171';

const donorRolesPath = path.join(__dirname, '../data/donor_roles.json');
const itemDonationsPath = path.join(__dirname, '../data/item_donations.json');

// KST 날짜/시간 포맷
function getKSTDateString() {
  return new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}
function getKSTDateTimeString() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

// donor_roles.json 입출력
function loadDonorRoles() {
  if (!fs.existsSync(donorRolesPath)) return {};
  return JSON.parse(fs.readFileSync(donorRolesPath, 'utf8'));
}
function saveDonorRoles(data) {
  fs.writeFileSync(donorRolesPath, JSON.stringify(data, null, 2));
}

// item_donations.json 입출력
function loadItemDonations() {
  if (!fs.existsSync(itemDonationsPath)) return [];
  return JSON.parse(fs.readFileSync(itemDonationsPath, 'utf8'));
}
function saveItemDonations(arr) {
  fs.writeFileSync(itemDonationsPath, JSON.stringify(arr, null, 2));
}

// 역할 부여 & 기간 관리 (누적)
async function giveDonorRole(member, days) {
  if (!days || days <= 0) return;
  let donorData = loadDonorRoles();
  let now = new Date();
  let base = now;
  if (donorData[member.id]?.expiresAt) {
    let prev = new Date(donorData[member.id].expiresAt);
    base = prev > now ? prev : now;
  }
  let expires = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  donorData[member.id] = {
    roleId: DONOR_ROLE_ID,
    expiresAt: expires.toISOString()
  };
  saveDonorRoles(donorData);
  await member.roles.add(DONOR_ROLE_ID).catch(() => {});
}

// 만료 체크 (ready, 주기적 호출 추천)
async function checkDonorRoleExpires(guild) {
  let donorData = loadDonorRoles();
  let now = new Date();
  let changed = false;
  for (const [userId, info] of Object.entries(donorData)) {
    if (new Date(info.expiresAt) <= now) {
      let member = await guild.members.fetch(userId).catch(() => null);
      if (member) await member.roles.remove(DONOR_ROLE_ID).catch(() => {});
      delete donorData[userId];
      changed = true;
    }
  }
  if (changed) saveDonorRoles(donorData);
}

// 후원금 모달 처리
async function handleMoneyModal(submitted) {
  const confirm = submitted.fields.getTextInputValue('donate_confirm');
  if (confirm.trim() !== '입금 완료') {
    await submitted.reply({ content: '입금 완료 체크가 필요합니다. "입금 완료"를 정확히 입력해주세요.', ephemeral: true });
    return;
  }
  const amount = submitted.fields.getTextInputValue('donate_amount');
  if (isNaN(amount) || Number(amount) < 1000) {
    await submitted.reply({ content: '최소 후원금은 1,000원부터 가능합니다.', ephemeral: true });
    return;
  }
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

  // **변경: 1,000원 당 3일**
  let days = Math.floor(Number(amount) / 1000) * 3;
  if (days > 0) await giveDonorRole(submitted.member, days);

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

// 상품 후원 모달 처리 + 로그 저장 + 역할 7일 지급
async function handleItemModal(submitted) {
  const item = submitted.fields.getTextInputValue('item');
  const reason = submitted.fields.getTextInputValue('reason');
  const situation = submitted.fields.getTextInputValue('situation') || '미입력';
  const anonymous = submitted.fields.getTextInputValue('anonymous')?.trim();

  let displayName = submitted.member.displayName;
  let anonymousBool = false;
  if (anonymous && anonymous.toLowerCase() === '예') {
    displayName = '익명';
    anonymousBool = true;
  }

  // 상품 후원 로그 저장
  let arr = loadItemDonations();
  arr.unshift({
    userId: submitted.user.id,
    name: displayName,
    item,
    reason,
    situation,
    anonymous: anonymousBool,
    date: new Date().toISOString()
  });
  saveItemDonations(arr);

  // **역할 7일 부여**
  await giveDonorRole(submitted.member, 7);

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('후원')
    .setDescription('소중한 후원을 해주세요!'),

  async execute(interaction) {
    await checkDonorRoleExpires(interaction.guild);

    try {
      const embed = new EmbedBuilder()
        .setTitle('💖 후원해주셔서 감사합니다!')
        .setDescription([
          `**💸 후원금 안내**`,
          `- 1,000원당 후원자 역할 **3일** 자동 부여`,
          ``,
          `**🎁 상품 후원 안내**`,
          `- 상품 1건 후원 시 후원자 역할 **7일** 자동 부여`,
          ``,
          `※ 모든 후원 내역 및 역할은 누적 관리됩니다.\n\n정말 감사한 마음을 담아, 모든 후원은 신중하게 관리됩니다.`
        ].join('\n'))
        .addFields(
          { name: '🎁 후원자의 혜택', value: `• 서버 내 **경험치 부스터 +333**\n• 후원자 역할 𝕯𝖔𝖓𝖔𝖗 부여 및 서버 멤버 상단 고정\n• 추가 정수 획득 기회`, inline: false },
          { name: '💰 후원금의 용도', value: `• 서버 부스터 잔여분 진행\n• 정수 **'경매 현물'** 마련 (게임 아이템, 기프티콘, 실제 상품 등)\n• 내전(서버 내 대회) 보상\n• 마인크래프트 등 자체 서버 호스팅 및 유지(일정 금액 달성 시)\n• 자체 봇 '갓봇'의 개발 및 서버 호스팅 비용`, inline: false }
        )
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
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('donate_account_info')
                .setLabel('입금 계좌 (안내, 복사해서 입금)')
                .setStyle(TextInputStyle.Short)
                .setValue(DONATE_ACCOUNT)
                .setRequired(false)
                .setMaxLength(40)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('donate_confirm')
                .setLabel('※ "입금 완료" 라고 꼭 입력해주세요!')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('입금 완료')
                .setRequired(true)
            )
          );
        await btnInt.showModal(modal);
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
  },

  // === 역할 만료 체크 함수(외부에서 호출 가능) ===
  checkDonorRoleExpires,
};
