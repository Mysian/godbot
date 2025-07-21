// godbot/commands/be-check.js
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

function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, '{}');
  return JSON.parse(fs.readFileSync(bePath, 'utf8'));
}
const formatAmount = n => Number(n).toLocaleString('ko-KR');
const EMBED_IMAGE = 'https://media.discordapp.net/attachments/1388728993787940914/1392698206189523113/Image_fx.jpg?ex=68707ac7&is=686f2947&hm=cf727fd173aaf411d649eec368a03b3715b7518075715dde84f97a9976a6b7a8&=&format=webp';

const PAGE_SIZE = 10;
const FILTERS = { ALL: 'all', EARN: 'earn', SPEND: 'spend', SEARCH: 'search' };

// 정수세 납부액 계산
function getTax(amount) {
  if (amount < 5_000_000) return 0;
  if (amount >= 1_000_000_000_000) return Math.floor(amount * 0.5);
  if (amount >=   10_000_000_000) return Math.floor(amount * 0.25);
  if (amount >=    5_000_000_000) return Math.floor(amount * 0.10);
  if (amount >=    1_000_000_000) return Math.floor(amount * 0.075);
  if (amount >=      500_000_000) return Math.floor(amount * 0.05);
  if (amount >=      100_000_000) return Math.floor(amount * 0.035);
  if (amount >=       50_000_000) return Math.floor(amount * 0.02);
  if (amount >=       10_000_000) return Math.floor(amount * 0.015);
  if (amount >=        5_000_000) return Math.floor(amount * 0.01);
  if (amount >=        1_000_000) return Math.floor(amount * 0.005);
  return Math.floor(amount * 0.001);
}

function buildEmbed(targetUser, data, page, maxPage, filter, searchTerm = '') {
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

  if (filter === FILTERS.SEARCH && searchTerm)
    footerText = `검색어: "${searchTerm}"`;
  else if (filter === FILTERS.EARN)
    footerText = '이익(earn)만 표시중';
  else if (filter === FILTERS.SPEND)
    footerText = '손해(spend)만 표시중';

  footerText += (footerText ? ' | ' : '') + `오늘 18:00 정수세 예정: ${formatAmount(tax)} BE`;

  const embed = new EmbedBuilder()
    .setTitle(`💙 ${targetUser.tag}`)
    .setDescription(`🔷파랑 정수(BE): **${formatAmount(data.amount)} BE**`)
    .addFields(
      { name: `📜 최근 거래 내역 (${page}/${maxPage}) [총 ${total}개]`, value: history }
    )
    .setColor(0x3399ff)
    .setImage(EMBED_IMAGE)
    .setThumbnail(targetUser.displayAvatarURL({ extension: "png", size: 256 }))
    .setFooter({ text: footerText });

  return embed;
}

function buildRow(page, maxPage, filter) {
  return new ActionRowBuilder().addComponents(
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

    const embed = buildEmbed(targetUser, data, page, maxPage, filter, searchTerm);
    const row = buildRow(page, maxPage, filter);

    const msg = await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true
    });

    // 5분 동안 상호작용 가능
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300_000 });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id)
        return await i.reply({ content: '본인만 조작 가능.', ephemeral: true });

      // 새로고침 시점마다 BE 다시 로딩
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
        // 모달 customId에 유저ID 포함
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

      // 필터 적용
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

      const newEmbed = buildEmbed(targetUser, freshData, page, maxPage, filter, searchTerm);
      const newRow = buildRow(page, maxPage, filter);

      await i.update({ embeds: [newEmbed], components: [newRow] });
    });

    collector.on('end', async () => {
      try {
        await msg.edit({ components: [] });
      } catch (e) { }
    });
  }
};

// ==== 모달 핸들러 (본인/타인 모두 지원) ====
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

  const embed = buildEmbed(targetUser, data, page, maxPage, filter, searchTerm);
  const row = buildRow(page, maxPage, filter);

  await interaction.update({ embeds: [embed], components: [row] });
};
