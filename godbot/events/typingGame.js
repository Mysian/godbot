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

let rankData = { ko: {}, en: {} };
const ACTIVE = {}; // { userId: { answer, lang, startTime, timeout, finished } }

// 랭킹 파일 불러오기/저장
function loadRank() {
  if (fs.existsSync(DATA_PATH)) {
    rankData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  }
}
function saveRank() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(rankData, null, 2), 'utf8');
}

function getRankArray(lang) {
  const arr = Object.entries(rankData[lang] || {}).map(([id, record]) => ({
    userId: id,
    username: record.username,
    time: record.time,
    cpm: record.cpm,
    wpm: record.wpm,
    acc: record.acc
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

function calcCPM(input, ms) {
  return Math.round((input.length / ms) * 60000);
}
function calcWPM(input, ms, lang) {
  if (lang === 'ko') {
    // 한글은 2자 = 1단어
    const words = Math.max(1, Math.round(input.length / 2));
    return Math.round((words / ms) * 60000);
  } else {
    // 영어는 띄어쓰기 단위
    const words = Math.max(1, input.trim().split(/\s+/).length);
    return Math.round((words / ms) * 60000);
  }
}
function calcACC(target, input) {
  // 정답 기준, 한 글자씩 비교
  let correct = 0;
  for (let i = 0; i < Math.min(target.length, input.length); i++) {
    if (target[i] === input[i]) correct++;
  }
  return ((correct / target.length) * 100).toFixed(1);
}
function firstDiff(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return -1;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    if (message.channel.id !== ALLOWED_CHANNEL) return;

    loadRank();

    // 타자 시작
    if (message.content === '!한타' || message.content === '!영타') {
      if (ACTIVE[message.author.id] && !ACTIVE[message.author.id].finished) {
        return message.reply('이미 진행 중인 타자 게임이 있습니다! 먼저 완료하거나 90초 기다려주세요.');
      }
      const isKo = message.content === '!한타';
      const arr = isKo ? HANGUL : ENGLISH;
      const answer = arr[Math.floor(Math.random() * arr.length)];
      const startTime = Date.now();

      // 90초 제한 타이머
      const timeout = setTimeout(() => {
        if (ACTIVE[message.author.id] && !ACTIVE[message.author.id].finished) {
          message.reply(`⏰ 90초가 지났습니다! 타자 게임이 종료됩니다.`);
          ACTIVE[message.author.id].finished = true;
          delete ACTIVE[message.author.id];
        }
      }, 90 * 1000);

      ACTIVE[message.author.id] = {
        answer,
        lang: isKo ? 'ko' : 'en',
        startTime,
        timeout,
        finished: false
      };
      return message.reply(`아래 문장을 **똑같이** 입력하세요. (90초)\n\`\`\`${answer}\`\`\``);
    }

    // 랭킹
    if (message.content === '!순위') {
      // 기본: 최근 기록 남긴 타입, 없으면 한타
      let lang = 'ko';
      if (rankData.ko[message.author.id] && !rankData.en[message.author.id]) lang = 'ko';
      else if (!rankData.ko[message.author.id] && rankData.en[message.author.id]) lang = 'en';
      else if (rankData.ko[message.author.id] && rankData.en[message.author.id]) {
        lang = (rankData.ko[message.author.id].time <= rankData.en[message.author.id].time) ? 'ko' : 'en';
      }
      const top = getRankArray(lang);
      const myRank = getUserRank(lang, message.author.id);
      const myRec = rankData[lang][message.author.id];

      const embed = new EmbedBuilder()
        .setTitle(`타자 랭킹 TOP20 (${lang === 'ko' ? '한글' : '영문'})`)
        .setColor(0x7a4ef7)
        .setDescription(
          top.length
            ? top.map((e, i) =>
                `${i + 1}. <@${e.userId}> - \`${e.time}s\` | CPM: \`${e.cpm}\` | WPM: \`${e.wpm}\` | ACC: \`${e.acc}%\``
              ).join('\n')
            : '아직 기록이 없습니다!'
        )
        .setFooter({ text: myRank && myRec
          ? `내 순위: ${myRank}위 | 기록: ${myRec.time}s, CPM: ${myRec.cpm}, WPM: ${myRec.wpm}, ACC: ${myRec.acc}%`
          : '아직 기록이 없습니다. 먼저 타자 게임을 완료해보세요!' });

      return message.reply({ embeds: [embed] });
    }

    // 타자 정답 처리
    const game = ACTIVE[message.author.id];
    if (game && !game.finished) {
      if (message.content.startsWith('!')) return; // 명령어 무시
      const now = Date.now();
      if (now - game.startTime > 90 * 1000) {
        clearTimeout(game.timeout);
        game.finished = true;
        delete ACTIVE[message.author.id];
        return;
      }
      if (message.content === game.answer) {
        clearTimeout(game.timeout);
        const ms = now - game.startTime;
        const time = (ms / 1000).toFixed(2);
        const cpm = calcCPM(game.answer, ms);
        const wpm = calcWPM(game.answer, ms, game.lang);
        const acc = calcACC(game.answer, message.content);

        // 기록 갱신: 기존 기록 없거나 더 빠를 때만 저장
        const lang = game.lang;
        const old = rankData[lang][message.author.id];
        if (!old || Number(time) < old.time) {
          rankData[lang][message.author.id] = {
            username: message.author.username,
            time: Number(time),
            cpm,
            wpm,
            acc
          };
          saveRank();
          message.reply(`정답! ⏱️ ${time}초 | CPM: ${cpm} | WPM: ${wpm} | ACC: ${acc}%\n최고 기록이 갱신되었습니다!`);
        } else {
          message.reply(`정답! ⏱️ ${time}초 | CPM: ${cpm} | WPM: ${wpm} | ACC: ${acc}%\n(기존 최고 기록: ${old.time}s)`);
        }
        game.finished = true;
        delete ACTIVE[message.author.id];
      } else {
        // 오타 안내
        const diffIdx = firstDiff(game.answer, message.content);
        let hint;
        if (diffIdx === -1) {
          hint = '길이가 다릅니다.';
        } else {
          hint =
            `정답: \`${game.answer}\`\n` +
            `입력: \`${message.content}\`\n` +
            ' '.repeat(diffIdx + 4) + '↑ 여기서 오타!';
        }
        message.reply(`-# 오타! : [${hint}] 다시 시도하세요!`);
      }
    }
  }
};
