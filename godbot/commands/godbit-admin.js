const {
  SlashCommandBuilder, EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const coinsPath   = path.join(__dirname, '../data/godbit-coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');

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

// ---- 명령어 등록 ----
module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트관리')
    .setDescription('갓비트 관리자 전용 명령어')
    // 코인 흐름 조정
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
    // 특정 유저에게 특정 코인 지급
    .addSubcommand(sub =>
      sub.setName('지급')
        .setDescription('특정 유저에게 특정 코인 지급')
        .addUserOption(opt => opt.setName('유저').setDescription('지급 대상').setRequired(true))
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('수량').setMinValue(1).setRequired(true))
    )
    // 시장 완전 초기화
    .addSubcommand(sub =>
      sub.setName('초기화')
        .setDescription('코인 시장 전체 초기화(까리코인만 남음)')
    )
    // 상장
    .addSubcommand(sub =>
      sub.setName('상장')
        .setDescription('특정 코인 상장')
        .addStringOption(opt => opt.setName('코인명').setDescription('상장할 코인명').setRequired(true))
    )
    // 상장폐지
    .addSubcommand(sub =>
      sub.setName('상장폐지')
        .setDescription('특정 코인 상장폐지')
        .addStringOption(opt => opt.setName('코인명').setDescription('상장폐지할 코인명').setRequired(true))
    )
    // 상장폐지 옵션 설정
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
    // 우상향/우하향 관리
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
    ),

  async execute(interaction) {
    // 관리자 권한 체크
    if (!interaction.memberPermissions?.has('Administrator')) {
      return interaction.reply({ content: '❌ 관리자만 실행 가능합니다.', ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();

    // --- 흐름(변동성) 조정 ---
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
        // 전체 적용
        for (const [name, info] of Object.entries(coins)) {
          setMode(info, mode);
          changed++;
        }
        // ⭐ 글로벌 옵션도 저장!
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

    // --- 특정 유저에게 코인 지급 ---
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

    // --- 시장 완전 초기화 ---
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

    // --- 상장 ---
    if (sub === '상장') {
      const coin = interaction.options.getString('코인명');
      const coins = await loadJson(coinsPath, {});
      if (coins[coin]) return interaction.reply({ content: `❌ 이미 존재하는 코인: ${coin}`, ephemeral: true });

      let now = new Date().toISOString();
      let vopt = coins._volatilityGlobal || null;
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
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `✅ 코인 [${coin}]이 상장되었습니다!`, ephemeral: true });
    }

    // --- 상장폐지 ---
    if (sub === '상장폐지') {
      const coin = interaction.options.getString('코인명');
      const coins = await loadJson(coinsPath, {});
      if (!coins[coin]) return interaction.reply({ content: `❌ 해당 코인 없음: ${coin}`, ephemeral: true });
      coins[coin].delistedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      await saveJson(coinsPath, coins);
      return interaction.reply({ content: `✅ 코인 [${coin}]이 상장폐지 되었습니다!`, ephemeral: true });
    }

    // --- 옵션(폐지 기준/확률) ---
    if (sub === '옵션') {
      const standard = interaction.options.getString('폐지기준');
      const prob = interaction.options.getInteger('확률') || null;

      const coins = await loadJson(coinsPath, {});
      coins._delistOption = { type: standard, prob };
      await saveJson(coinsPath, coins);

      let msg = `상장폐지 기준이 [${standard}]${prob ? `, 확률 ${prob}%` : ''}로 설정됨.`;
      return interaction.reply({ content: '✅ '+msg, ephemeral: true });
    }

    // --- 우상향/우하향 관리 ---
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
  }
};
