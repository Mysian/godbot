// godbot/commands/be-rank.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const bePath = path.join(__dirname, '../data/BE.json');

// 1~3위 이모지
const rankEmoji = ['🥇', '🥈', '🥉'];

function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, '{}');
  return JSON.parse(fs.readFileSync(bePath, 'utf8'));
}

// 금액 포맷 함수 (1억 미만: 숫자, 1억~100억: 약 O억 X천만원, 100억 이상: 자산가)
function formatAmount(n) {
  n = Math.floor(Number(n));
  if (n < 100_000_000) {
    // 1억 미만: 그냥 숫자 표기
    return n.toLocaleString('ko-KR');
  } else if (n >= 10_000_000_000) {
    // 100억 이상: 자산가 표기
    return `100억 이상의 자산가`;
  } else {
    // 1억원 이상~100억 미만: 약 O억 X천만원 (천만원 단위)
    const eok = Math.floor(n / 100_000_000);
    const remain = n % 100_000_000;
    const chonman = Math.floor(remain / 10_000_000);
    if (chonman === 0) {
      return `약 ${eok}억`;
    } else {
      return `약 ${eok}억 ${chonman}천만원`;
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수순위')
    .setDescription('파랑 정수 보유 TOP20 유저를 확인합니다.'),
  async execute(interaction) {
    const be = loadBE();
    const guild = interaction.guild;
    const serverName = guild?.name || '까리한 디스코드';
    const serverIcon = guild?.iconURL() || null;

    // guild 멤버 중 봇 ID 모음
    await guild.members.fetch();
    const botIds = guild.members.cache.filter(m => m.user.bot).map(m => m.user.id);

    // 봇 계정은 제외한 BE만 대상으로 랭킹 계산
    const entries = Object.entries(be)
      .filter(([id]) => !botIds.includes(id));

    // TOP 20만 추출, amount 내림차순
    const sorted = entries
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);

    // 본인 랭킹 찾기
    const userId = interaction.user.id;
    const userEntry = entries
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .findIndex(user => user.id === userId);

    const userRank = userEntry === -1 ? null : userEntry + 1;
    const userAmount = be[userId]?.amount ?? 0;

    // 랭킹 텍스트
    let rankText = sorted.length > 0
      ? sorted.map((user, idx) => {
          const emoji = rankEmoji[idx] || `#${idx+1}`;
          return `${emoji} <@${user.id}> ─ 🔷 **${formatAmount(user.amount)} BE**`;
        }).join('\n')
      : '아직 정수 보유자가 없습니다!';

    // 내 순위/금액 하단 표기
    let myText = '';
    if (userRank) {
      myText = `\n\n👑 **당신의 순위: ${userRank}위 / 보유 BE: ${formatAmount(userAmount)}**`;
    } else {
      myText = `\n\n👑 **당신의 BE 순위 정보가 없습니다.**`;
    }

    // 임베드
    const embed = new EmbedBuilder()
      .setTitle(`🏆 파랑 정수 랭킹 TOP 20`)
      .setDescription(rankText + myText)
      .setColor(0x3399ff)
      .setFooter({
        text: `/정수획득 명령어로 파랑 정수를 획득할 수 있습니다`,
        iconURL: serverIcon || undefined
      });

    if (serverIcon) {
      embed.setAuthor({ name: serverName, iconURL: serverIcon });
      embed.setThumbnail(serverIcon);
    } else {
      embed.setAuthor({ name: serverName });
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};
