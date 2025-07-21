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
    // TOP 20만 추출, amount 내림차순
    const sorted = Object.entries(be)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);

    // 서버 이름/프사
    const guild = interaction.guild;
    const serverName = guild?.name || '까리한 디스코드';
    const serverIcon = guild?.iconURL() || null;

    // 랭킹 텍스트
    let rankText = sorted.length > 0
      ? sorted.map((user, idx) => {
          const emoji = rankEmoji[idx] || `#${idx+1}`;
          return `${emoji} <@${user.id}> ─ 🔷 **${formatAmount(user.amount)} BE**`;
        }).join('\n')
      : '아직 정수 보유자가 없습니다!';

    // 임베드
    const embed = new EmbedBuilder()
      .setTitle(`🏆 파랑 정수 랭킹 TOP 20`)
      .setDescription(rankText)
      .setColor(0x3399ff)
      .setFooter({
        text: `/정수획득 명령어로 파랑 정수를 획득할 수 있습니다`,
        iconURL: serverIcon || undefined
      });

    // 임베드 상단에 서버 정보 넣기
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
