const { Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const ALLOWED_CHANNEL = '1393477449123106939';
const DATA_PATH = path.join(__dirname, '../data/updown-rank.json');
const { addBE } = require('../commands/be-util.js');

let rankData = {}; // { userId: { username, bestTry, bestClear, clear, lastClear } }
const ACTIVE = {}; // { userId: { answer, chance, tries, finished, startTime, timeout } }

function loadRank() {
  if (fs.existsSync(DATA_PATH)) {
    rankData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  }
}
function saveRank() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(rankData, null, 2), 'utf8');
}

// 순위: bestTry 오름차순 → bestClear 내림차순 → lastClear 오름차순
function getRankArray() {
  const arr = Object.entries(rankData).map(([id, record]) => ({
    userId: id,
    username: record.username,
    bestTry: record.bestTry,
    bestClear: record.bestClear || 0,
    clear: record.clear,
    lastClear: record.lastClear,
  }));
  return arr
    .sort((a, b) => {
      if (a.bestTry !== b.bestTry) return a.bestTry - b.bestTry;
      if ((b.bestClear || 0) !== (a.bestClear || 0)) return b.bestClear - a.bestClear;
      return (a.lastClear || 0) - (b.lastClear || 0);
    })
    .slice(0, 20);
}
function getUserRank(userId) {
  const arr = Object.entries(rankData).map(([id, record]) => ({
    userId: id,
    bestTry: record.bestTry,
    bestClear: record.bestClear || 0,
    lastClear: record.lastClear,
  }))
    .sort((a, b) => {
      if (a.bestTry !== b.bestTry) return a.bestTry - b.bestTry;
      if ((b.bestClear || 0) !== (a.bestClear || 0)) return b.bestClear - a.bestClear;
      return (a.lastClear || 0) - (b.lastClear || 0);
    });
  const idx = arr.findIndex(e => e.userId === userId);
  return idx === -1 ? null : idx + 1;
}

function getHint(answer, guess) {
  const diff = Math.abs(answer - guess);
  if (diff === 0) return '정답!';
  if (diff <= 5) return '제법 가까워!';
  if (diff <= 15) return '조금 가까워요!';
  return '거리가 멀어!';
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    if (message.channel.id !== ALLOWED_CHANNEL) return;

    loadRank();

    // 도움말
    if (message.content === '!도움말') {
      const embed = new EmbedBuilder()
        .setTitle('업다운(숫자 맞추기) 게임 안내')
        .setColor(0x43e8ff)
        .setDescription([
          '**명령어 목록**',
          '```',
          '!업다운       : 게임 시작 (1~100 숫자 중 정답 맞추기)',
          '!업다운 순위  : 업다운 랭킹 확인',
          '!종료         : 내 게임 세션 5초 뒤 종료',
          '!도움말       : 이 도움말 출력',
          '```',
          '',
          '**게임 규칙**',
          '- 1~100 중 랜덤 정답, 기회 5번!',
          '- 숫자를 입력하면 업/다운과 힌트가 제공됨',
          '- 정답 맞히면 랭킹에 기록 (최소 시도 기록·해당 시도 횟수 多 순 1위)',
          '- 여러 명 동시 진행 가능, 각자 기록/세션 관리',
          '- !종료로 내 세션 직접 종료 가능',
          '- 제한시간 3분(180초) 동안 답을 못 맞히면 자동 종료',
        ].join('\n'))
        .setFooter({ text: '갓봇 UpDown | 건의·버그 문의: 이영민' });
      return message.reply({ embeds: [embed] });
    }

    // 게임 시작
    if (message.content === '!업다운') {
      if (ACTIVE[message.author.id] && !ACTIVE[message.author.id].finished) {
        return message.reply(`**${message.author}**: 이미 진행 중인 업다운 게임이 있습니다! 먼저 완료하거나 !종료로 닫아주세요.`);
      }
      const answer = Math.floor(Math.random() * 100) + 1;
      // 제한시간 180초(3분)
      const timeout = setTimeout(() => {
        if (ACTIVE[message.author.id] && !ACTIVE[message.author.id].finished) {
          message.reply(`⏰ **${message.author}**: 3분(180초) 제한시간이 끝났습니다! 업다운 게임이 종료됩니다.`);
          ACTIVE[message.author.id].finished = true;
          delete ACTIVE[message.author.id];
        }
      }, 180 * 1000);

      ACTIVE[message.author.id] = {
        answer,
        chance: 5,
        tries: [],
        finished: false,
        startTime: Date.now(),
        timeout
      };
      return message.reply(`**${message.author}**: 1~100 사이의 숫자 중 **정답**을 5번 안에 맞혀보세요! 숫자를 입력하세요.`);
    }

    // 순위 출력
    if (message.content === '!업다운 순위') {
      const top = getRankArray();
      const myRank = getUserRank(message.author.id);
      const myRec = rankData[message.author.id];

      const embed = new EmbedBuilder()
        .setTitle('업다운 게임 랭킹 TOP20')
        .setColor(0x43e8ff)
        .setDescription(
          top.length
            ? top.map((e, i) =>
                `${i + 1}. <@${e.userId}> - 최소시도: \`${e.bestTry}\` | ${e.bestTry}회 클리어: ${e.bestClear}회 | 총 클리어: ${e.clear || 0}회`
              ).join('\n')
            : '아직 기록이 없습니다!'
        )
        .setFooter({ text: myRank && myRec
          ? `내 순위: ${myRank}위 | 최소시도: ${myRec.bestTry}회, 해당기록: ${myRec.bestClear || 0}회, 총: ${myRec.clear || 0}회`
          : '아직 기록이 없습니다. 먼저 게임을 클리어해보세요!' });

      return message.reply({ embeds: [embed] });
    }

    // 종료 명령어
    if (message.content === '!종료') {
      const game = ACTIVE[message.author.id];
      if (!game || game.finished) return message.reply(`**${message.author}**: 진행 중인 게임이 없습니다.`);
      game.finished = true;
      clearTimeout(game.timeout);
      message.reply(`**${message.author}**: 5초 뒤에 업다운 게임 세션이 종료됩니다...`);
      setTimeout(() => {
        if (ACTIVE[message.author.id]) {
          message.channel.send(`**${message.author}**: 업다운 게임이 종료되었습니다.`);
          delete ACTIVE[message.author.id];
        }
      }, 5000);
      return;
    }

    // 진행 중 게임 처리
    const game = ACTIVE[message.author.id];
    if (game && !game.finished) {
      // 숫자 판별
      const guess = parseInt(message.content.trim());
      if (isNaN(guess) || guess < 1 || guess > 100) return;
      if (game.tries.includes(guess)) {
        return message.reply(`**${message.author}**: 이미 시도한 숫자입니다. 다른 숫자를 입력하세요!`);
      }
      game.tries.push(guess);
      game.chance--;

      if (guess === game.answer) {
        // 정답
        game.finished = true;
        clearTimeout(game.timeout);
        const tryCount = game.tries.length;
        const now = Date.now();

        // 기록 갱신
        const old = rankData[message.author.id];
        // bestClear = 최소 시도 기록으로 성공한 횟수
        if (
          !old ||
          tryCount < old.bestTry
        ) {
          rankData[message.author.id] = {
            username: message.author.username,
            bestTry: tryCount,
            bestClear: 1,
            clear: (old ? (old.clear || 0) + 1 : 1),
            lastClear: now
          };
        } else if (tryCount === old.bestTry) {
          rankData[message.author.id].bestClear = (old.bestClear || 0) + 1;
          rankData[message.author.id].clear = (old.clear || 0) + 1;
          rankData[message.author.id].lastClear = now;
        } else {
          // bestTry보다 더 많이 쓴 경우, 총 클리어/마지막 갱신만 증가
          rankData[message.author.id].clear = (old.clear || 0) + 1;
          rankData[message.author.id].lastClear = now;
        }
        saveRank();

        const member = await message.guild.members.fetch(message.author.id);
  if (member.roles.cache.has("1397076919127900171")) {
    let beReward = 0;
    if (tryCount === 1) beReward = 1000;
    else if (tryCount === 2) beReward = 500;
    else if (tryCount === 3) beReward = 250;
    else if (tryCount === 4) beReward = 100;
    else beReward = 50;

    await addBE(message.author.id, beReward, `업다운 게임(도우너) 시도 ${tryCount}회 만에 성공 보상`);
    await message.reply(`💜 𝕯𝖔𝖓𝖔𝖗 혜택: 파랑정수 ${beReward} BE가 지급되었습니다!`);
  }

  return message.reply(
    `🎉 **${message.author}**: 정답! (${tryCount}번 만에 성공)\n랭킹에 기록되었습니다!\n!업다운 순위로 내 순위를 확인해보세요!`
  );
} else {
        // 힌트
        let res, hint;
        if (guess < game.answer) {
          res = '업!';
        } else {
          res = '다운!';
        }
        hint = getHint(game.answer, guess);

        if (game.chance === 0) {
          game.finished = true;
          clearTimeout(game.timeout);
          return message.reply(`❌ **${message.author}**: 기회 소진! 정답은 **${game.answer}**였습니다.\n다시 도전하려면 !업다운을 입력하세요.`);
        } else {
          return message.reply(`**${message.author}**: ${res} (${hint}) 남은 기회: ${game.chance}번`);
        }
      }
    }
  }
};
