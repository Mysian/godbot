const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const bePath = path.join(__dirname, '../data/BE.json');
const privacyPath = path.join(__dirname, '../data/be-privacy.json');
const DONOR_ROLE = '1397076919127900171';
const STAFF_ROLES = ['786128824365482025','1201856430580432906'];

const TIER_IMAGE = {
  champion: "https://media.discordapp.net/attachments/1398143977051652217/1398156467059556422/10_.png?ex=6884562e&is=688304ae&hm=d472083d30da8f31b149b6818361ce456b4b6d7dc1661e2328685117e474ec80&=&format=webp&quality=lossless&width=888&height=888",
  challenger: "https://media.discordapp.net/attachments/1398143977051652217/1398156432762736731/8_.png?ex=68845626&is=688304a6&hm=f07a8c795f7086a7982f590df11709d2c53a5327a30a78d165f650d14787874b&=&format=webp&quality=lossless&width=888&height=888",
  legend: "https://media.discordapp.net/attachments/1398143977051652217/1398156419642949824/7_.png?ex=68845622&is=688304a2&hm=18ec47803f660efa4ea6d97307501cc96831916d559b4db1da52f3b59abe550b&=&format=webp&quality=lossless&width=888&height=888",
  diamond: "https://media.discordapp.net/attachments/1398143977051652217/1398156401238347796/6_.png?ex=6884561e&is=6883049e&hm=ce91718cd8a57c5fa9f73bd87208b48d499f05d135a5ee1e9c40bfd30a3c32a2&=&format=webp&quality=lossless&width=888&height=888",
  emerald: "https://media.discordapp.net/attachments/1398143977051652217/1398156383018291243/5_.png?ex=6884561a&is=6883049a&hm=8910df7a7109a1b25df40212cadab46c7623d035ff2501f08837ff65f4d6b983&=&format=webp&quality=lossless&width=888&height=888",
  platinum: "https://media.discordapp.net/attachments/1398143977051652217/1398156369885925527/4_.png?ex=68845617&is=68830497&hm=027cf1b399799abc798d956adb3c16ae658ea17ac31bff022308fde58e3a1027&=&format=webp&quality=lossless&width=888&height=888",
  gold: "https://media.discordapp.net/attachments/1398143977051652217/1398156357810524171/3_.png?ex=68845614&is=68830494&hm=f8b248ec38986e68259ce81d715b3b9661ba2dd9a39f50c4ba44a860fed2f062&=&format=webp&quality=lossless&width=888&height=888",
  silver: "https://media.discordapp.net/attachments/1398143977051652217/1398156346456674356/2_.png?ex=68845611&is=68830491&hm=6423ca01333a2bb05216dcfd010fe098b2e74425175747b4258251fcc6711267&=&format=webp&quality=lossless&width=888&height=888",
  bronze: "https://media.discordapp.net/attachments/1398143977051652217/1398156333181698229/1_.png?ex=6884560e&is=6883048e&hm=bf4e71da293e5ee1ecf37fd456540c5273dffbd27aed42bff646f7fe9dd1e232&=&format=webp&quality=lossless&width=888&height=888",
  default: "https://media.discordapp.net/attachments/1398143977051652217/1398156333181698229/1_.png?ex=6884560e&is=6883048e&hm=bf4e71da293e5ee1ecf37fd456540c5273dffbd27aed42bff646f7fe9dd1e232&=&format=webp&quality=lossless&width=888&height=888"
};

const TIER_NAME = {
  champion: "챔피언",
  challenger: "챌린저",
  legend: "레전드",
  diamond: "다이아",
  emerald: "에메랄드",
  platinum: "플래티넘",
  gold: "골드",
  silver: "실버",
  bronze: "브론즈",
  default: "없음"
};

function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, '{}');
  return JSON.parse(fs.readFileSync(bePath, 'utf8'));
}
function loadPrivacy() {
  if (!fs.existsSync(privacyPath)) fs.writeFileSync(privacyPath, '{}');
  return JSON.parse(fs.readFileSync(privacyPath, 'utf8'));
}
function savePrivacy(p) {
  fs.writeFileSync(privacyPath, JSON.stringify(p, null, 2));
}

const formatAmount = n => Number(n).toLocaleString('ko-KR');

const PAGE_SIZE = 10;
const FILTERS = { ALL: 'all', EARN: 'earn', SPEND: 'spend', SEARCH: 'search' };

function getTax(amount) {
  if (amount < 5000000) return 0;
  if (amount < 10000000) return Math.floor(amount * 0.001);
  if (amount < 50000000) return Math.floor(amount * 0.005);
  if (amount < 100000000) return Math.floor(amount * 0.01);
  if (amount < 500000000) return Math.floor(amount * 0.015);
  if (amount < 1000000000) return Math.floor(amount * 0.02);
  if (amount < 5000000000) return Math.floor(amount * 0.035);
  if (amount < 10000000000) return Math.floor(amount * 0.05);
  if (amount < 100000000000) return Math.floor(amount * 0.075);
  if (amount < 500000000000) return Math.floor(amount * 0.10);
  if (amount < 1000000000000) return Math.floor(amount * 0.25);
  return Math.floor(amount * 0.5);
}

const TAX_TABLE = [
  ["500만원 미만", "세금 면제"],
  ["500만원 이상", "0.1%"],
  ["1천만원 이상", "0.5%"],
  ["5천만원 이상", "1%"],
  ["1억 이상", "1.5%"],
  ["5억 이상", "2%"],
  ["10억 이상", "3.5%"],
  ["50억 이상", "5%"],
  ["100억 이상", "7.5%"],
  ["500억 이상", "10%"],
  ["1,000억 이상", "25%"],
  ["1조 이상", "50%"]
];

function getRankInfo(targetUserId, be) {
  const rankArr = Object.entries(be).map(([id, d]) => ({ id, amount: d.amount })).sort((a, b) => b.amount - a.amount);
  const idx = rankArr.findIndex(e => e.id === targetUserId);
  if (idx === -1) return { rank: null, percent: 100, total: rankArr.length };
  const rank = idx + 1;
  const percent = Math.round((rank / rankArr.length) * 100);
  return { rank, percent, total: rankArr.length };
}

function getTierInfo(rank, percent) {
  if (rank === 1) return { key: "champion" };
  if (rank >= 2 && rank <= 5) return { key: "challenger" };
  if (rank >= 6 && rank <= 10) return { key: "legend" };
  if (rank >= 11 && rank <= 20) return { key: "diamond" };
  if (rank >= 21 && percent <= 5) return { key: "emerald" };
  if (rank >= 21 && percent <= 15) return { key: "platinum" };
  if (rank >= 21 && percent <= 35) return { key: "gold" };
  if (rank >= 21 && percent <= 65) return { key: "silver" };
  if (rank >= 21 && percent <= 100) return { key: "bronze" };
  return { key: "default" };
}

function sanitizeHistory(list) {
  return (list || []).map(h => {
    const reason = typeof h.reason === 'string'
      ? h.reason.replace(/(쿠폰\s*사용)\s+([A-Za-z0-9]{16}|[A-Za-z0-9]{4}(?:[-_.\s]?[A-Za-z0-9]{4}){3})/gi, '$1')
      : h.reason;
    return { ...h, reason };
  });
}

function buildEmbed(targetUser, data, page, maxPage, filter, searchTerm, be, displayName, opts = {}) {
  const historyHidden = !!opts.historyHidden;
  const privacyNotice = !!opts.privacyNotice;
  let historyList = sanitizeHistory(data.history || []);
  if (!historyHidden) {
    if (filter === FILTERS.EARN) historyList = historyList.filter(h => h.type === 'earn');
    if (filter === FILTERS.SPEND) historyList = historyList.filter(h => h.type === 'spend');
    if (filter === FILTERS.SEARCH && searchTerm) historyList = historyList.filter(h => (h.reason && h.reason.includes(searchTerm)) || String(h.amount).includes(searchTerm));
  } else {
    historyList = [];
  }
  const total = historyList.length;
  const offset = (page - 1) * PAGE_SIZE;
  const history = historyHidden
    ? "🔒 비공개 설정됨 (후원자)"
    : (historyList.slice().reverse().slice(offset, offset + PAGE_SIZE).map(h => `${h.type === "earn" ? "🔷" : "🔻"} ${formatAmount(h.amount)} BE | ${h.reason || "사유 없음"} | <t:${Math.floor(h.timestamp / 1000)}:R>`).join('\n') || "내역 없음");
  const tax = getTax(data.amount);
  const { rank, percent } = getRankInfo(targetUser.id, be);
  const tier = getTierInfo(rank, percent);
  const tierName = TIER_NAME[tier.key];
  const tierImage = TIER_IMAGE[tier.key];
  const profileIcon = targetUser.displayAvatarURL({ extension: "png", size: 64 });
  let top = `🔷파랑 정수(BE): **${formatAmount(data.amount)} BE**`;
  if (privacyNotice) top = `⚠️ 해당 유저는 💜𝕯𝖔𝖓𝖔𝖗 권한으로 정수 내역을 비공개중입니다.\n\n${top}`;
  let footerText = '';
  if (!historyHidden) {
    if (filter === FILTERS.SEARCH && searchTerm) footerText = `검색어: "${searchTerm}"`;
    else if (filter === FILTERS.EARN) footerText = '이익(earn)만 표시중';
    else if (filter === FILTERS.SPEND) footerText = '손해(spend)만 표시중';
  }
  footerText += (footerText ? ' | ' : '') + `오늘 18:00 정수세 예정: ${formatAmount(tax)} BE`;
  const nameForTitle = displayName || targetUser.username;
  const currentPage = historyHidden ? 1 : page;
  const currentMax = historyHidden ? 1 : Math.max(1, maxPage);
  const embed = new EmbedBuilder()
    .setTitle(`💙 ${nameForTitle} (${rank ? `${rank}위/${tierName}` : '랭크없음'})`)
    .setDescription(top)
    .addFields({ name: `📜 최근 거래 내역 (${currentPage}/${currentMax})${historyHidden ? ' [비공개]' : ''}`, value: history })
    .setColor(0x3399ff)
    .setThumbnail(tierImage)
    .setFooter({ text: footerText, iconURL: profileIcon });
  return embed;
}

function buildRow(page, maxPage, filter, opts = {}) {
  const canSearch = opts.canSearch !== false;
  const showPrivacyToggle = !!opts.showPrivacyToggle;
  const privacyOn = !!opts.privacyOn;
  const privacyToggleDisabled = !!opts.privacyToggleDisabled;
  const main = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('prev').setLabel('◀ 이전').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1 || !canSearch),
    new ButtonBuilder().setCustomId('next').setLabel('다음 ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage || !canSearch)
  );
  if (canSearch) {
    main.addComponents(
      new ButtonBuilder().setCustomId('search').setEmoji('🔍').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('earnonly').setLabel('🟦 이익만').setStyle(filter === FILTERS.EARN ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('spendonly').setLabel('🔻 손해만').setStyle(filter === FILTERS.SPEND ? ButtonStyle.Danger : ButtonStyle.Secondary)
    );
  }
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('taxinfo').setLabel('정수세 안내').setStyle(ButtonStyle.Secondary)
  );
  if (showPrivacyToggle) {
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId('privacy_toggle')
        .setLabel(privacyOn ? '🔒 내역 비공개[💜𝕯𝖔𝖓𝖔𝖗] ON' : '🔓 내역 비공개[💜𝕯𝖔𝖓𝖔𝖗] OFF')
        .setStyle(privacyOn ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(privacyToggleDisabled)
    );
  }
  return [main, row2];
}

function hasAnyRole(member, roleIds) {
  if (!member) return false;
  for (const id of roleIds) if (member.roles.cache.has(id)) return true;
  return false;
}

async function buildBeView(interaction, targetUser, state = {}) {
  const targetId = targetUser.id;
  let displayName = targetUser.username;
  try {
    if (interaction.guild) {
      const member = await interaction.guild.members.fetch(targetUser.id);
      if (member && member.displayName) displayName = member.displayName;
    }
  } catch {}
  const be = loadBE();
  const data = be[targetId] || { amount: 0, history: [] };
  const privacy = loadPrivacy();
  let privacyOn = !!privacy[targetId];
  if (privacyOn && interaction.guild) {
    try {
      const m = await interaction.guild.members.fetch(targetId);
      if (!m.roles.cache.has(DONOR_ROLE)) {
        delete privacy[targetId];
        savePrivacy(privacy);
        privacyOn = false;
      }
    } catch {
      delete privacy[targetId];
      savePrivacy(privacy);
      privacyOn = false;
    }
  }
  const viewerIsOwner = interaction.user.id === targetId;
  const viewerIsStaff = interaction.guild ? hasAnyRole(interaction.member, STAFF_ROLES) : false;
  const historyHidden = privacyOn && !viewerIsOwner && !viewerIsStaff;
  const privacyNotice = privacyOn && !viewerIsOwner && viewerIsStaff;
  let page = state.page || 1;
  let filter = state.filter || FILTERS.ALL;
  let searchTerm = state.searchTerm || '';
  const historyListAll = sanitizeHistory(data.history || []);
  let filteredHistory = historyListAll;
  if (filter === FILTERS.EARN) filteredHistory = historyListAll.filter(h => h.type === 'earn');
  else if (filter === FILTERS.SPEND) filteredHistory = historyListAll.filter(h => h.type === 'spend');
  else if (filter === FILTERS.SEARCH && searchTerm) filteredHistory = historyListAll.filter(h => (h.reason && h.reason.includes(searchTerm)) || String(h.amount).includes(searchTerm));
  let maxPage = Math.max(1, Math.ceil((historyHidden ? 0 : filteredHistory.length) / PAGE_SIZE));
  page = Math.max(1, Math.min(page, maxPage));
  const embed = buildEmbed(targetUser, data, page, maxPage, filter, searchTerm, be, displayName, { historyHidden, privacyNotice });
  const showPrivacyToggle = viewerIsOwner;
  const privacyToggleDisabled = !(interaction.member?.roles.cache.has(DONOR_ROLE));
  const rows = buildRow(historyHidden ? 1 : page, historyHidden ? 1 : maxPage, filter, { canSearch: !historyHidden, showPrivacyToggle, privacyOn, privacyToggleDisabled, targetId });
  return { embeds: [embed], components: rows, files: [] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수조회')
    .setDescription('파랑 정수(BE) 잔액과 최근 거래내역을 확인합니다.')
    .addUserOption(opt => opt.setName('유저').setDescription('조회할 대상 유저 (입력 안하면 본인)').setRequired(false)),
  async execute(interaction) {
    const userOpt = interaction.options.getUser('유저');
    const targetUser = userOpt || interaction.user;
    const targetId = targetUser.id;
    const be = loadBE();
    const data = be[targetId];
    if (!data) {
      await interaction.reply({ content: `❌ <@${targetId}>님의 🔷파랑 정수(BE) 데이터가 없습니다.`, ephemeral: true });
      return;
    }
    const view = await buildBeView(interaction, targetUser);
    const msg = await interaction.reply({ embeds: view.embeds, components: view.components, ephemeral: true, fetchReply: true });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });
    let page = 1;
    let filter = FILTERS.ALL;
    let searchTerm = '';
    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) return await i.reply({ content: '본인만 조작 가능.', ephemeral: true });
      const [key] = i.customId.includes(':') ? i.customId.split(':') : [i.customId, null];
      if (key === 'taxinfo') {
        const freshBEAll = loadBE();
        const nowTax = getTax((freshBEAll[targetId] || { amount: 0 }).amount);
        const recentTaxHistory = (freshBEAll[targetId]?.history || []).filter(h => h.reason && h.reason.includes('정수세')).slice(-5).reverse();
        let taxHistoryText = recentTaxHistory.length ? recentTaxHistory.map(h => `• ${formatAmount(h.amount)} BE (${h.reason}) - <t:${Math.floor(h.timestamp/1000)}:R>`).join('\n') : '최근 정수세 납부 내역이 없습니다.';
        const tableText = TAX_TABLE.map(([cond, rate]) => `${cond.padEnd(9)}: ${rate}`).join('\n');
        const infoEmbed = new EmbedBuilder().setTitle('💸 정수세 안내').setColor(0x4bb0fd).setDescription(['※ 정수세는 매일 18:00에 자동으로 납부됩니다.', '', '**정수세 누진세율 표**', '```', tableText, '```', `**현재 잔액 기준 납부 예정 세금:**\n> ${formatAmount(nowTax)} BE`, '', '**최근 정수세 납부 기록**', taxHistoryText].join('\n')).setFooter({ text: '정수세는 [세율표]에 따라 실시간 변동될 수 있습니다.' });
        await i.reply({ embeds: [infoEmbed], ephemeral: true });
        return;
      }
      if (key === 'privacy_toggle') {
        if (i.user.id !== interaction.user.id) return await i.reply({ content: '본인만 변경 가능.', ephemeral: true });
        try {
          const me = await interaction.guild.members.fetch(interaction.user.id);
          if (!me.roles.cache.has(DONOR_ROLE)) {
            const p = loadPrivacy();
            delete p[interaction.user.id];
            savePrivacy(p);
            const re = await buildBeView(interaction, targetUser, { page: 1, filter: FILTERS.ALL, searchTerm: '' });
            await i.update({ embeds: re.embeds, components: re.components });
            return;
          }
        } catch {
          return await i.reply({ content: '길드 정보를 확인할 수 없어 변경 실패.', ephemeral: true });
        }
        const p = loadPrivacy();
        const now = !!p[interaction.user.id];
        if (now) delete p[interaction.user.id];
        else p[interaction.user.id] = true;
        savePrivacy(p);
        const re = await buildBeView(interaction, targetUser, { page, filter, searchTerm });
        await i.update({ embeds: re.embeds, components: re.components });
        return;
      }
      const freshBE = loadBE();
      const freshData = freshBE[targetId] || { amount: 0, history: [] };
      const privacy = loadPrivacy();
      const viewerIsOwner = interaction.user.id === targetId;
      const viewerIsStaff = interaction.guild ? hasAnyRole(interaction.member, STAFF_ROLES) : false;
      const privacyOnPromise = (async () => {
        const has = !!privacy[targetId];
        if (!has) return false;
        if (!interaction.guild) return false;
        try {
          const m = await interaction.guild.members.fetch(targetId);
          return m.roles.cache.has(DONOR_ROLE);
        } catch { return false; }
      })();
      const resolvedPrivacyOn = await privacyOnPromise;
      const historyHidden = resolvedPrivacyOn && !viewerIsOwner && !viewerIsStaff;
      if (historyHidden) return await i.reply({ content: '해당 사용자의 최근 내역은 비공개입니다.[💜서버 후원자: 𝕯𝖔𝖓𝖔𝖗 권한]', ephemeral: true });
      if (key === 'prev') page--;
      if (key === 'next') page++;
      if (key === 'earnonly') { filter = filter === FILTERS.EARN ? FILTERS.ALL : FILTERS.EARN; searchTerm = ''; page = 1; }
      if (key === 'spendonly') { filter = filter === FILTERS.SPEND ? FILTERS.ALL : FILTERS.SPEND; searchTerm = ''; page = 1; }
      if (key === 'search') {
        const modal = new ModalBuilder().setCustomId(`be_search_modal_${targetId}`).setTitle('거래내역 검색');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('searchTerm').setLabel('검색어(금액/사유 등)').setStyle(TextInputStyle.Short).setPlaceholder('예: 강화, 1000, 송금').setRequired(true)));
        await i.showModal(modal);
        return;
      }
      const historyList = sanitizeHistory(freshData.history || []);
      let filteredHistory = historyList;
      if (filter === FILTERS.EARN) filteredHistory = historyList.filter(h => h.type === 'earn');
      else if (filter === FILTERS.SPEND) filteredHistory = historyList.filter(h => h.type === 'spend');
      const maxPage = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
      page = Math.max(1, Math.min(page, maxPage));
      let displayName = targetUser.username;
      try {
        if (interaction.guild) {
          const member = await interaction.guild.members.fetch(targetId).catch(() => null);
          if (member && member.displayName) displayName = member.displayName;
        }
      } catch {}
      const newEmbed = buildEmbed(targetUser, freshData, page, maxPage, filter, searchTerm, freshBE, displayName, { historyHidden: false, privacyNotice: false });
      const rows = buildRow(
        page,
        maxPage,
        filter,
        {
          canSearch: true,
          showPrivacyToggle: i.user.id === targetId,
          privacyOn: !!(loadPrivacy()[targetId]),
          privacyToggleDisabled: !interaction.member.roles.cache.has(DONOR_ROLE),
          targetId
        }
      );
      await i.update({ embeds: [newEmbed], components: rows });
    });
    collector.on('end', async () => {
      try { await msg.edit({ components: [] }); } catch {}
    });
  }
};

module.exports.modal = async function(interaction) {
  let ownerId = interaction.user.id;
  let targetUser = interaction.user;
  const idFromCustomId = interaction.customId.split("_")[3];
  if (idFromCustomId) {
    ownerId = idFromCustomId;
    targetUser = await interaction.client.users.fetch(ownerId);
  }
  const be = loadBE();
  const data = be[ownerId];
  if (!data) return await interaction.reply({ content: '데이터 없음', ephemeral: true });
  const privacy = loadPrivacy();
  let privacyOn = !!privacy[ownerId];
  if (privacyOn && interaction.guild) {
    try {
      const m = await interaction.guild.members.fetch(ownerId);
      if (!m.roles.cache.has(DONOR_ROLE)) {
        delete privacy[ownerId];
        savePrivacy(privacy);
        privacyOn = false;
      }
    } catch {
      delete privacy[ownerId];
      savePrivacy(privacy);
      privacyOn = false;
    }
  }
  const viewerIsOwner = interaction.user.id === ownerId;
  const viewerIsStaff = interaction.guild ? hasAnyRole(interaction.member, STAFF_ROLES) : false;
  if (privacyOn && !viewerIsOwner && !viewerIsStaff) {
    return await interaction.reply({ content: '🔒 해당 사용자의 최근 정수 내역은 비공개입니다.[💜서버 후원자: 𝕯𝖔𝖓𝖔𝖗 권한]', ephemeral: true });
  }
  let displayName = targetUser.username;
  try {
    if (interaction.guild) {
      const member = await interaction.guild.members.fetch(targetUser.id);
      if (member && member.displayName) displayName = member.displayName;
    }
  } catch {}
  let searchTerm = interaction.fields.getTextInputValue('searchTerm').trim();
  let historyList = sanitizeHistory(data?.history || []);
  let filteredHistory = historyList.filter(h => (h.reason && h.reason.includes(searchTerm)) || String(h.amount).includes(searchTerm));
  let page = 1;
  let maxPage = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  let filter = FILTERS.SEARCH;
  const embed = buildEmbed(targetUser, { ...data, history: filteredHistory }, page, maxPage, filter, searchTerm, be, displayName, { historyHidden: false, privacyNotice: privacyOn && !viewerIsOwner && viewerIsStaff });
  const rows = buildRow(page, maxPage, filter, { canSearch: true, showPrivacyToggle: viewerIsOwner, privacyOn: !!privacy[ownerId], privacyToggleDisabled: !interaction.member.roles.cache.has(DONOR_ROLE), targetId: ownerId });
  await interaction.update({ embeds: [embed], components: rows });
};

module.exports.buildView = async function(interaction, targetUser) {
  return await buildBeView(interaction, targetUser);
};
