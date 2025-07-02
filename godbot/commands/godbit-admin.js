const {
  SlashCommandBuilder, EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const coinsPath   = path.join(__dirname, '../data/godbit-coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');
const NOTICE_CHANNEL_ID = '1389821392618262631';

// ---- 빠른 JSON I/O ----
async function loadJson(file, def) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  finally { await release(); }
  return data;
}
async function saveJson(file, data) {
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  finally { await release(); }
}
function toKSTString(utcOrDate) {
  if (!utcOrDate) return '-';
  try {
    return new Date(utcOrDate).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch {
    return '-';
  }
}

// ---- 명령어 등록 ----
module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트관리')
    .setDescription('갓비트 관리자 전용 명령어')
    .addSubcommand(sub =>
      sub.setName('조정')
        .setDescription('코인 전체적 흐름(변동성) 조정')
        .addStringOption(opt =>
          opt.setName('흐름').setDescription('변동성 옵션').setRequired(true)
            .addChoices(
              { name: '하이리스크 하이리턴', value: 'high' },
              { name: '균형 잡힌', value: 'balance' },
              { name: '안전한', value: 'safe' },
              { name: '불규칙적인', value: 'chaos' }
            )
        )
        .addStringOption(opt =>
          opt.setName('코인명').setDescription('코인명(선택)').setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('지급')
        .setDescription('특정 유저에게 특정 코인 지급')
        .addUserOption(opt => opt.setName('유저').setDescription('지급 대상').setRequired(true))
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('수량').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('초기화')
        .setDescription('코인 시장 전체 초기화(까리코인만 남음)')
    )
    .addSubcommand(sub =>
      sub.setName('상장')
        .setDescription('특정 코인 상장')
        .addStringOption(opt => opt.setName('코인명').setDescription('상장할 코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('상장폐지')
        .setDescription('특정 코인 상장폐지')
        .addStringOption(opt => opt.setName('코인명').setDescription('상장폐지할 코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('옵션')
        .setDescription('상장폐지 확률/기준 등 옵션 설정')
        .addStringOption(opt =>
          opt.setName('폐지기준').setDescription('폐지 옵션').setRequired(true)
            .addChoices(
              { name: '수익 저조시', value: 'profitlow' },
              { name: '랜덤 확률', value: 'random' }
            )
        )
        .addIntegerOption(opt =>
          opt.setName('확률').setDescription('랜덤 폐지 확률(%)').setMinValue(1).setMaxValue(100).setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('우상향')
        .setDescription('특정 코인을 우상향 목록에 추가')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('우상향삭제')
        .setDescription('특정 코인을 우상향 목록에서 제거')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('우하향')
        .setDescription('특정 코인을 우하향 목록에 추가')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('우하향삭제')
        .setDescription('특정 코인을 우하향 목록에서 제거')
        .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
  sub.setName('떡상')
    .setDescription('특정 코인을 입력한 금액까지 점진적/자연스럽게 떡상시킴')
    .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    .addIntegerOption(opt => opt.setName('금액').setDescription('목표 금액').setMinValue(1).setRequired(true))
)
.addSubcommand(sub =>
  sub.setName('떡락')
    .setDescription('특정 코인을 입력한 금액까지 점진적/자연스럽게 떡락시킴')
    .addStringOption(opt => opt.setName('코인명').setDescription('코인명').setRequired(true))
    .addIntegerOption(opt => opt.setName('금액').setDescription('목표 금액').setMinValue(1).setRequired(true))
)
    .addSubcommand(sub =>
      sub.setName('상태')
        .setDescription('갓비트 코인 시스템 전체 현황/세팅 상태를 확인')
    ),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has('Administrator')) {
      return interaction.reply({ content: '❌ 관리자만 실행 가능합니다.', ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const client = interaction.client;

    if (sub === '조정') {
      const coin = interaction.options.getString('코인명');
      const mode = interaction.options.getString('흐름');
      const coins = await loadJson(coinsPath, {});
      let changed = 0;
      const setMode = (info, mode) => {
        if (mode === 'high') info.volatility = { min: 0.2, max: 0.5 };
        else if (mode === 'balance') info.volatility = { min: 0.07, max: 0.15 };
        else if (mode === 'safe') info.volatility = { min: 0.01, max: 0.05 };
        else if (mode === 'chaos') info.volatility = { min: -0.5, max: 0.5 };
      };
      if (coin) {
        if (!coins[coin]) return interaction.reply({ content: `❌ 해당 코인 없음: ${coin}`, ephemeral: true });
        setMode(coins[coin], mode);
        changed = 1;
      } else {
        for (const [name, info] of Object.entries(coins)) {
          setMode(info, mode);
          changed++;
        }
        let vopt = { min: 0.07, max: 0.15 };
        if (mode === 'high') vopt = { min: 0.2, max: 0.5 };
        else if (mode === 'balance') vopt = { min: 0.07, max: 0.15 };
        else if (mode === 'safe') vopt = { min: 0.01, max: 0.05 };
        else if (mode === 'chaos') vopt = { min: -0.5, max: 0.5 };
        coins._volatilityGlobal = vopt;
      }
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `✅ ${changed}개 코인에 변동성 옵션 [${mode}] 적용됨!`, ephemeral: true });
    }

    if (sub === '지급') {
      const user = interaction.options.getUser('유저');
      const coin = interaction.options.getString('코인');
      const qty = interaction.options.getInteger('수량');
      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});
      if (!coins[coin]) return interaction.reply({ content: `❌ 상장된 코인만 지급 가능: ${coin}`, ephemeral: true });

      wallets[user.id] = wallets[user.id] || {};
      wallets[user.id][coin] = (wallets[user.id][coin] || 0) + qty;
      await saveJson(walletsPath, wallets);
      return interaction.reply({ content: `✅ ${user.username}님에게 ${coin} ${qty}개 지급 완료!`, ephemeral: true });
    }

    if (sub === '초기화') {
      const now = new Date().toISOString();
      const newCoins = {
        '까리코인': {
          price: 1000,
          history: [1000],
          historyT: [now],
          listedAt: now
        }
      };
      await saveJson(coinsPath, newCoins);
      await saveJson(walletsPath, {});
      return interaction.reply({ content: '✅ 코인판이 완전히 초기화되었습니다! (까리코인만 남음)', ephemeral: true });
    }

    // === [여기부터 로그 메시지!] ===
    if (sub === '상장') {
  const coin = interaction.options.getString('코인명');
  const coins = await loadJson(coinsPath, {});

  if (coins[coin] && !coins[coin].delistedAt) {
    // 이미 상장 중인 코인
    return interaction.reply({ content: `❌ 이미 상장 중인 코인: ${coin}`, ephemeral: true });
  }

  let now = new Date().toISOString();
  let vopt = coins._volatilityGlobal || null;

  if (coins[coin] && coins[coin].delistedAt) {
    // 상폐 코인 "부활"!
    coins[coin].delistedAt = null;
    coins[coin].listedAt = now;
    coins[coin]._alreadyRevived = true; // 부활 표시(선택)

    coins[coin].price = Math.floor(800 + Math.random()*700);
    coins[coin].history = [coins[coin].price];
    coins[coin].historyT = [now];
  } else {
    // 완전 신규 상장
    let info = {
      price: Math.floor(800 + Math.random()*700),
      history: [],
      historyT: [],
      listedAt: now,
      delistedAt: null
    };
    if (vopt) info.volatility = vopt;
    info.history.push(info.price);
    info.historyT.push(now);
    coins[coin] = info;
  }

  await saveJson(coinsPath, coins);

  // ✅ 상장(또는 부활) 로그 메시지 전송
  const noticeChannel = client.channels.cache.get(NOTICE_CHANNEL_ID);
  if (noticeChannel) {
    await noticeChannel.send(
      coins[coin]._alreadyRevived
        ? `♻️ **${coin}** 코인이 부활상장되었습니다. (${toKSTString(now)})`
        : `✅ **${coin}** 코인이 상장되었습니다. (${toKSTString(now)})`
    );
  }

  return interaction.reply({
    content: coins[coin]._alreadyRevived
      ? `♻️ 코인 [${coin}]이 부활상장되었습니다!`
      : `✅ 코인 [${coin}]이 상장되었습니다!`,
    ephemeral: true
  });
}


    if (sub === '상장폐지') {
      const coin = interaction.options.getString('코인명');
      const coins = await loadJson(coinsPath, {});
      if (!coins[coin]) return interaction.reply({ content: `❌ 해당 코인 없음: ${coin}`, ephemeral: true });
      const now = new Date().toISOString();
      coins[coin].delistedAt = now;
      await saveJson(coinsPath, coins);

      // ⛔ 폐지 로그 메시지 전송
      const noticeChannel = client.channels.cache.get(NOTICE_CHANNEL_ID);
      if (noticeChannel) {
        await noticeChannel.send(`⛔ **${coin}** 코인이 폐지되었습니다. (${toKSTString(now)})`);
      }

      return interaction.reply({ content: `✅ 코인 [${coin}]이 상장폐지 되었습니다!`, ephemeral: true });
    }
    // === [여기까지 로그 메시지!] ===

    if (sub === '옵션') {
      const standard = interaction.options.getString('폐지기준');
      const prob = interaction.options.getInteger('확률') || null;
      const coins = await loadJson(coinsPath, {});
      coins._delistOption = { type: standard, prob };
      await saveJson(coinsPath, coins);
      let msg = `상장폐지 기준이 [${standard}]${prob ? `, 확률 ${prob}%` : ''}로 설정됨.`;
      return interaction.reply({ content: '✅ '+msg, ephemeral: true });
    }

    if (sub === '우상향') {
      const coin = interaction.options.getString('코인명');
      const coins = await loadJson(coinsPath, {});
      coins._uptrend = coins._uptrend || [];
      if (!coins[coin]) return interaction.reply({ content: `❌ 해당 코인 없음: ${coin}`, ephemeral: true });
      if (!coins._uptrend.includes(coin)) coins._uptrend.push(coin);
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `✅ [${coin}]을 우상향 코인에 추가!`, ephemeral: true });
    }
    if (sub === '우상향삭제') {
      const coin = interaction.options.getString('코인명');
      const coins = await loadJson(coinsPath, {});
      coins._uptrend = coins._uptrend || [];
      coins._uptrend = coins._uptrend.filter(x => x !== coin);
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `✅ [${coin}]을 우상향 코인에서 제거!`, ephemeral: true });
    }
    if (sub === '우하향') {
      const coin = interaction.options.getString('코인명');
      const coins = await loadJson(coinsPath, {});
      coins._downtrend = coins._downtrend || [];
      if (!coins[coin]) return interaction.reply({ content: `❌ 해당 코인 없음: ${coin}`, ephemeral: true });
      if (!coins._downtrend.includes(coin)) coins._downtrend.push(coin);
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `✅ [${coin}]을 우하향 코인에 추가!`, ephemeral: true });
    }
    if (sub === '우하향삭제') {
      const coin = interaction.options.getString('코인명');
      const coins = await loadJson(coinsPath, {});
      coins._downtrend = coins._downtrend || [];
      coins._downtrend = coins._downtrend.filter(x => x !== coin);
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `✅ [${coin}]을 우하향 코인에서 제거!`, ephemeral: true });
    }
    if (sub === '떡상' || sub === '떡락') {
  const coin = interaction.options.getString('코인명');
  const target = interaction.options.getInteger('금액');
  const coins = await loadJson(coinsPath, {});
  if (!coins[coin]) return interaction.reply({ content: `❌ 해당 코인 없음: ${coin}`, ephemeral: true });

  let now = coins[coin].price;
  if (sub === '떡상' && target <= now)
    return interaction.reply({ content: `❌ 현재 가격(${now})보다 높은 금액을 입력해 주세요!`, ephemeral: true });
  if (sub === '떡락' && target >= now)
    return interaction.reply({ content: `❌ 현재 가격(${now})보다 낮은 금액을 입력해 주세요!`, ephemeral: true });

  // 점진적/자연스러운 흐름 생성 (진짜 차트처럼 히스토리 생성)
  let steps = Math.min(20, Math.abs(target - now)); // 최대 20스텝
  let data = [];
  for (let i = 1; i <= steps; i++) {
    let ratio = i / steps;
    // 곡선 느낌(저항/반등)
    let wave = 1 + (Math.sin(i / 2) * 0.06 * Math.random());
    if (sub === '떡상') {
      let price = Math.round(now + (target - now) * ratio * wave);
      if (i < steps && price > target) price = target - Math.floor(Math.random() * 3);
      data.push(price);
    } else {
      let price = Math.round(now - (now - target) * ratio * wave);
      if (i < steps && price < target) price = target + Math.floor(Math.random() * 3);
      data.push(price);
    }
  }

  // 히스토리 및 가격에 반영
  let tNow = new Date();
  for (let i = 0; i < data.length; i++) {
    coins[coin].price = data[i];
    coins[coin].history = coins[coin].history || [];
    coins[coin].historyT = coins[coin].historyT || [];
    coins[coin].history.push(data[i]);
    coins[coin].historyT.push(new Date(tNow.getTime() + i * 60 * 1000).toISOString());
    while (coins[coin].history.length > 100) coins[coin].history.shift();
    while (coins[coin].historyT.length > 100) coins[coin].historyT.shift();
  }
  coins[coin].price = target; // 마지막은 정확하게 맞추기
  await saveJson(coinsPath, coins);

  return interaction.reply({
    content: `✅ **${coin}** 코인이 ${sub === '떡상' ? '떡상' : '떡락'}해 ${target} BE까지 도달했습니다!`,
    ephemeral: true
  });
}
    if (sub === '상태') {
      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});
      const volatility = coins._volatilityGlobal
        ? `[${Object.entries(coins._volatilityGlobal).map(([k,v])=>`${k}: ${v}`).join(', ')}]`
        : '기본(0.07~0.15)';
      const delistOpt = coins._delistOption || { type: 'profitlow', prob: 10 };
      const uptrend = coins._uptrend || [];
      const downtrend = coins._downtrend || [];
      const alive = Object.entries(coins).filter(([name, info]) =>
        !name.startsWith('_') && !info.delistedAt
      );
      const delisted = Object.entries(coins).filter(([name, info]) =>
        !name.startsWith('_') && !!info.delistedAt
      );
      const embed = new EmbedBuilder()
        .setTitle('💼 갓비트 관리 시스템 현황')
        .addFields(
          { name: '변동성 옵션', value: volatility, inline: true },
          { name: '상장폐지 옵션', value: `기준: ${delistOpt.type}${delistOpt.prob ? `, 확률: ${delistOpt.prob}%` : ''}`, inline: true },
          { name: '우상향 코인', value: uptrend.length ? uptrend.join(', ') : '없음', inline: false },
          { name: '우하향 코인', value: downtrend.length ? downtrend.join(', ') : '없음', inline: false },
          { name: '상장 코인 수', value: `${alive.length}개`, inline: true },
          { name: '상장폐지 코인 수', value: `${delisted.length}개`, inline: true }
        )
        .setColor('#00C9FF')
        .setTimestamp();
      if (alive.length) {
        embed.addFields({
          name: '상장 코인',
          value: alive.slice(0, 15).map(
            ([name, info]) => `- ${name} (${info.price} BE)`
          ).join('\n') + (alive.length > 15 ? '\n외 ' + (alive.length-15) + '개...' : ''),
          inline: false
        });
      }
      if (delisted.length) {
        embed.addFields({
          name: '폐지 코인',
          value: delisted.slice(0, 10).map(
            ([name, info]) => `- ${name} (${info.delistedAt ? info.delistedAt.split('T')[0] : '-'})`
          ).join('\n') + (delisted.length > 10 ? '\n외 ' + (delisted.length-10) + '개...' : ''),
          inline: false
        });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
