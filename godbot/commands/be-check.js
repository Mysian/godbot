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

// 티어별 이미지 URL 직접 입력
const TIER_IMAGE = {
  champion:   "https://media.discordapp.net/attachments/1398143977051652217/1398156467059556422/10_.png?ex=6884562e&is=688304ae&hm=d472083d30da8f31b149b6818361ce456b4b6d7dc1661e2328685117e474ec80&=&format=webp&quality=lossless&width=888&height=888",     // 1위
  challenger: "https://media.discordapp.net/attachments/1398143977051652217/1398156432762736731/8_.png?ex=68845626&is=688304a6&hm=f07a8c795f7086a7982f590df11709d2c53a5327a30a78d165f650d14787874b&=&format=webp&quality=lossless&width=888&height=888",   // 2~5위
  legend:     "https://media.discordapp.net/attachments/1398143977051652217/1398156419642949824/7_.png?ex=68845622&is=688304a2&hm=18ec47803f660efa4ea6d97307501cc96831916d559b4db1da52f3b59abe550b&=&format=webp&quality=lossless&width=888&height=888",       // 6~10위
  diamond:    "https://media.discordapp.net/attachments/1398143977051652217/1398156401238347796/6_.png?ex=6884561e&is=6883049e&hm=ce91718cd8a57c5fa9f73bd87208b48d499f05d135a5ee1e9c40bfd30a3c32a2&=&format=webp&quality=lossless&width=888&height=888",      // 11~20위
  emerald:    "https://media.discordapp.net/attachments/1398143977051652217/1398156383018291243/5_.png?ex=6884561a&is=6883049a&hm=8910df7a7109a1b25df40212cadab46c7623d035ff2501f08837ff65f4d6b983&=&format=webp&quality=lossless&width=888&height=888",      // 상위 5%
  platinum:   "https://media.discordapp.net/attachments/1398143977051652217/1398156369885925527/4_.png?ex=68845617&is=68830497&hm=027cf1b399799abc798d956adb3c16ae658ea17ac31bff022308fde58e3a1027&=&format=webp&quality=lossless&width=888&height=888",     // 6~15%
  gold:       "https://media.discordapp.net/attachments/1398143977051652217/1398156357810524171/3_.png?ex=68845614&is=68830494&hm=f8b248ec38986e68259ce81d715b3b9661ba2dd9a39f50c4ba44a860fed2f062&=&format=webp&quality=lossless&width=888&height=888",         // 16~35%
  silver:     "https://media.discordapp.net/attachments/1398143977051652217/1398156346456674356/2_.png?ex=68845611&is=68830491&hm=6423ca01333a2bb05216dcfd010fe098b2e74425175747b4258251fcc6711267&=&format=webp&quality=lossless&width=888&height=888",       // 36~65%
  bronze:     "https://media.discordapp.net/attachments/1398143977051652217/1398156333181698229/1_.png?ex=6884560e&is=6883048e&hm=bf4e71da293e5ee1ecf37fd456540c5273dffbd27aed42bff646f7fe9dd1e232&=&format=webp&quality=lossless&width=888&height=888",       // 66~100%
  default:    "https://media.discordapp.net/attachments/1398143977051652217/1398156333181698229/1_.png?ex=6884560e&is=6883048e&hm=bf4e71da293e5ee1ecf37fd456540c5273dffbd27aed42bff646f7fe9dd1e232&=&format=webp&quality=lossless&width=888&height=888"
};

// 티어명 텍스트
const TIER_NAME = {
  champion:   "챔피언",
  challenger: "챌린저",
  legend:     "레전드",
  diamond:    "다이아",
  emerald:    "에메랄드",
  platinum:   "플래티넘",
  gold:       "골드",
  silver:     "실버",
  bronze:     "브론즈",
  default:    "없음"
};

function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, '{}');
  return JSON.parse(fs.readFileSync(bePath, 'utf8'));
}
const formatAmount = n => Number(n).toLocaleString('ko-KR');

const PAGE_SIZE = 10;
const FILTERS = { ALL: 'all', EARN: 'earn', SPEND: 'spend', SEARCH: 'search' };

function getTax(amount) {
  if (amount < 5_000_000) return 0;
  if (amount < 10_000_000) return Math.floor(amount * 0.001);
  if (amount < 50_000_000) return Math.floor(amount * 0.005);
  if (amount < 100_000_000) return Math.floor(amount * 0.01);
  if (amount < 500_000_000) return Math.floor(amount * 0.015);
  if (amount < 1_000_000_000) return Math.floor(amount * 0.02);
  if (amount < 5_000_000_000) return Math.floor(amount * 0.035);
  if (amount < 10_000_000_000) return Math.floor(amount * 0.05);
  if (amount < 100_000_000_000) return Math.floor(amount * 0.075);
  if (amount < 500_000_000_000) return Math.floor(amount * 0.10);
  if (amount < 1_000_000_000_000) return Math.floor(amount * 0.25);
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

// === [순위 산정 함수] ===
function getRankInfo(targetUserId, be) {
  const rankArr = Object.entries(be)
    .map(([id, d]) => ({ id, amount: d.amount }))
    .sort((a, b) => b.amount - a.amount);

  const idx = rankArr.findIndex(e => e.id === targetUserId);
  if (idx === -1) return { rank: null, percent: 100, total: rankArr.length };

  const rank = idx + 1;
  const percent = Math.round((rank / rankArr.length) * 100);

  return { rank, percent, total: rankArr.length };
}

// === 티어 구하기 ===
function getTierInfo(rank, percent) {
  if (rank === 1)                  return { key: "champion" };
  if (rank >= 2 && rank <= 5)      return { key: "challenger" };
  if (rank >= 6 && rank <= 10)     return { key: "legend" };
  if (rank >= 11 && rank <= 20)    return { key: "diamond" };
  // 21위 이상 퍼센트 티어
  if (rank >= 21 && percent <= 5)  return { key: "emerald" };
  if (rank >= 21 && percent <= 15) return { key: "platinum" };
  if (rank >= 21 && percent <= 35) return { key: "gold" };
  if (rank >= 21 && percent <= 65) return { key: "silver" };
  if (rank >= 21 && percent <= 100)return { key: "bronze" };
  return { key: "default" };
}

// === 임베드 생성 ===
function buildEmbed(targetUser, data, page, maxPage, filter, searchTerm = '', be) {
  let historyList = data.history || [];
  if (filter === FILTERS.EARN) historyList = historyList.filter(h => h.type === 'earn');
  if (filter === FILTERS.SPEND) historyList = historyList.filter(h => h.type === 'spend');
  if (filter === FILTERS.SEARCH && searchTerm) {
    historyList = historyList.filter(h =>
      (h.reason && h.reason.includes(searchTerm)) ||
      String(h.amount).includes(searchTerm)
    );
  }

  const total = historyList.length;
  const offset = (page - 1) * PAGE_SIZE;
  const history = historyList
    .slice()
    .reverse()
    .slice(offset, offset + PAGE_SIZE)
    .map(h =>
      `${h.type === "earn" ? "🔷" : "🔻"} ${formatAmount(h.amount)} BE | ${h.reason || "사유 없음"} | <t:${Math.floor(h.timestamp / 1000)}:R>`
    ).join('\n') || "내역 없음";

  const tax = getTax(data.amount);

  let footerText = '';
  if (filter === FILTERS.SEARCH && searchTerm) footerText = `검색어: "${searchTerm}"`;
  else if (filter === FILTERS.EARN) footerText = '이익(earn)만 표시중';
  else if (filter === FILTERS.SPEND) footerText = '손해(spend)만 표시중';
  footerText += (footerText ? ' | ' : '') + `오늘 18:00 정수세 예정: ${formatAmount(tax)} BE`;

  // [순위 정보]
  const { rank, percent, total: totalRanked } = getRankInfo(targetUser.id, be);
  const tier = getTierInfo(rank, percent);
  const tierName = TIER_NAME[tier.key];
  const tierImage = TIER_IMAGE[tier.key];

  const embed = new EmbedBuilder()
    .setTitle(`💙 ${targetUser.tag} (${rank ? `${rank}위/${tierName}` : '랭크없음'})`)
    .setDescription(`🔷파랑 정수(BE): **${formatAmount(data.amount)} BE**`)
    .addFields(
      { name: `📜 최근 거래 내역 (${page}/${maxPage}) [총 ${total}개]`, value: history }
    )
    .setColor(0x3399ff)
    .setThumbnail(targetUser.displayAvatarURL({ extension: "png", size: 256 })) // 프로필 (작게)
    .setImage(tierImage) // 티어 이미지(크게, 하단)
    .setFooter({ text: footerText });

  return embed;
}

function buildRow(page, maxPage, filter) {
  const mainRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setLabel('◀ 이전')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('다음 ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPage),
    new ButtonBuilder()
      .setCustomId('search')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('earnonly')
      .setLabel('🟦 이익만')
      .setStyle(filter === FILTERS.EARN ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('spendonly')
      .setLabel('🔻 손해만')
      .setStyle(filter === FILTERS.SPEND ? ButtonStyle.Danger : ButtonStyle.Secondary)
  );
  const taxInfoRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('taxinfo')
      .setLabel('정수세 안내')
      .setStyle(ButtonStyle.Secondary)
  );
  return [mainRow, taxInfoRow];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수조회')
    .setDescription('파랑 정수(BE) 잔액과 최근 거래내역을 확인합니다.')
    .addUserOption(opt =>
      opt.setName('유저')
        .setDescription('조회할 대상 유저 (입력 안하면 본인)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const userOpt = interaction.options.getUser('유저');
    const targetUser = userOpt || interaction.user;
    const be = loadBE();
    const data = be[targetUser.id];

    if (!data) {
      await interaction.reply({
        content: `❌ <@${targetUser.id}>님의 🔷파랑 정수(BE) 데이터가 없습니다.`,
        ephemeral: true
      });
      return;
    }

    let page = 1;
    let filter = FILTERS.ALL;
    let searchTerm = '';
    let historyList = data.history || [];
    let filteredHistory = historyList;
    if (filter === FILTERS.EARN) filteredHistory = historyList.filter(h => h.type === 'earn');
    if (filter === FILTERS.SPEND) filteredHistory = historyList.filter(h => h.type === 'spend');
    if (filter === FILTERS.SEARCH && searchTerm) {
      filteredHistory = historyList.filter(h =>
        (h.reason && h.reason.includes(searchTerm)) ||
        String(h.amount).includes(searchTerm)
      );
    }
    let maxPage = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));

    const embed = buildEmbed(targetUser, data, page, maxPage, filter, searchTerm, be);
    const rows = buildRow(page, maxPage, filter);

    const msg = await interaction.reply({
      embeds: [embed],
      components: rows,
      ephemeral: true,
      fetchReply: true
    });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300_000 });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id)
        return await i.reply({ content: '본인만 조작 가능.', ephemeral: true });

      if (i.customId === 'taxinfo') {
        const nowTax = getTax(data.amount);
        const recentTaxHistory = (data.history || [])
          .filter(h => h.reason && h.reason.includes('정수세'))
          .slice(-5)
          .reverse();

        let taxHistoryText = recentTaxHistory.length
          ? recentTaxHistory.map(h =>
              `• ${formatAmount(h.amount)} BE (${h.reason}) - <t:${Math.floor(h.timestamp/1000)}:R>`
            ).join('\n')
          : '최근 정수세 납부 내역이 없습니다.';

        const tableText = TAX_TABLE.map(([cond, rate]) => `${cond.padEnd(9)}: ${rate}`).join('\n');
        const infoEmbed = new EmbedBuilder()
          .setTitle('💸 정수세 안내')
          .setColor(0x4bb0fd)
          .setDescription([
            '※ 정수세는 매일 18:00에 자동으로 납부됩니다.',
            '',
            '**정수세 누진세율 표**',
            '```',
            tableText,
            '```',
            `**현재 잔액 기준 납부 예정 세금:**\n> ${formatAmount(nowTax)} BE`,
            '',
            '**최근 정수세 납부 기록**',
            taxHistoryText
          ].join('\n'))
          .setFooter({ text: '정수세는 [세율표]에 따라 실시간 변동될 수 있습니다.' });

        await i.reply({ embeds: [infoEmbed], ephemeral: true });
        return;
      }

      const freshBE = loadBE();
      const freshData = freshBE[targetUser.id] || { amount: 0, history: [] };
      historyList = freshData.history || [];

      if (i.customId === 'prev') page--;
      if (i.customId === 'next') page++;
      if (i.customId === 'earnonly') {
        filter = filter === FILTERS.EARN ? FILTERS.ALL : FILTERS.EARN;
        searchTerm = '';
        page = 1;
      }
      if (i.customId === 'spendonly') {
        filter = filter === FILTERS.SPEND ? FILTERS.ALL : FILTERS.SPEND;
        searchTerm = '';
        page = 1;
      }
      if (i.customId === 'search') {
        const modal = new ModalBuilder()
          .setCustomId(`be_search_modal_${targetUser.id}`)
          .setTitle('거래내역 검색');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('searchTerm')
              .setLabel('검색어(금액/사유 등)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('예: 강화, 1000, 송금')
              .setRequired(true)
          )
        );
        await i.showModal(modal);
        return;
      }

      filteredHistory = historyList;
      if (filter === FILTERS.EARN) filteredHistory = historyList.filter(h => h.type === 'earn');
      if (filter === FILTERS.SPEND) filteredHistory = historyList.filter(h => h.type === 'spend');
      if (filter === FILTERS.SEARCH && searchTerm) {
        filteredHistory = historyList.filter(h =>
          (h.reason && h.reason.includes(searchTerm)) ||
          String(h.amount).includes(searchTerm)
        );
      }
      maxPage = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
      page = Math.max(1, Math.min(page, maxPage));

      const newEmbed = buildEmbed(targetUser, freshData, page, maxPage, filter, searchTerm, freshBE);
      const newRows = buildRow(page, maxPage, filter);

      await i.update({ embeds: [newEmbed], components: newRows });
    });

    collector.on('end', async () => {
      try {
        await msg.edit({ components: [] });
      } catch (e) { }
    });
  }
};

module.exports.modal = async function(interaction) {
  let userId = interaction.user.id;
  let targetUser = interaction.user;
  const idFromCustomId = interaction.customId.split("_")[3];
  if (idFromCustomId) {
    userId = idFromCustomId;
    targetUser = await interaction.client.users.fetch(userId);
  }
  const be = loadBE();
  const data = be[userId];

  let searchTerm = interaction.fields.getTextInputValue('searchTerm').trim();
  let historyList = (data?.history || []);
  let filteredHistory = historyList.filter(h =>
    (h.reason && h.reason.includes(searchTerm)) ||
    String(h.amount).includes(searchTerm)
  );
  let page = 1;
  let maxPage = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  let filter = FILTERS.SEARCH;

  const embed = buildEmbed(targetUser, data, page, maxPage, filter, searchTerm, be);
  const rows = buildRow(page, maxPage, filter);

  await interaction.update({ embeds: [embed], components: rows });
};
