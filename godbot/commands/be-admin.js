// commands/be-admin.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { loadConfig, saveConfig } = require('./be-util');

const couponsPath = path.join(__dirname, '../data/coupons.json');
const gamesPath = path.join(__dirname, '../data/be-games.json');

function ensureFile(p, def) { if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(def ?? {}, null, 2)); }
function loadCoupons() { ensureFile(couponsPath, {}); return JSON.parse(fs.readFileSync(couponsPath, 'utf8')); }
function saveCoupons(d) { fs.writeFileSync(couponsPath, JSON.stringify(d, null, 2)); }
function loadGames() { ensureFile(gamesPath, {}); return JSON.parse(fs.readFileSync(gamesPath, 'utf8')); }
function saveGames(d) { fs.writeFileSync(gamesPath, JSON.stringify(d, null, 2)); }

function toKST(ts) { const d = new Date(ts + 9 * 60 * 60 * 1000); return d.toISOString().replace('T',' ').slice(0,19); }
function normalizeCode(raw) { const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (s.length !== 16) return null; return s.match(/.{1,4}/g).join('-'); }
function randomCode() { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let s = ''; for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s.match(/.{1,4}/g).join('-'); }
function randomNonce(len=10){ const chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let s=''; for(let i=0;i<len;i++) s+=chars[Math.floor(Math.random()*chars.length)]; return s; }

function isCouponValid(c) {
  if (!c) return false;
  if (c.canceled) return false;
  if (Date.now() > c.expiresAt) return false;
  if (c.mode === 'single_use' && c.usedCount >= 1) return false;
  if (c.mode === 'limited_total' && c.totalLimit !== null && c.usedCount >= c.totalLimit) return false;
  return true;
}

async function replyCouponEphemeral(i, code, amount, expiresAt) {
  const e = new EmbedBuilder()
    .setTitle('🎟️ 쿠폰 안내')
    .setColor(0x00b894)
    .setDescription(`아래 쿠폰을 \`/정수획득\` 명령어로 사용하면 **${amount.toLocaleString('ko-KR')} BE**가 지급됩니다.\n만료: **${toKST(expiresAt)}**`)
    .addFields({ name: '쿠폰 번호', value: `\`\`\`fix\n${code}\n\`\`\`` });
  return i.reply({ embeds: [e], ephemeral: true });
}

function claimableMessage(c) {
  if (!c) return '쿠폰 정보를 찾을 수 없습니다.';
  if (c.canceled) return '해당 쿠폰은 취소되어 다시 확인할 수 없습니다.';
  if (Date.now() > c.expiresAt) return '해당 쿠폰은 만료되어 다시 확인할 수 없습니다.';
  if (c.mode === 'single_use' && c.usedCount >= 1) return '해당 쿠폰은 이미 사용되어 다시 확인할 수 없습니다.';
  if (c.mode === 'limited_total' && c.totalLimit !== null && c.usedCount >= c.totalLimit) return '해당 쿠폰은 사용 한도 소진으로 다시 확인할 수 없습니다.';
  return null;
}

async function handleBeGameInteraction(i) {
  if (!i.isButton()) return;
  const id = i.customId || '';
  if (!id.startsWith('beGame:')) return;
  const parts = id.split(':');
  const nonce = parts[1];
  const choice = parts[2];
  const games = loadGames();
  const g = games[nonce];
  if (!g) return i.reply({ content: '이 게임은 더 이상 유효하지 않습니다.', ephemeral: true });
  if (g.closed) return i.reply({ content: '이 게임은 마감되었습니다.', ephemeral: true });
  if (!g.messageId || i.message.id !== g.messageId) return i.reply({ content: '이 버튼은 유효하지 않습니다.', ephemeral: true });

  const uid = i.user.id;
  const coupons = loadCoupons();

  if (!g.attempted) g.attempted = {};
  if (!g.claims) g.claims = {};

  if (g.claims[uid]) {
    const code = g.claims[uid];
    const c = coupons[code];
    const msg = claimableMessage(c);
    if (msg) return i.reply({ content: msg, ephemeral: true });
    return replyCouponEphemeral(i, c.code, c.amount, c.expiresAt);
  }

  if (g.attempted[uid]) {
    return i.reply({ content: '이미 이 게임에 참여하셨습니다. (유저당 1회)', ephemeral: true });
  }

  g.attempted[uid] = true;
  saveGames(games);

  const correct = choice === g.answer;
  if (!correct) {
    return i.reply({ content: '아쉽지만 오답입니다. 다음 기회에!', ephemeral: true });
  }

  let code; do { code = randomCode(); } while (coupons[code]);
  const now = Date.now();
  const expiresAt = now + (g.days * 24 * 60 * 60 * 1000);

  coupons[code] = {
    code,
    amount: g.reward,
    mode: 'single_use',
    totalLimit: null,
    usedCount: 0,
    usedBy: [],
    perUserLimit: null,
    creatorId: g.creatorId,
    createdAt: now,
    expiresAt,
    canceled: false,
    note: `정수게임(${g.title}) 정답자 보상`
  };
  saveCoupons(coupons);

  g.claims[uid] = code;
  saveGames(games);

  return replyCouponEphemeral(i, code, g.reward, expiresAt);
}

let handlerRegistered = false;
function registerBeGameHandler(client) {
  if (handlerRegistered) return;
  handlerRegistered = true;
  client.on('interactionCreate', handleBeGameInteraction);
}

module.exports = {
  registerBeGameHandler,
  data: new SlashCommandBuilder()
    .setName('정수관리')
    .setDescription('정수 송금 수수료와 쿠폰을 관리합니다. (관리자만)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc =>
      sc.setName('수수료')
        .setDescription('정수 송금 수수료율(%) 설정')
        .addIntegerOption(opt => opt.setName('수수료').setDescription('송금 수수료율(%)').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('쿠폰발급')
        .setDescription('정수 쿠폰 발급')
        .addIntegerOption(o => o.setName('금액').setDescription('쿠폰 사용 시 지급 BE').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('유효일수').setDescription('오늘부터 며칠간 유효').setRequired(true).setMinValue(1))
        .addStringOption(o =>
          o.setName('사용모드')
            .setDescription('복수 사용 방식')
            .setRequired(true)
            .addChoices(
              { name: '여러 유저가 1회씩', value: 'per_user_once' },
              { name: '유저 1명만 선착순', value: 'single_use' },
              { name: '총 n회 사용 가능', value: 'limited_total' }
            )
        )
        .addIntegerOption(o => o.setName('총사용가능수').setDescription('limited_total일 때 총 사용 가능 횟수').setMinValue(1))
        .addStringOption(o => o.setName('코드').setDescription('직접 입력(영문대문자+숫자 16자, 하이픈은 자동 형식화됨)'))
        .addStringOption(o => o.setName('메모').setDescription('관리용 메모'))
    )
    .addSubcommand(sc =>
      sc.setName('쿠폰목록')
        .setDescription('쿠폰 발급 현황 확인')
        .addBooleanOption(o => o.setName('활성만').setDescription('만료/취소 제외').setRequired(false))
        .addIntegerOption(o => o.setName('페이지').setDescription('페이지 번호').setRequired(false).setMinValue(1))
    )
    .addSubcommand(sc =>
      sc.setName('쿠폰취소')
        .setDescription('특정 쿠폰을 더 이상 사용하지 못하게 취소')
        .addStringOption(o => o.setName('코드').setDescription('쿠폰 코드').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('쿠폰정보')
        .setDescription('쿠폰 상세 정보 보기')
        .addStringOption(o => o.setName('코드').setDescription('쿠폰 코드').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('쿠폰공유')
        .setDescription('쿠폰 코드를 서버에 공개 공유')
        .addStringOption(o => o.setName('코드').setDescription('쿠폰 코드').setRequired(true))
        .addChannelOption(o => o.setName('채널').setDescription('공유할 채널(미지정 시 현재 채널)'))
    )
    .addSubcommand(sc =>
      sc.setName('정수게임')
        .setDescription('정답 맞추기 게임 임베드 생성(임베드당 유저 1회만 참여, 정답자에 보상 BE 쿠폰 지급, 재표시 지원)')
        .addStringOption(o =>
          o.setName('게임옵션')
            .setDescription('게임 유형 선택')
            .setRequired(true)
            .addChoices(
              { name: '묵찌빠 괴물', value: 'rps_monster' },
              { name: '홀짝 괴물', value: 'oddeven_monster' }
            )
        )
        .addStringOption(o =>
          o.setName('정답')
            .setDescription('게임 정답(묵/찌/빠 또는 홀/짝)')
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName('보상정수')
            .setDescription('정답자 1인당 지급 BE')
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption(o =>
          o.setName('유효일수')
            .setDescription('정답자에게 발급되는 1회용 쿠폰의 유효기간(일), 기본 3일')
            .setRequired(false)
            .setMinValue(1)
        )
        .addStringOption(o =>
          o.setName('설명')
            .setDescription('임베드에 표시할 추가 설명')
            .setRequired(false)
        )
        .addChannelOption(o =>
          o.setName('채널')
            .setDescription('게임 임베드를 보낼 채널(미지정 시 현재 채널)')
            .setRequired(false)
        )
    ),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '이 명령어는 관리자만 사용할 수 있습니다.', ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === '수수료') {
      const fee = interaction.options.getInteger('수수료');
      if (fee < 0 || fee > 100) return interaction.reply({ content: '수수료는 0~100% 범위로 입력해 주세요.', ephemeral: true });
      const config = loadConfig(); config.fee = fee; saveConfig(config);
      return interaction.reply({ content: `정수 송금 수수료를 ${fee}%로 설정 완료!`, ephemeral: true });
    }

    if (sub === '쿠폰발급') {
      const amount = interaction.options.getInteger('금액', true);
      const days = interaction.options.getInteger('유효일수', true);
      const mode = interaction.options.getString('사용모드', true);
      const totalLimit = interaction.options.getInteger('총사용가능수') || null;
      const note = interaction.options.getString('메모') || '';
      let code = interaction.options.getString('코드') || '';
      const store = loadCoupons();
      if (code) {
        code = normalizeCode(code);
        if (!code) return interaction.reply({ content: '코드 형식이 올바르지 않습니다. 예) XXXX-XXXX-XXXX-XXXX', ephemeral: true });
        if (store[code]) return interaction.reply({ content: '이미 존재하는 코드입니다. 다른 코드를 입력하세요.', ephemeral: true });
      } else {
        do { code = randomCode(); } while (store[code]);
      }
      if (mode === 'limited_total' && (!totalLimit || totalLimit < 1)) {
        return interaction.reply({ content: '총사용가능수는 1 이상이어야 합니다.', ephemeral: true });
      }
      const now = Date.now();
      const expiresAt = now + days * 24 * 60 * 60 * 1000;
      store[code] = {
        code, amount, mode,
        totalLimit: mode === 'limited_total' ? totalLimit : null,
        usedCount: 0, usedBy: [],
        perUserLimit: mode === 'per_user_once' ? 1 : null,
        creatorId: interaction.user.id,
        createdAt: now, expiresAt,
        canceled: false, note
      };
      saveCoupons(store);
      const modeText = mode === 'per_user_once' ? '여러 유저가 1회씩' : mode === 'single_use' ? '유저 1명만 선착순' : `총 ${totalLimit}회 사용 가능`;
      const embed = new EmbedBuilder()
        .setTitle('쿠폰 발급 완료')
        .setColor(0x00aaff)
        .setDescription(`코드: \`${code}\`\n금액: **${amount.toLocaleString('ko-KR')} BE**\n사용모드: **${modeText}**\n유효기간: **${days}일** (만료: ${toKST(expiresAt)})` + (note ? `\n메모: ${note}` : ''))
        .setFooter({ text: `발급자: ${interaction.user.tag}` });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === '쿠폰목록') {
      const activeOnly = interaction.options.getBoolean('활성만') ?? true;
      const page = interaction.options.getInteger('페이지') || 1;
      const store = loadCoupons();
      const items = Object.values(store).sort((a,b)=>b.createdAt-a.createdAt).filter(c=>{
        if (!activeOnly) return true;
        if (c.canceled) return false;
        if (Date.now() > c.expiresAt) return false;
        if (c.mode === 'single_use' && c.usedCount >= 1) return false;
        if (c.mode === 'limited_total' && c.totalLimit !== null && c.usedCount >= c.totalLimit) return false;
        return true;
      });
      const perPage = 10;
      const start = (page - 1) * perPage;
      const slice = items.slice(start, start + perPage);
      if (slice.length === 0) return interaction.reply({ content: '표시할 쿠폰이 없습니다.', ephemeral: true });
      const lines = slice.map(c=>{
        const modeText = c.mode === 'per_user_once' ? '1인1회' : c.mode === 'single_use' ? '선착순1명' : `총${c.totalLimit}회`;
        const status = c.canceled ? '취소' : (Date.now() > c.expiresAt ? '만료' : '유효');
        const remain = c.mode === 'single_use' ? (c.usedCount ? 0 : 1) : (c.mode === 'limited_total' ? Math.max(0, c.totalLimit - c.usedCount) : '∞');
        return `• \`${c.code}\` | ${c.amount.toLocaleString('ko-KR')} BE | ${modeText} | 사용 ${c.usedCount}/${c.totalLimit ?? '∞'} | 남음 ${remain} | 만료 ${toKST(c.expiresAt)} | ${status}`;
      }).join('\n');
      const footer = `전체 ${items.length}개 | ${page}/${Math.max(1, Math.ceil(items.length / perPage))}페이지`;
      const embed = new EmbedBuilder().setTitle(activeOnly ? '쿠폰 목록(활성)' : '쿠폰 목록(전체)').setColor(0x00aaff).setDescription(lines).setFooter({ text: footer });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === '쿠폰취소') {
      let code = interaction.options.getString('코드', true);
      code = normalizeCode(code);
      if (!code) return interaction.reply({ content: '코드 형식이 올바르지 않습니다.', ephemeral: true });
      const store = loadCoupons();
      const c = store[code];
      if (!c) return interaction.reply({ content: '해당 코드를 찾을 수 없습니다.', ephemeral: true });
      if (c.canceled) return interaction.reply({ content: '이미 취소된 쿠폰입니다.', ephemeral: true });
      c.canceled = true;
      saveCoupons(store);
      return interaction.reply({ content: `쿠폰 \`${code}\` 취소 완료.`, ephemeral: true });
    }

    if (sub === '쿠폰정보') {
      let code = interaction.options.getString('코드', true);
      code = normalizeCode(code);
      if (!code) return interaction.reply({ content: '코드 형식이 올바르지 않습니다.', ephemeral: true });
      const store = loadCoupons();
      const c = store[code];
      if (!c) return interaction.reply({ content: '해당 코드를 찾을 수 없습니다.', ephemeral: true });
      const modeText = c.mode === 'per_user_once' ? '여러 유저가 1회씩' : c.mode === 'single_use' ? '유저 1명만 선착순' : `총 ${c.totalLimit}회 사용 가능`;
      const status = c.canceled ? '취소' : (Date.now() > c.expiresAt ? '만료' : '유효');
      const embed = new EmbedBuilder()
        .setTitle('쿠폰 정보')
        .setColor(0x00aaff)
        .setDescription(`코드: \`${c.code}\`\n금액: **${c.amount.toLocaleString('ko-KR')} BE**\n사용모드: **${modeText}**\n사용: **${c.usedCount}/${c.totalLimit ?? '∞'}**\n유효기간: ${toKST(c.createdAt)} ~ ${toKST(c.expiresAt)}\n상태: **${status}**\n발급자: <@${c.creatorId}>` + (c.note ? `\n메모: ${c.note}` : ''));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === '쿠폰공유') {
      let code = interaction.options.getString('코드', true);
      code = normalizeCode(code);
      if (!code) return interaction.reply({ content: '코드 형식이 올바르지 않습니다.', ephemeral: true });
      const store = loadCoupons();
      const c = store[code];
      if (!c) return interaction.reply({ content: '해당 코드를 찾을 수 없습니다.', ephemeral: true });
      if (c.canceled) return interaction.reply({ content: '취소된 쿠폰은 공유할 수 없습니다.', ephemeral: true });
      if (Date.now() > c.expiresAt) return interaction.reply({ content: '만료된 쿠폰은 공유할 수 없습니다.', ephemeral: true });
      const modeText = c.mode === 'per_user_once' ? '여러 유저가 1회씩' : c.mode === 'single_use' ? '유저 1명만 선착순' : `총 ${c.totalLimit}회 사용 가능`;
      const targetChannel = interaction.options.getChannel('채널') || interaction.channel;
      if (!targetChannel || !targetChannel.isTextBased()) return interaction.reply({ content: '유효한 텍스트 채널을 선택해 주세요.', ephemeral: true });
      const share = new EmbedBuilder()
        .setTitle('🧧 쿠폰 코드')
        .setColor(0xff5e5e)
        .setDescription('-# /정수획득 명령어로 사용 가능\n' + `상품: **${c.amount.toLocaleString('ko-KR')} BE** • 형태: **${modeText}** • 만료: **${toKST(c.expiresAt)}**`)
        .addFields({ name: '쿠폰 번호', value: `\`\`\`fix\n${c.code}\n\`\`\`` })
        .setFooter({ text: '까리한 디스코드를 이용해주셔서 언제나 감사합니다.' });
      await targetChannel.send({ embeds: [share] });
      return interaction.reply({ content: `쿠폰 \`${c.code}\` 공유 완료.`, ephemeral: true });
    }

    if (sub === '정수게임') {
      const type = interaction.options.getString('게임옵션', true);
      const answerRaw = interaction.options.getString('정답', true);
      const reward = interaction.options.getInteger('보상정수', true);
      const days = interaction.options.getInteger('유효일수') || 3;
      const desc = interaction.options.getString('설명') || '';
      const targetChannel = interaction.options.getChannel('채널') || interaction.channel;
      if (!targetChannel || !targetChannel.isTextBased()) return interaction.reply({ content: '유효한 텍스트 채널을 선택해 주세요.', ephemeral: true });

      const validAnswers = type === 'rps_monster' ? ['묵','찌','빠'] : type === 'oddeven_monster' ? ['홀','짝'] : null;
      if (!validAnswers) return interaction.reply({ content: '알 수 없는 게임옵션입니다.', ephemeral: true });
      const answer = String(answerRaw || '').trim();
      if (!validAnswers.includes(answer)) return interaction.reply({ content: `정답은 ${validAnswers.join('/')} 중 하나여야 합니다.`, ephemeral: true });

      const title = type === 'rps_monster' ? '👾 묵찌빠 괴물' : '👾 홀짝 괴물';
      const guide = type === 'rps_monster' ? '버튼 중 하나를 눌러 정답을 맞혀보세요! (유저당 1회 참여)' : '홀/짝 중 하나를 선택하세요! (유저당 1회 참여)';

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x6c5ce7)
        .setDescription(`${desc ? `${desc}\n\n` : ''}-# 유저당 **1회만** 참여할 수 있어요.\n정답자는 **${reward.toLocaleString('ko-KR')} BE** 쿠폰을 받아요.\n쿠폰 유효기간: **${days}일**\n\n${guide}`)
        .setFooter({ text: `/정수획득, /정수조회 등의 명령어를 확인해보세요.` });

      const nonce = randomNonce();
      const row = type === 'rps_monster'
        ? new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`beGame:${nonce}:묵`).setLabel('묵').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`beGame:${nonce}:찌`).setLabel('찌').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`beGame:${nonce}:빠`).setLabel('빠').setStyle(ButtonStyle.Primary)
          )
        : new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`beGame:${nonce}:홀`).setLabel('홀').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`beGame:${nonce}:짝`).setLabel('짝').setStyle(ButtonStyle.Success)
          );

      const msg = await targetChannel.send({ embeds: [embed], components: [row] });
      const games = loadGames();
      games[nonce] = {
        nonce,
        messageId: msg.id,
        channelId: msg.channel.id,
        guildId: msg.guildId,
        type,
        title,
        answer,
        reward,
        days,
        creatorId: interaction.user.id,
        createdAt: Date.now(),
        closed: false,
        attempted: {},
        claims: {}
      };
      saveGames(games);

      return interaction.reply({ content: `정수게임 임베드가 전송되었습니다. (채널: <#${targetChannel.id}>)`, ephemeral: true });
    }
  }
};


