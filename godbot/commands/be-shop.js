const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const bePath = path.join(__dirname, '../data/BE.json');
const itemsPath = path.join(__dirname, '../data/items.json');
const skillsPath = path.join(__dirname, '../data/skills.json');
const stockPath = path.join(__dirname, '../data/upgrade-stock.json');
const nicknameRolesPath = path.join(__dirname, '../data/nickname-roles.json');
const titlesPath = path.join(__dirname, '../data/limited-titles.json');

const NICKNAME_ROLE_PER_USER = 1;
const CHANNEL_ROLE_ID = '1352582997400092755';
const CHANNEL_ROLE_PRICE = 3000000;
const RENT_ROLE_ID = '1352583279102001212';
const RENT_PRICE = 1000000;

function numFmt(num) { return num.toLocaleString(); }

const 강화ITEMS = [
  {
    name: '불굴의 영혼',
    roleId: '1382169247538745404',
    price: 10000,
    desc: '챔피언 단일 강화 진행시 보유하고 있는 경우 100% 확률로 소멸을 방지한다. [1회성/고유상품]\n※ 1시간마다 재고 1개 충전 [최대 10개]',
    emoji: '🧿',
    key: 'soul',
    period: 1
  },
  {
    name: '불굴의 영혼 (전설)',
    roleId: '1382665471605870592',
    price: 50000,
    desc: '챔피언 한방 강화 진행시 보유하고 있는 경우 100% 확률로 소멸을 방지한다. [1회성/고유상품]\n※ 3시간마다 재고 1개 충전 [최대 5개]',
    emoji: '🌟',
    key: 'legendary',
    period: 3
  }
];
const MAX_STOCK = { soul: 10, legendary: 5 };

async function loadJson(p, isArray = false) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, isArray ? "[]" : "{}");
  const release = await lockfile.lock(p, { retries: 3 });
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  await release();
  return data;
}
async function saveJson(p, data) {
  const release = await lockfile.lock(p, { retries: 3 });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  await release();
}

async function loadStock() {
  if (!fs.existsSync(stockPath)) fs.writeFileSync(stockPath, '{}');
  const release = await lockfile.lock(stockPath, { retries: 3 });
  const data = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
  await release();
  return data;
}
async function saveStock(data) {
  const release = await lockfile.lock(stockPath, { retries: 3 });
  fs.writeFileSync(stockPath, JSON.stringify(data, null, 2));
  await release();
}

async function checkAndRestock(item) {
  const stock = await loadStock();
  const now = Date.now();
  if (!stock[item.key]) stock[item.key] = { stock: 0, last: 0 };
  let changed = false;
  let periodMs = item.period * 60 * 60 * 1000;
  let last = stock[item.key].last || 0;
  let currentStock = stock[item.key].stock || 0;
  if (now - last >= periodMs) {
    const addCount = Math.floor((now - last) / periodMs);
    if (currentStock < MAX_STOCK[item.key]) {
      currentStock = Math.min(MAX_STOCK[item.key], currentStock + addCount);
      stock[item.key].stock = currentStock;
      stock[item.key].last = last + addCount * periodMs;
      changed = true;
    } else if (stock[item.key].last < now - periodMs) {
      stock[item.key].last = now - (now - last) % periodMs;
      changed = true;
    }
  }
  if (changed) await saveStock(stock);
  return currentStock;
}
async function checkStock(item) {
  const stock = await checkAndRestock(item);
  return stock > 0;
}
async function decreaseStock(item) {
  const stock = await loadStock();
  if (!stock[item.key]) stock[item.key] = { stock: 0, last: 0 };
  stock[item.key].stock = Math.max(0, (stock[item.key].stock || 0) - 1);
  await saveStock(stock);
}
async function nextRestock(item) {
  const stock = await loadStock();
  const now = Date.now();
  if (!stock[item.key]) stock[item.key] = { stock: 0, last: 0 };
  let periodMs = item.period * 60 * 60 * 1000;
  let last = stock[item.key].last || 0;
  let nextTime = last + periodMs;
  if (stock[item.key].stock >= MAX_STOCK[item.key]) return 0;
  return Math.max(0, Math.floor((nextTime - now) / 1000));
}

const userBuying = {};
const sessions = new Map();

async function cleanupSession(userId) {
  const s = sessions.get(userId);
  if (!s) return;
  try { clearInterval(s.interval); } catch {}
  try { if (s.collector && !s.collector.ended) s.collector.stop('cleanup'); } catch {}
  try { await s.interaction.deleteReply(); } catch {}
  sessions.delete(userId);
  userBuying[userId] = false;
}

function hexToImgUrl(hex) { return `https://singlecolorimage.com/get/${hex.replace('#', '')}/100x100`; }
function getRemainSec(expireAt) { return Math.max(0, Math.floor((expireAt - Date.now()) / 1000)); }

async function renderHome(i, expireAt) {
  const be = await loadJson(bePath);
  const cur = be[i.user.id]?.amount || 0;
  const embed = new EmbedBuilder()
    .setTitle('🛍️ 상점')
    .setDescription(
      `🔷 내 파랑 정수: ${numFmt(cur)} BE\n` +
      `아래에서 원하는 상점을 선택하세요.\n` +
      `닉네임 색상, 개인채널 계약금, 월세 납부하기, 한정판 칭호, 강화 아이템, 배틀 아이템, 배틀 스킬`
    );
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nav_nickname').setLabel('🎨 닉네임 색상').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('nav_channel').setLabel('💸 개인채널 계약금').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('nav_rent').setLabel('📄 월세 납부하기').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('nav_title').setLabel('🏅 한정판 칭호').setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nav_upgrade').setLabel('🪄 강화 아이템').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nav_item').setLabel('🥷 배틀 아이템').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nav_skill').setLabel('📚 배틀 스킬').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop_close').setLabel('상점 닫기').setStyle(ButtonStyle.Danger)
  );
  return {
    content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec(expireAt)}초)`,
    embeds: [embed],
    components: [row1, row2]
  };
}

async function renderNicknameShop(guild, userId, page, expireAt) {
  const be = await loadJson(bePath);
  const curBe = be[userId]?.amount || 0;
  const ROLES = await loadJson(nicknameRolesPath);
  const roleList = Object.values(ROLES);
  const ROLES_PER_PAGE = 1;
  const maxPage = Math.max(1, Math.ceil(roleList.length / ROLES_PER_PAGE));
  if (page < 0) page = 0;
  if (page >= maxPage) page = maxPage - 1;
  const member = await guild.members.fetch(userId);
  const showRoles = roleList.slice(page * ROLES_PER_PAGE, (page + 1) * ROLES_PER_PAGE);
  const embed = new EmbedBuilder().setTitle('🎨 닉네임 색상 상점').setDescription(`🔷 내 파랑 정수: ${numFmt(curBe)} BE`).setFooter({ text: `총 색상 역할: ${roleList.length} | 페이지 ${page + 1}/${maxPage}` });
  if (showRoles[0]?.color) embed.setImage(hexToImgUrl(showRoles[0].color));
  showRoles.forEach((role) => {
    embed.addFields({
      name: `${role.emoji || ''} ${role.name} (${numFmt(role.price)} BE)`,
      value: `${role.desc}\n${role.color ? `\`색상코드:\` ${role.color}\n[컬러 박스 미리보기](${hexToImgUrl(role.color)})` : ''}${member.roles.cache.has(role.roleId) ? '\n**[보유중]**' : ''}`,
      inline: false
    });
  });
  const row = new ActionRowBuilder();
  showRoles.forEach(role => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`nickname_buy_${role.roleId}`)
        .setLabel(member.roles.cache.has(role.roleId) ? `${role.name} 보유중` : `${role.name} 구매`)
        .setStyle(member.roles.cache.has(role.roleId) ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(member.roles.cache.has(role.roleId))
    );
  });
  const rowPage = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nav_home').setLabel('홈').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('nick_prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('nick_next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= maxPage),
    new ButtonBuilder().setCustomId('shop_close').setLabel('상점 닫기').setStyle(ButtonStyle.Danger)
  );
  return {
    content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec(expireAt)}초)`,
    embeds: [embed],
    components: [row, rowPage],
    page
  };
}

async function renderChannelShop(guild, userId, expireAt) {
  const member = await guild.members.fetch(userId);
  let already = member.roles.cache.has(CHANNEL_ROLE_ID);
  const embed = new EmbedBuilder()
    .setTitle('🛎️ 개인채널 계약금')
    .setDescription(`3,000,000 BE\n역할 구매시 개인 전용 채널을 신청할 수 있는 권한이 부여됩니다.\n\n${already ? '> 이미 보유 중!' : '> 즉시 구매 가능'}`)
    .setColor('#FFD700');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('channel_buy').setLabel(already ? '이미 보유중' : '구매').setStyle(already ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(already),
    new ButtonBuilder().setCustomId('nav_home').setLabel('홈').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop_close').setLabel('상점 닫기').setStyle(ButtonStyle.Danger)
  );
  return {
    content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec(expireAt)}초)`,
    embeds: [embed],
    components: [row]
  };
}

async function renderRent(guild, userId, expireAt) {
  const be = await loadJson(bePath);
  const curBe = be[userId]?.amount || 0;
  const member = await guild.members.fetch(userId);
  const owned = member.roles.cache.has(RENT_ROLE_ID);
  const embed = new EmbedBuilder()
    .setTitle('📄 월세 납부하기')
    .setDescription(
      `납부 금액: ${numFmt(RENT_PRICE)} BE\n역할 지급: 월세 납부 증명서\n현재 보유 BE: ${numFmt(curBe)} BE\n${owned ? '> 이미 역할을 보유 중입니다.' : '> ⚠️ 개인 음성채널을 소지한 경우에만 구매하세요.'}`
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rent_pay').setLabel(owned ? '이미 보유중' : '월세 납부').setStyle(owned ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(owned),
    new ButtonBuilder().setCustomId('nav_home').setLabel('홈').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop_close').setLabel('상점 닫기').setStyle(ButtonStyle.Danger)
  );
  return {
    content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec(expireAt)}초)`,
    embeds: [embed],
    components: [row]
  };
}

async function renderTitleShop(guild, userId, page, expireAt) {
  const be = await loadJson(bePath);
  const curBe = be[userId]?.amount || 0;
  const TITLES = await loadJson(titlesPath);
  const titleList = Object.values(TITLES);
  const TITLE_PER_PAGE = 1;
  const maxPage = Math.max(1, Math.ceil(titleList.length / TITLE_PER_PAGE));
  if (page < 0) page = 0;
  if (page >= maxPage) page = maxPage - 1;
  const member = await guild.members.fetch(userId);
  const showTitles = titleList.slice(page * TITLE_PER_PAGE, (page + 1) * TITLE_PER_PAGE);
  const embed = new EmbedBuilder()
    .setTitle('🏅 한정판 칭호 상점')
    .setDescription(
      `🔷 내 파랑 정수: ${numFmt(curBe)} BE\n` +
      showTitles.map((t, i) => {
        let owned = member.roles.cache.has(t.roleId);
        let stockMsg = (t.stock === undefined || t.stock === null) ? '' : (t.stock <= 0 ? '\n> [품절]' : `\n> [남은 수량: ${t.stock}개]`);
        return `#${i+1+page*TITLE_PER_PAGE} | ${t.emoji||''} **${t.name}** (${numFmt(t.price)} BE)\n${t.desc}\n${stockMsg}\n> ${owned ? '**[보유중]**' : ''}`;
      }).join('\n\n')
    )
    .setFooter({ text: `총 칭호: ${titleList.length} | 페이지 ${page + 1}/${maxPage}` });
  if (showTitles[0]?.color && typeof showTitles[0].color === 'string') {
    if (showTitles[0].color.startsWith('http')) embed.setImage(showTitles[0].color);
    else if (/^#?[0-9a-fA-F]{6}$/.test(showTitles[0].color.replace('#',''))) embed.setColor(showTitles[0].color);
  }
  const row = new ActionRowBuilder();
  showTitles.forEach(t => {
    let owned = member.roles.cache.has(t.roleId);
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`title_buy_${t.roleId}`)
        .setLabel(owned ? `${t.name} 보유중` : `${t.name} 구매`)
        .setStyle(owned || (t.stock!==undefined&&t.stock<=0) ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(owned || (t.stock!==undefined&&t.stock<=0))
    );
  });
  const rowPage = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nav_home').setLabel('홈').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('title_prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('title_refresh').setLabel('새로고침').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('title_next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= maxPage),
    new ButtonBuilder().setCustomId('shop_close').setLabel('상점 닫기').setStyle(ButtonStyle.Danger)
  );
  return {
    content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec(expireAt)}초)`,
    embeds: [embed],
    components: [row, rowPage],
    page
  };
}

async function renderUpgradeShop(userId, expireAt) {
  const be = await loadJson(bePath);
  const curBe = be[userId]?.amount || 0;
  const stocks = {};
  for (const item of 강화ITEMS) {
    stocks[item.key] = await checkAndRestock(item);
  }
  const embed = new EmbedBuilder()
    .setTitle("🪄 강화 아이템 상점 (역할 상품)")
    .setDescription(
      `🔷 내 파랑 정수: ${numFmt(curBe)} BE\n` +
      await Promise.all(강화ITEMS.map(async (item, i) => {
        const stock = stocks[item.key];
        let msg = '';
        if (stock <= 0) {
          const left = await nextRestock(item);
          if (left > 0) {
            const h = Math.floor(left / 3600);
            const m = Math.floor((left % 3600) / 60);
            const s = left % 60;
            msg = `\n> **[품절]** 충전까지 ${h ? `${h}시간 ` : ''}${m ? `${m}분 ` : ''}${s}초 남음`;
          } else {
            msg = `\n> **[품절]**`;
          }
        } else {
          msg = `\n> **[남은 재고: ${stock}개]**`;
        }
        return `#${i + 1} | ${item.emoji} **${item.name}** (${numFmt(item.price)} BE)\n${item.desc}${msg}\n`
      })).then(lines => lines.join("\n"))
    )
    .setFooter({ text: `고유상품: 1회성 역할 아이템 | 구매시 즉시 지급` });
  const rowBuy = new ActionRowBuilder();
  강화ITEMS.forEach(item => {
    const stock = stocks[item.key];
    rowBuy.addComponents(
      new ButtonBuilder()
        .setCustomId(`upgrade_buy_${item.roleId}`)
        .setLabel(stock > 0 ? `${item.name} 구매` : `${item.name} 품절`)
        .setStyle(stock > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(stock <= 0)
    );
  });
  const rowNav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nav_home').setLabel('홈').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop_close').setLabel('상점 닫기').setStyle(ButtonStyle.Danger)
  );
  return {
    content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec(expireAt)}초)`,
    embeds: [embed],
    components: [rowBuy, rowNav]
  };
}

async function renderItemShop(userId, page, expireAt) {
  const be = await loadJson(bePath);
  const curBe = be[userId]?.amount || 0;
  const ITEMS = require('../utils/items.js');
  const ITEM_LIST = Object.values(ITEMS);
  const sorted = ITEM_LIST.slice().sort((a, b) => b.price - a.price);
  const ITEMS_PER_PAGE = 5;
  const maxPage = Math.max(1, Math.ceil(ITEM_LIST.length / ITEMS_PER_PAGE));
  if (page < 0) page = 0;
  if (page >= maxPage) page = maxPage - 1;
  const showItems = sorted.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  const embed = new EmbedBuilder()
    .setTitle("🛒 아이템 상점")
    .setDescription(
      `🔷 내 파랑 정수: ${numFmt(curBe)} BE\n` +
      showItems.map((item, i) =>
        `#${i + 1 + page * ITEMS_PER_PAGE} | ${item.icon || ""} **${item.name}** (${numFmt(item.price)} BE)\n${item.desc}`
      ).join("\n\n"))
    .setFooter({ text: `총 아이템: ${ITEM_LIST.length} | 페이지 ${page + 1}/${maxPage}` });
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("item_prev").setLabel("이전 페이지").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("item_refresh").setLabel("새로고침").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("item_next").setLabel("다음 페이지").setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= maxPage),
    new ButtonBuilder().setCustomId("nav_home").setLabel("홈").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_close").setLabel("상점 닫기").setStyle(ButtonStyle.Danger)
  );
  const rowBuy = new ActionRowBuilder();
  showItems.forEach(item => {
    rowBuy.addComponents(
      new ButtonBuilder()
        .setCustomId(`item_buy_${item.name}`)
        .setLabel(`${item.name} 구매`)
        .setStyle(ButtonStyle.Primary)
    );
  });
  return {
    content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec(expireAt)}초)`,
    embeds: [embed],
    components: [row1, rowBuy],
    page
  };
}

async function renderSkillShop(userId, page, expireAt) {
  const be = await loadJson(bePath);
  const curBe = be[userId]?.amount || 0;
  const SKILLS = require('../utils/active-skills.js');
  const SKILL_LIST = Object.values(SKILLS);
  const sorted = SKILL_LIST.slice().sort((a, b) => b.price - a.price);
  const SKILLS_PER_PAGE = 5;
  const maxPage = Math.max(1, Math.ceil(SKILL_LIST.length / SKILLS_PER_PAGE));
  if (page < 0) page = 0;
  if (page >= maxPage) page = maxPage - 1;
  const showSkills = sorted.slice(page * SKILLS_PER_PAGE, (page + 1) * SKILLS_PER_PAGE);
  const embed = new EmbedBuilder()
    .setTitle("📚 스킬 상점")
    .setDescription(
      `🔷 내 파랑 정수: ${numFmt(curBe)} BE\n` +
      showSkills.map((skill, i) =>
        `#${i + 1 + page * SKILLS_PER_PAGE} | ${skill.icon || ""} **${skill.name}** (${numFmt(skill.price)} BE)\n${skill.desc}`
      ).join("\n\n"))
    .setFooter({ text: `총 스킬: ${SKILL_LIST.length} | 페이지 ${page + 1}/${maxPage}` });
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("skill_prev").setLabel("이전 페이지").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("skill_refresh").setLabel("새로고침").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("skill_next").setLabel("다음 페이지").setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= maxPage),
    new ButtonBuilder().setCustomId("nav_home").setLabel("홈").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_close").setLabel("상점 닫기").setStyle(ButtonStyle.Danger)
  );
  const rowBuy = new ActionRowBuilder();
  showSkills.forEach(skill => {
    rowBuy.addComponents(
      new ButtonBuilder()
        .setCustomId(`skill_buy_${skill.name}`)
        .setLabel(`${skill.name} 구매`)
        .setStyle(ButtonStyle.Primary)
    );
  });
  return {
    content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec(expireAt)}초)`,
    embeds: [embed],
    components: [row1, rowBuy],
    page
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('상점')
    .setDescription('파랑 정수(BE)로 다양한 아이템/강화/역할을 구매할 수 있습니다.'),
  async execute(interaction) {
    try {
      if (sessions.has(interaction.user.id)) {
        const prev = sessions.get(interaction.user.id);
        try { if (prev.collector && !prev.collector.ended) prev.collector.stop('replaced'); } catch {}
        await cleanupSession(interaction.user.id);
      }
      const expireSec = 180;
      const sessionExpireAt = Date.now() + expireSec * 1000;
      let state = { view: 'home', page: 0 };
      await interaction.deferReply({ ephemeral: true });

      const home = await renderHome(interaction, sessionExpireAt);
      const shopMsg = await interaction.editReply(home);

      const interval = setInterval(async () => {
        try {
          let payload;
          if (state.view === 'home') payload = await renderHome(interaction, sessionExpireAt);
          if (state.view === 'nickname') payload = await renderNicknameShop(interaction.guild, interaction.user.id, state.page, sessionExpireAt);
          if (state.view === 'channel') payload = await renderChannelShop(interaction.guild, interaction.user.id, sessionExpireAt);
          if (state.view === 'rent') payload = await renderRent(interaction.guild, interaction.user.id, sessionExpireAt);
          if (state.view === 'title') payload = await renderTitleShop(interaction.guild, interaction.user.id, state.page, sessionExpireAt);
          if (state.view === 'upgrade') payload = await renderUpgradeShop(interaction.user.id, sessionExpireAt);
          if (state.view === 'item') payload = await renderItemShop(interaction.user.id, state.page, sessionExpireAt);
          if (state.view === 'skill') payload = await renderSkillShop(interaction.user.id, state.page, sessionExpireAt);
          await interaction.editReply(payload);
        } catch {}
      }, 1000);

      const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && i.message.id === shopMsg.id,
        time: expireSec * 1000
      });

      sessions.set(interaction.user.id, { interaction, collector, interval });

      collector.on('collect', async i => {
        if (i.customId === 'shop_close') {
          collector.stop('user');
          try { await i.update({ content: '상점이 닫혔습니다.', embeds: [], components: [] }); } catch {}
          return;
        }
        if (i.customId === 'nav_home') {
          state.view = 'home'; state.page = 0;
          const payload = await renderHome(interaction, sessionExpireAt);
          await i.update(payload);
          return;
        }
        if (i.customId === 'nav_nickname') {
          state.view = 'nickname'; state.page = 0;
          const payload = await renderNicknameShop(interaction.guild, interaction.user.id, state.page, sessionExpireAt);
          await i.update(payload);
          return;
        }
        if (i.customId === 'nav_channel') {
          state.view = 'channel'; state.page = 0;
          const payload = await renderChannelShop(interaction.guild, interaction.user.id, sessionExpireAt);
          await i.update(payload);
          return;
        }
        if (i.customId === 'nav_rent') {
          state.view = 'rent'; state.page = 0;
          const payload = await renderRent(interaction.guild, interaction.user.id, sessionExpireAt);
          await i.update(payload);
          return;
        }
        if (i.customId === 'nav_title') {
          state.view = 'title'; state.page = 0;
          const payload = await renderTitleShop(interaction.guild, interaction.user.id, state.page, sessionExpireAt);
          await i.update(payload);
          return;
        }
        if (i.customId === 'nav_upgrade') {
          state.view = 'upgrade'; state.page = 0;
          const payload = await renderUpgradeShop(interaction.user.id, sessionExpireAt);
          await i.update(payload);
          return;
        }
        if (i.customId === 'nav_item') {
          state.view = 'item'; state.page = 0;
          const payload = await renderItemShop(interaction.user.id, state.page, sessionExpireAt);
          await i.update(payload);
          return;
        }
        if (i.customId === 'nav_skill') {
          state.view = 'skill'; state.page = 0;
          const payload = await renderSkillShop(interaction.user.id, state.page, sessionExpireAt);
          await i.update(payload);
          return;
        }

        if (state.view === 'nickname') {
          if (i.customId === 'nick_prev') {
            state.page = Math.max(0, state.page - 1);
            const payload = await renderNicknameShop(interaction.guild, interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId === 'nick_next') {
            state.page = state.page + 1;
            const payload = await renderNicknameShop(interaction.guild, interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId.startsWith('nickname_buy_')) {
            const roleId = i.customId.replace('nickname_buy_', '');
            const ROLES = await loadJson(nicknameRolesPath);
            const roleList = Object.values(ROLES);
            const roleData = roleList.find(x => x.roleId === roleId);
            const member = await i.guild.members.fetch(i.user.id);
            if (!roleData) { await i.reply({ content: "해당 역할을 찾을 수 없습니다.", ephemeral: true }); return; }
            if (member.roles.cache.has(roleId)) { await i.reply({ content: `이미 [${roleData.name}] 색상 역할을 보유 중입니다!`, ephemeral: true }); return; }
            if (userBuying[i.user.id]) { await i.reply({ content: '이미 구매 처리 중입니다.', ephemeral: true }); return; }
            userBuying[i.user.id] = true;
            try {
              const be = await loadJson(bePath);
              const userBeNow = be[i.user.id]?.amount || 0;
              if (userBeNow < roleData.price) { await i.reply({ content: `파랑 정수 부족! (보유: ${numFmt(userBeNow)} BE)`, ephemeral: true }); return; }
              if (NICKNAME_ROLE_PER_USER > 0) {
                const allRoleIds = roleList.map(x => x.roleId);
                for (const rId of allRoleIds) {
                  if (member.roles.cache.has(rId)) await member.roles.remove(rId, '색상 중복 방지');
                }
              }
              await member.roles.add(roleId, '닉네임 색상 구매');
              be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
              be[i.user.id].amount -= roleData.price;
              be[i.user.id].history.push({ type: "spend", amount: roleData.price, reason: `${roleData.name} 색상 역할 구매`, timestamp: Date.now() });
              await saveJson(bePath, be);
              await i.reply({ content: `✅ [${roleData.name}] 색상 역할을 ${numFmt(roleData.price)} BE에 구매 완료!`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류: ${e.message}`, ephemeral: true });
            } finally { userBuying[i.user.id] = false; }
            return;
          }
        }

        if (state.view === 'channel') {
          if (i.customId === 'channel_buy') {
            if (userBuying[i.user.id]) { await i.reply({ content: '이미 구매 처리 중입니다.', ephemeral: true }); return; }
            userBuying[i.user.id] = true;
            try {
              const member = await i.guild.members.fetch(i.user.id);
              const be = await loadJson(bePath);
              const userBeNow = be[i.user.id]?.amount || 0;
              if (member.roles.cache.has(CHANNEL_ROLE_ID)) { await i.reply({ content: `이미 보유 중입니다.`, ephemeral: true }); return; }
              if (userBeNow < CHANNEL_ROLE_PRICE) { await i.reply({ content: `파랑 정수 부족! (보유: ${numFmt(userBeNow)} BE)`, ephemeral: true }); return; }
              await member.roles.add(CHANNEL_ROLE_ID, '개인채널 계약금 구매');
              be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
              be[i.user.id].amount -= CHANNEL_ROLE_PRICE;
              be[i.user.id].history.push({ type: "spend", amount: CHANNEL_ROLE_PRICE, reason: "개인채널 계약금 구매", timestamp: Date.now() });
              await saveJson(bePath, be);
              await i.reply({ content: `✅ 개인채널 계약금 역할 지급 완료!`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류: ${e.message}`, ephemeral: true });
            } finally { userBuying[i.user.id] = false; }
            return;
          }
        }

        if (state.view === 'rent') {
          if (i.customId === 'rent_pay') {
            if (userBuying[i.user.id]) { await i.reply({ content: '이미 납부 처리 중입니다.', ephemeral: true }); return; }
            userBuying[i.user.id] = true;
            try {
              const member = await i.guild.members.fetch(i.user.id);
              if (member.roles.cache.has(RENT_ROLE_ID)) { await i.reply({ content: `이미 역할을 보유 중입니다.`, ephemeral: true }); return; }
              const be = await loadJson(bePath);
              const userBeNow = be[i.user.id]?.amount || 0;
              if (userBeNow < RENT_PRICE) { await i.reply({ content: `파랑 정수 부족! (보유: ${numFmt(userBeNow)} BE)`, ephemeral: true }); return; }
              const beBackup = JSON.stringify(be);
              be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
              be[i.user.id].amount -= RENT_PRICE;
              be[i.user.id].history.push({ type: "spend", amount: RENT_PRICE, reason: "월세 납부하기", timestamp: Date.now() });
              await saveJson(bePath, be);
              try {
                await member.roles.add(RENT_ROLE_ID, '월세 납부 증명서 지급');
              } catch {
                await saveJson(bePath, JSON.parse(beBackup));
                await i.reply({ content: `❌ 역할 지급 실패! (권한 부족 또는 설정 오류 / BE 차감 취소됨)`, ephemeral: true });
                return;
              }
              await i.reply({ content: `✅ 월세 납부 완료! ${numFmt(RENT_PRICE)} BE 차감, 역할 지급됨.`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류: ${e.message}`, ephemeral: true });
            } finally { userBuying[i.user.id] = false; }
            return;
          }
        }

        if (state.view === 'title') {
          if (i.customId === 'title_prev') {
            state.page = Math.max(0, state.page - 1);
            const payload = await renderTitleShop(interaction.guild, interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId === 'title_next') {
            state.page = state.page + 1;
            const payload = await renderTitleShop(interaction.guild, interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId === 'title_refresh') {
            const payload = await renderTitleShop(interaction.guild, interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId.startsWith('title_buy_')) {
            const roleId = i.customId.replace('title_buy_', '');
            const TITLES = await loadJson(titlesPath);
            const titleList = Object.values(TITLES);
            const titleData = titleList.find(x => x.roleId === roleId);
            const member = await i.guild.members.fetch(i.user.id);
            if (!titleData) { await i.reply({ content: "해당 칭호를 찾을 수 없습니다.", ephemeral: true }); return; }
            if (member.roles.cache.has(roleId)) { await i.reply({ content: `이미 [${titleData.name}] 칭호를 보유 중입니다!`, ephemeral: true }); return; }
            if (titleData.stock !== undefined && titleData.stock !== null && titleData.stock <= 0) { await i.reply({ content: "품절입니다!", ephemeral: true }); return; }
            if (userBuying[i.user.id]) { await i.reply({ content: '이미 구매 처리 중입니다.', ephemeral: true }); return; }
            userBuying[i.user.id] = true;
            try {
              const be = await loadJson(bePath);
              const userBeNow = be[i.user.id]?.amount || 0;
              if (userBeNow < titleData.price) { await i.reply({ content: `파랑 정수 부족! (보유: ${numFmt(userBeNow)} BE)`, ephemeral: true }); return; }
              await member.roles.add(roleId, '한정판 칭호 구매');
              be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
              be[i.user.id].amount -= titleData.price;
              be[i.user.id].history.push({ type: "spend", amount: titleData.price, reason: `${titleData.name} 칭호 구매`, timestamp: Date.now() });
              await saveJson(bePath, be);
              if (titleData.stock !== undefined && titleData.stock !== null) {
                titleData.stock--;
                const TITLES2 = await loadJson(titlesPath);
                if (TITLES2[roleId]) {
                  TITLES2[roleId].stock = titleData.stock;
                  await saveJson(titlesPath, TITLES2);
                }
              }
              await i.reply({ content: `✅ [${titleData.name}] 칭호 역할을 ${numFmt(titleData.price)} BE에 구매 완료!`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류: ${e.message}`, ephemeral: true });
            } finally { userBuying[i.user.id] = false; }
            return;
          }
        }

        if (state.view === 'upgrade') {
          const btnItem = 강화ITEMS.find(x => i.customId === `upgrade_buy_${x.roleId}`);
          if (btnItem) {
            if (!(await checkStock(btnItem))) { await i.reply({ content: `❌ [${btnItem.name}] 품절입니다.`, ephemeral: true }); return; }
            if (userBuying[i.user.id]) { await i.reply({ content: '이미 구매 처리 중입니다. 잠시만 기다려 주세요!', ephemeral: true }); return; }
            userBuying[i.user.id] = true;
            try {
              const member = await i.guild.members.fetch(i.user.id);
              if (member.roles.cache.has(btnItem.roleId)) { await i.reply({ content: `이미 [${btnItem.name}] 역할을 소유하고 있어요!`, ephemeral: true }); return; }
              const be = await loadJson(bePath);
              const userBeNow = be[i.user.id]?.amount || 0;
              if (userBeNow < btnItem.price) { await i.reply({ content: `파랑 정수 부족! (보유: ${numFmt(userBeNow)} BE)`, ephemeral: true }); return; }
              await decreaseStock(btnItem);
              const beBackup = JSON.stringify(be);
              be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
              be[i.user.id].amount -= btnItem.price;
              be[i.user.id].history.push({ type: "spend", amount: btnItem.price, reason: `${btnItem.name} 역할 구매`, timestamp: Date.now() });
              await saveJson(bePath, be);
              try {
                await member.roles.add(btnItem.roleId, "강화 아이템 구매");
              } catch {
                await saveJson(bePath, JSON.parse(beBackup));
                await i.reply({ content: `❌ 역할 지급 실패! (권한 부족 또는 설정 오류 / BE 차감 취소됨)`, ephemeral: true });
                return;
              }
              await i.reply({ content: `✅ [${btnItem.name}] 역할을 ${numFmt(btnItem.price)} BE에 구매 완료!`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류 발생: ${e.message}`, ephemeral: true });
            } finally { userBuying[i.user.id] = false; }
            return;
          }
        }

        if (state.view === 'item') {
          if (i.customId === "item_prev") {
            state.page = Math.max(0, state.page - 1);
            const payload = await renderItemShop(interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId === "item_next") {
            state.page = state.page + 1;
            const payload = await renderItemShop(interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId === "item_refresh") {
            const payload = await renderItemShop(interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId.startsWith("item_buy_")) {
            if (userBuying[i.user.id]) { await i.reply({ content: '이미 구매 처리 중입니다. 잠시만 기다려 주세요!', ephemeral: true }); return; }
            userBuying[i.user.id] = true;
            try {
              const ITEMS = require('../utils/items.js');
              const ITEM_LIST = Object.values(ITEMS);
              const itemName = i.customId.replace("item_buy_", "");
              const item = ITEM_LIST.find(x => x.name === itemName);
              if (!item) { await i.reply({ content: "해당 아이템을 찾을 수 없습니다.", ephemeral: true }); return; }
              const items = await loadJson(itemsPath);
              items[i.user.id] = items[i.user.id] || {};
              const myItem = items[i.user.id][item.name] || { count: 0, desc: item.desc };
              if (myItem.count >= 99) { await i.reply({ content: `최대 99개까지만 소지할 수 있습니다. (보유: ${myItem.count})`, ephemeral: true }); return; }
              const be = await loadJson(bePath);
              const userBeNow = be[i.user.id]?.amount || 0;
              if (userBeNow < item.price) { await i.reply({ content: `파랑 정수 부족! (보유: ${numFmt(userBeNow)} BE)`, ephemeral: true }); return; }
              be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
              be[i.user.id].amount -= item.price;
              be[i.user.id].history.push({ type: "spend", amount: item.price, reason: `${item.name} 구매`, timestamp: Date.now() });
              await saveJson(bePath, be);
              myItem.count += 1;
              items[i.user.id][item.name] = myItem;
              await saveJson(itemsPath, items);
              await i.reply({ content: `✅ [${item.name}]을(를) ${numFmt(item.price)} BE에 구매 완료! (최대 99개까지 소지 가능)`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류 발생: ${e.message}`, ephemeral: true });
            } finally { userBuying[i.user.id] = false; }
            return;
          }
        }

        if (state.view === 'skill') {
          if (i.customId === "skill_prev") {
            state.page = Math.max(0, state.page - 1);
            const payload = await renderSkillShop(interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId === "skill_next") {
            state.page = state.page + 1;
            const payload = await renderSkillShop(interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId === "skill_refresh") {
            const payload = await renderSkillShop(interaction.user.id, state.page, sessionExpireAt);
            await i.update(payload);
            return;
          }
          if (i.customId.startsWith("skill_buy_")) {
            if (userBuying[i.user.id]) { await i.reply({ content: '이미 구매 처리 중입니다. 잠시만 기다려 주세요!', ephemeral: true }); return; }
            userBuying[i.user.id] = true;
            try {
              const SKILLS = require('../utils/active-skills.js');
              const SKILL_LIST = Object.values(SKILLS);
              const skillName = i.customId.replace("skill_buy_", "");
              const skill = SKILL_LIST.find(x => x.name === skillName);
              if (!skill) { await i.reply({ content: "해당 스킬을 찾을 수 없습니다.", ephemeral: true }); return; }
              const skills = await loadJson(skillsPath);
              const mySkills = skills[i.user.id] || {};
              if (mySkills[skill.name]) { await i.reply({ content: `이미 [${skill.name}] 스킬을 소유하고 있습니다! (스킬은 1개만 소유 가능)`, ephemeral: true }); return; }
              const be = await loadJson(bePath);
              const userBeNow = be[i.user.id]?.amount || 0;
              if (userBeNow < skill.price) { await i.reply({ content: `파랑 정수 부족! (보유: ${numFmt(userBeNow)} BE)`, ephemeral: true }); return; }
              be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
              be[i.user.id].amount -= skill.price;
              be[i.user.id].history.push({ type: "spend", amount: skill.price, reason: `${skill.name} 스킬 구매`, timestamp: Date.now() });
              await saveJson(bePath, be);
              skills[i.user.id] = skills[i.user.id] || {};
              skills[i.user.id][skill.name] = { desc: skill.desc };
              await saveJson(skillsPath, skills);
              await i.reply({ content: `✅ [${skill.name}] 스킬을 ${numFmt(skill.price)} BE에 구매 완료! (동일 스킬 중복 보유 불가)`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류 발생: ${e.message}`, ephemeral: true });
            } finally { userBuying[i.user.id] = false; }
            return;
          }
        }
      });

      collector.on('end', async () => {
        try { clearInterval(interval); } catch {}
        await cleanupSession(interaction.user.id);
      });
    } catch (err) {
      try { await interaction.editReply({ content: `❌ 오류 발생: ${err.message}` }); } catch {}
      try { await cleanupSession(interaction.user.id); } catch {}
    }
  }
};
