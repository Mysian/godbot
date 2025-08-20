// ===== commands/gift-event.js =====
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');
const { addBE } = require('./be-util.js');

function formatKoreanMoney(num) {
  if (typeof num !== 'number') num = parseInt(num, 10);
  if (isNaN(num)) return num;
  if (num >= 1e8) {
    const eok = Math.floor(num / 1e8);
    const rest = num % 1e8;
    return `${eok}억${rest > 0 ? ' ' + formatKoreanMoney(rest) : ''}`;
  } else if (num >= 1e4) {
    const man = Math.floor(num / 1e4);
    const rest = num % 1e4;
    return `${man}만${rest > 0 ? ' ' + rest.toLocaleString() : ''}`;
  } else {
    return num.toLocaleString();
  }
}

const DONOR_ROLE = '1397076919127900171';

const rewardTable = [
  { min: 1000,     max: 20000,     weight: 70000,  effect: '🎁',   effectMsg: '나쁘지 않네요' },
  { min: 20001,    max: 50000,     weight: 17000,  effect: '✨',   effectMsg: '나쁘지 않네요' },
  { min: 50001,    max: 100000,    weight: 6000,   effect: '💸',   effectMsg: '오~ 소소한데요?' },
  { min: 100001,   max: 200000,    weight: 3000,   effect: '💎',   effectMsg: '오~ 소소한데요?' },
  { min: 200001,   max: 300000,    weight: 2000,   effect: '🔥',   effectMsg: '제법 특별하신듯??' },
  { min: 300001,   max: 400000,    weight: 1000,   effect: '🌈',   effectMsg: '제법 특별하신듯??' },
  { min: 400001,   max: 500000,    weight: 500,    effect: '🦄',   effectMsg: '제법 특별하신듯??' },
  { min: 500001,   max: 600000,    weight: 300,    effect: '👑',   effectMsg: '아니 되게 잘 뜨셨는데?!' },
  { min: 700000,   max: 800000,    weight: 100,    effect: '🌌',   effectMsg: '운 좀 좋으신데요?' },
  { min: 800001,   max: 900000,    weight: 50,     effect: '🚀',   effectMsg: '와 미쳤다...' },
  { min: 900001,   max: 1000000,   weight: 30,     effect: '⭐',    effectMsg: '예? 이게 뜬다고..?' },
  { min: 1000001,  max: 2000000,   weight: 10,     effect: '🏆',   effectMsg: '예??? 이게 뜬다고..?!' },
  { min: 5000000,  max: 5000000,   weight: 5,      effect: '💰',   effectMsg: '아니 ㅋㅋ;; 이게 떴다고요..?' },
  { min: 7770000,  max: 7770000,   weight: 3,      effect: '🔮',   effectMsg: 'ㅁㅊ 이게 떴다고???? 복권 사러가셈 님아 이거 극악 확률인데;;;' },
  { min: 10000000, max: 10000000,  weight: 2,      effect: '👑🌈', effectMsg: 'ㅁㅊ 이게 떴다고???? 복권 사러가셈 님아 이거 극악 확률인데;;;' }
];

function pickReward() {
  const total = rewardTable.reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * total;
  for (const r of rewardTable) {
    if (rand < r.weight) {
      let amount = r.min;
      if (r.min !== r.max) {
        const base = Math.random() ** 3;
        amount = Math.floor(r.min + base * (r.max - r.min));
      }
      return { ...r, amount };
    }
    rand -= r.weight;
  }
  const last = rewardTable[rewardTable.length - 1];
  return { ...last, amount: last.max };
}

function getEffectEmbed(user, reward, isDonor, donorText) {
  let amount = reward.amount;
  if (isDonor && amount < 10000) amount = 10000;
  const formatted = formatKoreanMoney(amount);
  let color = 0x5bbcff;
  if (amount < 20000) color = 0x8ae65c;
  else if (amount < 100000) color = 0x0ba99c;
  else if (amount < 200000) color = 0xa953ff;
  else if (amount < 300000) color = 0xf75525;
  else if (amount < 500000) color = 0xf4e642;
  else if (amount < 1000000) color = 0xff44aa;
  else color = 0x000000;
  return new EmbedBuilder()
    .setTitle(`${reward.effect} [정수 획득!] ${reward.effect}`)
    .setDescription(
      [
        `<@${user.id}>님, ${reward.effectMsg}`,
        `**${formatted} BE** 획득!`,
        donorText ? `\n${donorText}` : ''
      ].join('\n')
    )
    .setColor(color)
    .setFooter({ text: reward.effectMsg });
}

const COOLDOWN = 60 * 60 * 1000;
const cooldownMap = new Map();
const ALLOWED_ROLE_IDS = ['786128824365482025', '1201856430580432906'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수이벤트')
    .setDescription('60초 선착순 1명만 파랑 정수를 받을 수 있는 깜짝 이벤트!')
    .addChannelOption(opt =>
      opt
        .setName('channel')
        .setDescription('이벤트를 진행할 채널(선택)')
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread
        )
        .setRequired(false)
    ),
  async execute(interaction) {
    const member = interaction.member;
    const userId = interaction.user.id;
    const isManager =
      member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    const hasAllowedRole = member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id));

    if (!isManager && !hasAllowedRole) {
      await interaction.reply({ content: '❌ 특정 역할 또는 관리자만 사용 가능.', ephemeral: true });
      return;
    }

    if (!isManager) {
      const lastUsed = cooldownMap.get(userId) || 0;
      const now = Date.now();
      if (now - lastUsed < COOLDOWN) {
        const left = Math.ceil((COOLDOWN - (now - lastUsed)) / 1000 / 60);
        await interaction.reply({ content: `⏳ 1시간 쿨타임. (남은 시간: ${left}분)`, ephemeral: true });
        return;
      }
      cooldownMap.set(userId, now);
    }

    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    const mePerms = targetChannel.permissionsFor(interaction.client.user);
    const canView = mePerms?.has(PermissionsBitField.Flags.ViewChannel);
    const canSend = mePerms?.has(PermissionsBitField.Flags.SendMessages) || mePerms?.has(PermissionsBitField.Flags.SendMessagesInThreads);
    const canEmbed = mePerms?.has(PermissionsBitField.Flags.EmbedLinks);

    if (!canView || !canSend || !canEmbed) {
      await interaction.reply({
        content: '❌ 선택한 채널에 메시지를 보낼 권한이 없어요. (보기/메시지/임베드 권한 필요)',
        ephemeral: true,
      });
      return;
    }

    const announceEmbed = new EmbedBuilder()
      .setTitle(`🎲 [깜짝 정수 이벤트] 🎲`)
      .setDescription(
        `60초 안에 **가장 먼저** '정수 받기' 버튼을 누르면\n` +
        `💰 *얼마가 나올지 아무도 모름!*\n` +
        `1천만 정수의 주인공이 나올 수도?!\n\n` +
        `참여법: 버튼을 가장 먼저 누르세요!`
      )
      .setColor(0x3b8beb)
      .setFooter({ text: '정수 금액은 수령 후 공개!' });

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gift_event_btn').setLabel(`정수 받기`).setStyle(ButtonStyle.Primary)
    );

    const msg = await targetChannel.send({ embeds: [announceEmbed], components: [btnRow] });

    if (targetChannel.id === interaction.channel.id) {
      await interaction.reply({ content: '이벤트가 시작됐어요! 채팅방을 확인하세요!', ephemeral: true });
    } else {
      await interaction.reply({ content: `이벤트가 <#${targetChannel.id}> 에서 시작됐어요!`, ephemeral: true });
    }

    let claimed = false;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on('collect', async i => {
      if (claimed) {
        if (!i.replied && !i.deferred) {
          await i.reply({ content: '이미 정수가 수령되었습니다!', ephemeral: true });
        }
        return;
      }
      if (i.user.id === userId) {
        if (!i.replied && !i.deferred) {
          await i.reply({ content: '❌ 이벤트 시작자는 참여 불가!', ephemeral: true });
        }
        return;
      }
      claimed = true;
      collector.stop('claimed');

      const reward = pickReward();
      const isDonor = i.member.roles.cache.has(DONOR_ROLE);
      let rewardAmount = reward.amount;
      let donorText = '';
      if (isDonor && rewardAmount < 10000) {
        rewardAmount = 10000;
        donorText = '💜 𝕯𝖔𝖓𝖔𝖗 : 1만원 미만 보상이 **1만원**으로 고정되어 지급됩니다.';
      }

      const reasonChannelName = targetChannel?.name ? `#${targetChannel.name}` : `채널:${targetChannel.id}`;
      try {
        await addBE(
          i.user.id,
          rewardAmount,
          isDonor ? '정수이벤트 (𝕯𝖔𝖓𝖔𝖗 최저보상 적용)' : `정수이벤트 (${reasonChannelName})`
        );
      } catch (err) {
        await i.reply({ content: `BE 지급 중 오류 발생. 관리자에게 문의해 주세요.`, ephemeral: true });
        return;
      }

      await i.update({
        embeds: [getEffectEmbed(i.user, { ...reward, amount: rewardAmount }, isDonor, donorText)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claimed').setLabel('이미 수령됨').setStyle(ButtonStyle.Secondary).setDisabled(true)
          ),
        ],
      });
    });

    collector.on('end', async () => {
      if (!claimed) {
        try {
          await msg.delete();
        } catch {}
      }
    });

    setTimeout(async () => {
      try {
        await msg.edit({
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('expired').setLabel('만료됨').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ),
          ],
        });
      } catch {}
    }, 61000);
  },
};
