const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const bePath = path.join(__dirname, '../data/BE.json');

function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, '{}');
  return JSON.parse(fs.readFileSync(bePath, 'utf8'));
}
const formatAmount = n => Number(n).toLocaleString('ko-KR');

const PAGE_SIZE = 20;
const MAX_HISTORY = 200;
const FILTERS = { ALL: 'all', EARN: 'earn', SPEND: 'spend', SEARCH: 'search' };
const EMBED_IMAGE = 'https://media.discordapp.net/attachments/1388728993787940914/1392698206189523113/Image_fx.jpg?ex=68707ac7&is=686f2947&hm=cf727fd173aaf411d649eec368a03b3715b7518075715dde84f97a9976a6b7a8&=&format=webp';

function buildEmbed({ targetUser, data, page, maxPage, filter, searchTerm }) {
  let historyList = data.history || [];
  // 최근 200개만 사용
  historyList = historyList.slice(-MAX_HISTORY);
  if (filter === FILTERS.EARN) historyList = historyList.filter(h => h.type === "earn");
  if (filter === FILTERS.SPEND) historyList = historyList.filter(h => h.type === "spend");
  if (filter === FILTERS.SEARCH && searchTerm) {
    historyList = historyList.filter(h =>
      (h.reason && h.reason.includes(searchTerm)) ||
      String(h.amount).includes(searchTerm)
    );
  }

  const total = historyList.length;
  maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  page = Math.max(1, Math.min(page, maxPage));
  const offset = (page - 1) * PAGE_SIZE;

  const sliced = historyList.slice().reverse().slice(offset, offset + PAGE_SIZE);
  const historyText = sliced.length
    ? sliced.map(h =>
        `${h.type === "earn" ? "🔷" : "🔻"} ${formatAmount(h.amount)} BE | ${h.reason || "사유 없음"} | <t:${Math.floor(h.timestamp / 1000)}:R>`
      ).join('\n')
    : "내역 없음";

  const embed = new EmbedBuilder()
    .setTitle(`💙 ${targetUser.tag}`)
    .setDescription(`<@${targetUser.id}>님의 🔷파랑 정수(BE) 잔액: **${formatAmount(data.amount)} BE**\n\n**최근 거래 내역은 200개까지만 조회/검색됩니다.**`)
    .addFields(
      { name: `📜 최근 거래 내역 (${page}/${maxPage}) [총 ${total}개]`, value: historyText }
    )
    .setColor(0x3399ff)
    .setImage(EMBED_IMAGE);

  if (filter === FILTERS.SEARCH && searchTerm) {
    embed.setFooter({ text: `검색어: "${searchTerm}" | 최근 200개 내역 내에서만 검색됩니다.` });
  } else if (filter === FILTERS.EARN) {
    embed.setFooter({ text: `이익(earn)만 표시중 | 최근 200개까지만 조회됨` });
  } else if (filter === FILTERS.SPEND) {
    embed.setFooter({ text: `손해(spend)만 표시중 | 최근 200개까지만 조회됨` });
  } else {
    embed.setFooter({ text: `최근 200개까지만 조회/검색할 수 있습니다.` });
  }
  return embed;
}

function buildRow({ page, maxPage, filter }) {
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
      .setCustomId('refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
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
    const targetUser = interaction.options.getUser('유저') || interaction.user;
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
    // 최근 200개만 집계
    let historyList = (data.history || []).slice(-MAX_HISTORY);
    let maxPage = Math.max(1, Math.ceil(historyList.length / PAGE_SIZE));

    const embed = buildEmbed({ targetUser, data, page, maxPage, filter, searchTerm });
    const row = buildRow({ page, maxPage, filter });

    const msg = await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true
    });

    // 300초(5분) 동안 상호작용
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300 * 1000 });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) return await i.reply({ content: '본인만 조작 가능.', ephemeral: true });

      // 새로고침 시점에 BE 다시 로딩 + 최근 200개만
      const freshBE = loadBE();
      const freshData = freshBE[targetUser.id] || { amount: 0, history: [] };
      historyList = (freshData.history || []).slice(-MAX_HISTORY);

      if (i.customId === 'prev') page--;
      if (i.customId === 'next') page++;
      if (i.customId === 'refresh') {
        filter = FILTERS.ALL;
        searchTerm = '';
        page = 1;
      }
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
          .setCustomId('be_search_modal')
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
        const submitted = await i.awaitModalSubmit({ time: 30_000 }).catch(() => null);
        if (submitted) {
          searchTerm = submitted.fields.getTextInputValue('searchTerm').trim();
          filter = FILTERS.SEARCH;
          page = 1;
          historyList = (freshBE[targetUser.id]?.history || []).slice(-MAX_HISTORY);
          maxPage = Math.max(1, Math.ceil(
            historyList.filter(h =>
              (h.reason && h.reason.includes(searchTerm)) ||
              String(h.amount).includes(searchTerm)
            ).length / PAGE_SIZE
          ));
          const embedSearched = buildEmbed({ targetUser, data: freshData, page, maxPage, filter, searchTerm });
          const rowSearched = buildRow({ page, maxPage, filter });
          await submitted.update({ embeds: [embedSearched], components: [rowSearched] });
        }
        return;
      }

      let filteredHistory = historyList;
      if (filter === FILTERS.EARN) filteredHistory = filteredHistory.filter(h => h.type === "earn");
      if (filter === FILTERS.SPEND) filteredHistory = filteredHistory.filter(h => h.type === "spend");
      if (filter === FILTERS.SEARCH && searchTerm) {
        filteredHistory = filteredHistory.filter(h =>
          (h.reason && h.reason.includes(searchTerm)) ||
          String(h.amount).includes(searchTerm)
        );
      }
      maxPage = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
      page = Math.max(1, Math.min(page, maxPage));
      const embed2 = buildEmbed({ targetUser, data: freshData, page, maxPage, filter, searchTerm });
      const row2 = buildRow({ page, maxPage, filter });

      await i.update({ embeds: [embed2], components: [row2] });
    });

    collector.on('end', async () => {
      try {
        await msg.edit({ components: [] });
      } catch (e) { }
    });
  }
};
