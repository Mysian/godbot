const { Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const ALLOWED_CHANNEL = '1393421229083328594';
const DATA_PATH = path.join(__dirname, '../data/typing-rank.json');

const HANGUL = [
  "까리한 디스코드에서 즐거운 시간 보내세요.",
  "타자 연습은 집중력 향상에 좋아요.",
  "오늘도 멋진 하루 되세요!",
  "이 문장을 똑같이 입력해 보세요.",
  "재미있는 게임을 친구들과 함께 즐기세요.",
  "최고의 실력을 보여주세요!"
];
const ENGLISH = [
  "Practice makes perfect.",
  "Welcome to the cool Discord server.",
  "Type this sentence exactly.",
  "Have a wonderful day!",
  "Show off your best typing speed.",
  "Enjoy the game with your friends!"
];

const ACTIVE = {}; // { channelId: { answer, lang, startTime, userId } }
let rankData = { ko: {}, en: {} };

// 랭킹 파일 불러오기/저장
function loadRank() {
  if (fs.existsSync(DATA_PATH)) {
    rankData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  }
}
function saveRank() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(rankData, null, 2), 'utf8');
}

// 랭킹 TOP20
function getRankArray(lang) {
  const arr = Object.entries(rankData[lang] || {}).map(([id, record]) => ({
    userId: id,
    username: record.username,
    time: record.time
  }));
  return arr.sort((a, b) => a.time - b.time).slice(0, 20);
}
function getUserRank(lang, userId) {
  const arr = Object.entries(rankData[lang] || {}).map(([id, record]) => ({
    userId: id,
    time: record.time
  })).sort((a, b) => a.time - b.time);
  const idx = arr.findIndex(e => e.userId === userId);
  return idx === -1 ? null : idx + 1;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    if (message.channel.id !== ALLOWED_CHANNEL) return;

    loadRank();

    // ----- 명령어 처리 -----
    if (message.content === '!한타' || message.content === '!영타') {
      if (ACTIVE[message.channel.id]) {
        return message.reply('이미 타자 게임이 진행 중입니다! 먼저 끝내주세요.');
      }
      const isKo = message.content === '!한타';
      const arr = isKo ? HANGUL : ENGLISH;
      const answer = arr[Math.floor(Math.random() * arr.length)];
      ACTIVE[message.channel.id] = {
        answer,
        lang: isKo ? 'ko' : 'en',
        startTime: Date.now(),
        userId: null
      };
      return message.reply(`타자 연습 시작!\n아래 문장을 **똑같이** 입력해 보세요:\n\`\`\`${answer}\`\`\``);
    }

    // ----- 랭킹 -----
    if (message.content === '!순위') {
      // 한타/영타 구분: 최근 기록 남긴 타입이 있으면 해당 타입, 없으면 한타 기본
      let lang = 'ko';
      if (rankData.ko[message.author.id] && !rankData.en[message.author.id]) lang = 'ko';
      else if (!rankData.ko[message.author.id] && rankData.en[message.author.id]) lang = 'en';
      else if (rankData.ko[message.author.id] && rankData.en[message.author.id]) {
        lang = (rankData.ko[message.author.id].time <= rankData.en[message.author.id].time) ? 'ko' : 'en';
      }
      const top = getRankArray(lang);
      const myRank = getUserRank(lang, message.author.id);
      const myTime = rankData[lang][message.author.id]?.time;

      const embed = new EmbedBuilder()
        .setTitle(`타자 랭킹 TOP20 (${lang === 'ko' ? '한글' : '영문'})`)
        .setColor(0x7a4ef7)
        .setDescription(
          top.length
            ? top.map((e, i) => `${i + 1}. <@${e.userId}> - \`${e.time}s\``).join('\n')
            : '아직 기록이 없습니다!'
        )
        .setFooter({ text: myRank
          ? `내 순위: ${myRank}위 | 기록: ${myTime}s`
          : '아직 기록이 없습니다. 먼저 타자 게임을 완료해보세요!' });

      return message.reply({ embeds: [embed] });
    }

    // ----- 게임 정답 처리 -----
    const game = ACTIVE[message.channel.id];
    if (game) {
      if (message.content.startsWith('!')) return; // 명령어는 무시
      if (message.content === game.answer) {
        const time = ((Date.now() - game.startTime) / 1000).toFixed(2);
        // 기록 갱신: 기존 기록 없거나 더 빠를 때만 저장
        const lang = game.lang;
        const old = rankData[lang][message.author.id];
        if (!old || Number(time) < old.time) {
          rankData[lang][message.author.id] = {
            username: message.author.username,
            time: Number(time)
          };
          saveRank();
          message.reply(`정답! ⏱️ ${time}초\n최고 기록이 갱신되었습니다!`);
        } else {
          message.reply(`정답! ⏱️ ${time}초\n(기존 최고 기록: ${old.time}s)`);
        }
        delete ACTIVE[message.channel.id];
      } else {
        message.reply('오타! 다시 입력해 보세요.');
      }
    }
  }
};
