const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const donorRolesPath = path.join(__dirname, '../data/donor_roles.json');
const itemDonationsPath = path.join(__dirname, '../data/item_donations.json');

function loadDonorRoles() {
  if (!fs.existsSync(donorRolesPath)) return {};
  return JSON.parse(fs.readFileSync(donorRolesPath, 'utf8'));
}
function loadItemDonations() {
  if (!fs.existsSync(itemDonationsPath)) return [];
  return JSON.parse(fs.readFileSync(itemDonationsPath, 'utf8'));
}
function formatDateKST(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}
function getDaysLeft(dateStr) {
  if (!dateStr) return 0;
  const now = new Date();
  const end = new Date(dateStr);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
function getTimeLeftString(dateStr) {
  if (!dateStr) return '-';
  const now = new Date();
  const end = new Date(dateStr);
  let diff = end.getTime() - now.getTime();
  if (diff <= 0) return '만료됨';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  diff -= days * 1000 * 60 * 60 * 24;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  diff -= hours * 1000 * 60 * 60;
  const minutes = Math.floor(diff / (1000 * 60));
  return `${days}일 ${hours}시간 ${minutes}분`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('후원확인')
    .setDescription('자신의 후원 현황/역할/남은 혜택 기간을 확인합니다.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const donorData = loadDonorRoles();
    const itemDonations = loadItemDonations();
    const userMoney = donorData[userId];
    const userItems = itemDonations.filter(x => x.userId === userId);

    let embed = new EmbedBuilder()
      .setTitle('🎁 내 후원 현황')
      .setDescription([
        '💡 후원 내역과 관련 정보입니다.',
        '※ 서버에 힘이 되어주셔서 감사합니다.',
        '※ 후원 혜택(역할) 만료 시 자동으로 사라집니다.'
      ].join('\n'))
      .setColor(0x9be7ff);

    // 후원금 내역
    if (userMoney) {
      const expires = formatDateKST(userMoney.expiresAt);
      const daysLeft = getDaysLeft(userMoney.expiresAt);
      const timeLeft = getTimeLeftString(userMoney.expiresAt);
      embed.addFields({
        name: `💸 후원자 역할(혜택)`,
        value: [
          `만료일: \`${expires}\``,
          `남은 기간: **${timeLeft}**`
        ].join('\n'),
        inline: false
      });
    } else {
      embed.addFields({
        name: `💸 후원자 역할(혜택)`,
        value: `보유하지 않음 (또는 만료됨)`,
        inline: false
      });
    }

    // 상품 후원 내역 (최근 10건만)
    if (userItems.length > 0) {
      const itemsToShow = userItems.slice(-10); // 최근 10건만
      embed.addFields({
        name: `🎁 내 상품 후원 내역`,
        value: itemsToShow.map((item, idx) => [
          `#${userItems.length - itemsToShow.length + idx + 1}. \`${item.item}\``,
          item.reason ? `- 사유: ${item.reason}` : '',
          item.situation ? `- 희망상황: ${item.situation}` : '',
          `- 후원일: ${formatDateKST(item.date)}`
        ].filter(Boolean).join('\n')).join('\n\n') +
        (userItems.length > 10 ? `\n\n...외 ${userItems.length - 10}건 더 있습니다.` : ''),
        inline: false
      });
    } else {
      embed.addFields({
        name: `🎁 내 상품 후원 내역`,
        value: '없음',
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
