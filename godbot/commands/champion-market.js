const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const passiveSkills = require('../utils/passive-skills');
const { battles, battleRequests } = require("./champ-battle"); // ★ 추가

// 경로
const marketPath = path.join(__dirname, '../data/champion-market.json');
const userChampPath = path.join(__dirname, '../data/champion-users.json');
const bePath = path.join(__dirname, '../data/BE.json');

function loadMarket() {
  if (!fs.existsSync(marketPath)) fs.writeFileSync(marketPath, '[]');
  try {
    const parsed = JSON.parse(fs.readFileSync(marketPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    fs.writeFileSync(marketPath, '[]');
    return [];
  }
}
function saveMarket(data) {
  fs.writeFileSync(marketPath, JSON.stringify(data, null, 2));
}
function loadUsers() {
  if (!fs.existsSync(userChampPath)) fs.writeFileSync(userChampPath, '{}');
  return JSON.parse(fs.readFileSync(userChampPath, 'utf8'));
}
function saveUsers(data) {
  fs.writeFileSync(userChampPath, JSON.stringify(data, null, 2));
}
function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, '{}');
  return JSON.parse(fs.readFileSync(bePath, 'utf8'));
}
function saveBE(data) {
  fs.writeFileSync(bePath, JSON.stringify(data, null, 2));
}

// --- 정렬 함수 ---
function sortMarket(market) {
  // level 높은 순 → 가격 낮은 순 → 최신순
  return [...market].sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    if (a.price !== b.price) return a.price - b.price;
    return b.timestamp - a.timestamp;
  });
}

// --- 버튼 2줄(매물관리 추가) ---
function makeButtons(page, maxPage, inManage = false) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('champ_market_prev')
      .setLabel('이전 페이지')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('champ_market_refresh')
      .setLabel('새로고침')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('champ_market_next')
      .setLabel('다음 페이지')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPage)
  );
  const row2 = new ActionRowBuilder().addComponents(
    ...(inManage
      ? [
          new ButtonBuilder()
            .setCustomId('champ_market_exit_manage')
            .setLabel('거래소로 돌아가기')
            .setStyle(ButtonStyle.Primary)
        ]
      : [
          new ButtonBuilder()
            .setCustomId('champ_market_search')
            .setLabel('챔피언 검색')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('champ_market_buy')
            .setLabel('챔피언 구매')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('champ_market_sell')
            .setLabel('챔피언 판매')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('champ_market_manage')
            .setLabel('매물 관리')
            .setStyle(ButtonStyle.Secondary)
        ])
  );
  return [row1, row2];
}

// --- 일반/검색/매물관리 임베드 생성 ---
async function makeMarketEmbed(page, market, interactionUserId, isManage = false) {
  const perPage = 5;
  const start = page * perPage;
  const items = market.slice(start, start + perPage);

  const embed = new EmbedBuilder()
    .setTitle(isManage ? '내 매물 관리' : '챔피언 거래소')
    .setDescription(
      (items.length ? `총 ${market.length}건 | ${page + 1}페이지\n` : '현재 등록된 매물이 없습니다.\n') +
      `\n**이 거래소 버튼은 <@${interactionUserId}>님만 사용 가능하며, 2분 후 자동으로 닫힙니다.**`
    )
    .setColor(isManage ? 0x10c933 : 0x1d8fff);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const passive = passiveSkills[item.championName]
      ? `**${passiveSkills[item.championName].name}**: ${passiveSkills[item.championName].description}`
      : "정보 없음";
    embed.addFields({
      name: `#${start + i + 1} | 🌟 ${item.championName} (Lv.${item.level})`,
      value: [
        `공격력: **${item.stats.attack}** | 주문력: **${item.stats.ap}** | 체력: **${item.stats.hp}** | 방어력: **${item.stats.defense}** | 관통력: **${item.stats.penetration}**`,
        `🪄 패시브: ${passive}`,
        `💎 가격: **${item.price} BE**`,
        `👤 판매자: <@${item.sellerId}>`
      ].join('\n')
    });
  }
  return embed;
}

// --- 매물관리 회수버튼 ---
function makeManageButtons(page, maxPage, items) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('champ_market_prev')
      .setLabel('이전 페이지')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('champ_market_refresh')
      .setLabel('새로고침')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('champ_market_next')
      .setLabel('다음 페이지')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPage)
  );
  const row2 = new ActionRowBuilder();
  items.forEach((item, idx) =>
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`champ_manage_recall_${idx}`)
        .setLabel(`#${page * 5 + idx + 1} 회수`)
        .setStyle(ButtonStyle.Danger)
    )
  );
  row2.addComponents(
    new ButtonBuilder()
      .setCustomId('champ_market_exit_manage')
      .setLabel('거래소로 돌아가기')
      .setStyle(ButtonStyle.Primary)
  );
  return [row1, row2];
}

// --- 챔피언 판매 모달 ---
function makeSellModal(champName, champLevel) {
  return new ModalBuilder()
    .setCustomId('champ_sell_modal')
    .setTitle('챔피언 판매 등록')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('price')
          .setLabel('판매 가격(숫자, BE)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('예: 5000')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('info')
          .setLabel('판매 예정 챔피언')
          .setStyle(TextInputStyle.Short)
          .setValue(`${champName} (Lv.${champLevel})`)
          .setRequired(false)
      )
    );
}

// --- 구매 모달 ---
function makeBuyModal() {
  return new ModalBuilder()
    .setCustomId('champ_buy_modal')
    .setTitle('챔피언 구매')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('itemNum')
          .setLabel('구매할 챔피언 번호(예: 1, 2, 3...)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

// --- 검색 모달 ---
function makeSearchModal() {
  return new ModalBuilder()
    .setCustomId('champ_search_modal')
    .setTitle('챔피언 검색')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('검색할 챔피언명')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('챔피언거래소')
    .setDescription('파랑 정수로 챔피언을 사고팔 수 있는 거래소를 엽니다.'),
  async execute(interaction) {
    // [추가] 배틀 중/대기 중이면 거래소 이용 불가!
    const userId = interaction.user.id;
    if (battles.has(userId) || battleRequests.has(userId)) {
      return interaction.reply({
        content: "진행중/대기중인 챔피언 배틀이 있어 거래소를 이용할 수 없습니다!",
        ephemeral: true
      });
    }

    let page = 0;
    let filter = null;
    let isManage = false;
    let market = sortMarket(loadMarket());
    let interactionUserId = interaction.user.id;
    let maxPage = Math.max(0, Math.ceil(market.length / 5) - 1);

    let embed = await makeMarketEmbed(page, market, interactionUserId, isManage);
    let [row1, row2] = makeButtons(page, maxPage, isManage);

    await interaction.reply({ embeds: [embed], components: [row1, row2] });

    // --- collector: 명령어 입력자만, 120초간 ---
    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interactionUserId,
      time: 120000
    });

    let manageMarket = [];
    let managePage = 0;
    let manageMaxPage = 0;

    collector.on('collect', async i => {
      if (isManage) {
        // 관리 모드
        if (i.customId === 'champ_market_exit_manage') {
          // 거래소로 돌아가기
          isManage = false;
          market = sortMarket(loadMarket());
          maxPage = Math.max(0, Math.ceil(market.length / 5) - 1);
          embed = await makeMarketEmbed(page, market, interactionUserId, false);
          [row1, row2] = makeButtons(page, maxPage, false);
          await i.update({ embeds: [embed], components: [row1, row2] });
          return;
        }
        if (i.customId.startsWith('champ_manage_recall_')) {
          // 매물 회수 시도
          const idx = parseInt(i.customId.replace('champ_manage_recall_', ''));
          const allMine = sortMarket(loadMarket().filter(m => m.sellerId === interactionUserId));
          const item = allMine[managePage * 5 + idx];
          if (!item) {
            await i.reply({ content: '해당 매물을 찾을 수 없습니다.', ephemeral: true });
            return;
          }
          // 본인 소유 챔피언이 있으면 불가
          const users = loadUsers();
          if (users[interactionUserId]) {
            await i.reply({ content: '챔피언을 이미 보유 중일 땐 회수할 수 없습니다.', ephemeral: true });
            return;
          }
          // 매물 제거 + 챔피언 소유 복구
          let all = loadMarket();
          all = all.filter(m => !(m.timestamp === item.timestamp && m.sellerId === interactionUserId));
          saveMarket(all);
          users[interactionUserId] = {
            name: item.championName,
            level: item.level,
            success: item.success ?? 0,
            stats: item.stats,
            timestamp: Date.now()
          };
          saveUsers(users);

          // 매물관리 임베드 갱신
          manageMarket = sortMarket(loadMarket().filter(m => m.sellerId === interactionUserId));
          manageMaxPage = Math.max(0, Math.ceil(manageMarket.length / 5) - 1);
          embed = await makeMarketEmbed(managePage, manageMarket, interactionUserId, true);
          [row1, row2] = makeManageButtons(managePage, manageMaxPage, manageMarket.slice(managePage * 5, managePage * 5 + 5));
          await i.update({ embeds: [embed], components: [row1, row2] });
          await i.followUp({ content: '매물을 성공적으로 회수했습니다!', ephemeral: true });
          return;
        }
        // 관리 모드 페이지 이동/새로고침
        if (i.customId === 'champ_market_prev') managePage--;
        if (i.customId === 'champ_market_next') managePage++;
        if (i.customId === 'champ_market_refresh') { /* 새로고침 */ }
        manageMarket = sortMarket(loadMarket().filter(m => m.sellerId === interactionUserId));
        manageMaxPage = Math.max(0, Math.ceil(manageMarket.length / 5) - 1);
        embed = await makeMarketEmbed(managePage, manageMarket, interactionUserId, true);
        [row1, row2] = makeManageButtons(managePage, manageMaxPage, manageMarket.slice(managePage * 5, managePage * 5 + 5));
        await i.update({ embeds: [embed], components: [row1, row2] });
        return;
      }

      // 거래소 일반 모드
      if (i.customId === 'champ_market_prev') page--;
      if (i.customId === 'champ_market_next') page++;
      if (i.customId === 'champ_market_refresh') { /* 새로고침 */ }

      if (i.customId === 'champ_market_manage') {
        // 매물 관리 모드 진입
        isManage = true;
        managePage = 0;
        manageMarket = sortMarket(loadMarket().filter(m => m.sellerId === interactionUserId));
        manageMaxPage = Math.max(0, Math.ceil(manageMarket.length / 5) - 1);
        embed = await makeMarketEmbed(managePage, manageMarket, interactionUserId, true);
        [row1, row2] = makeManageButtons(managePage, manageMaxPage, manageMarket.slice(managePage * 5, managePage * 5 + 5));
        await i.update({ embeds: [embed], components: [row1, row2] });
        return;
      }

      // 검색 버튼
      if (i.customId === 'champ_market_search') {
        await i.showModal(makeSearchModal());
        return;
      }
      // 구매 버튼
      if (i.customId === 'champ_market_buy') {
        await i.showModal(makeBuyModal());
        return;
      }
      // 판매 버튼
      if (i.customId === 'champ_market_sell') {
        const users = loadUsers();
        const champ = users[i.user.id];
        if (!champ) {
          await i.reply({ content: '현재 보유 중인 챔피언이 없습니다. 챔피언을 먼저 획득하세요!', ephemeral: true });
          return;
        }
        // ---- 매물 개수 제한 ----
        const marketArr = loadMarket();
        const mySellCount = marketArr.filter(m => m.sellerId === i.user.id).length;
        if (mySellCount >= 5) {
          await i.reply({ content: '한 사람당 최대 5개의 매물만 등록할 수 있습니다.\n매물을 회수하거나 팔린 뒤에 추가 등록이 가능합니다.', ephemeral: true });
          return;
        }
        await i.showModal(makeSellModal(champ.name, champ.level));
        return;
      }

      // 임베드 새로고침
      market = sortMarket(filter
        ? loadMarket().filter(item => item.championName.includes(filter))
        : loadMarket());
      maxPage = Math.max(0, Math.ceil(market.length / 5) - 1);
      embed = await makeMarketEmbed(page, market, interactionUserId, false);
      [row1, row2] = makeButtons(page, maxPage, false);
      await i.update({ embeds: [embed], components: [row1, row2] });
    });

    // 모달 제출 핸들러
    const modalHandler = async modal => {
      if (!modal.isModalSubmit()) return;
      if (modal.user.id !== interactionUserId) return;

      // [추가] 배틀 중/대기 중이면 거래소 모달(검색/구매/판매)도 막음!
      if (battles.has(modal.user.id) || battleRequests.has(modal.user.id)) {
        await modal.reply({
          content: "진행중/대기중인 챔피언 배틀이 있어 거래소를 이용할 수 없습니다!",
          ephemeral: true
        });
        return;
      }

      // 검색
      if (modal.customId === 'champ_search_modal') {
        filter = modal.fields.getTextInputValue('name');
        page = 0;
        market = sortMarket(loadMarket().filter(item => item.championName.includes(filter)));
        maxPage = Math.max(0, Math.ceil(market.length / 5) - 1);
        embed = await makeMarketEmbed(page, market, interactionUserId, false);
        [row1, row2] = makeButtons(page, maxPage, false);
        await interaction.editReply({ embeds: [embed], components: [row1, row2] });
        await modal.deferUpdate();
        return;
      }

      // 구매
      if (modal.customId === 'champ_buy_modal') {
        const itemNum = parseInt(modal.fields.getTextInputValue('itemNum')) - 1;
        const allMarket = filter
          ? sortMarket(loadMarket().filter(item => item.championName.includes(filter)))
          : sortMarket(loadMarket());

        if (!allMarket[itemNum]) {
          await modal.reply({ content: '해당 번호의 매물이 없습니다.', ephemeral: true });
          return;
        }
        const item = allMarket[itemNum];

        // 이미 챔피언 소유 중인지 확인
        const users = loadUsers();
        if (users[modal.user.id]) {
          await modal.reply({ content: '이미 챔피언을 보유 중이므로, 구매할 수 없습니다.', ephemeral: true });
          return;
        }
        // 파랑 정수 잔액 체크
        const be = loadBE();
        const balance = be[modal.user.id]?.amount || 0;
        if (balance < item.price) {
          await modal.reply({ content: `파랑 정수가 부족합니다! (보유: ${balance} BE / 필요: ${item.price} BE)`, ephemeral: true });
          return;
        }
        // 구매 처리
        be[modal.user.id] = be[modal.user.id] || { amount: 0, history: [] };
        be[modal.user.id].amount -= item.price;
        be[modal.user.id].history.push({
          type: 'spend',
          amount: item.price,
          reason: `챔피언 구매: ${item.championName}`,
          timestamp: Date.now()
        });
        saveBE(be);

        // 챔피언 등록
        users[modal.user.id] = {
          name: item.championName,
          level: item.level,
          success: item.success ?? 0,
          stats: item.stats,
          timestamp: Date.now()
        };
        saveUsers(users);

        // 매물 삭제
        let marketArr = loadMarket();
        const idx = marketArr.findIndex(m => m.timestamp === item.timestamp && m.sellerId === item.sellerId);
        let sellerId = item.sellerId;
        if (idx !== -1) {
          marketArr.splice(idx, 1);
          saveMarket(marketArr);
        }

        // 구매 멘트: @구매자께서 OO 챔피언을 n BE에 구매하였습니다. [판매자: @판매자]
        await modal.reply({
          content: `<@${modal.user.id}> 께서 ${item.championName} 챔피언을 ${item.price} BE에 구매하였습니다. [판매자: <@${sellerId}>]`,
          ephemeral: false
        });
        return;
      }

      // 판매
      if (modal.customId === 'champ_sell_modal') {
        const price = parseInt(modal.fields.getTextInputValue('price'));
        if (isNaN(price) || price <= 0) {
          await modal.reply({ content: '가격은 1 이상 숫자여야 합니다.', ephemeral: true });
          return;
        }
        const users = loadUsers();
        const champ = users[modal.user.id];
        if (!champ) {
          await modal.reply({ content: '판매할 챔피언 정보가 없습니다.', ephemeral: true });
          return;
        }
        // 매물 최대 5개 제한
        const marketArr = loadMarket();
        const mySellCount = marketArr.filter(m => m.sellerId === modal.user.id).length;
        if (mySellCount >= 5) {
          await modal.reply({ content: '한 사람당 최대 5개의 매물만 등록할 수 있습니다.\n매물을 회수하거나 팔린 뒤에 추가 등록이 가능합니다.', ephemeral: true });
          return;
        }
        // champion-market.json에 매물 추가
        marketArr.push({
          championName: champ.name,
          level: champ.level,
          success: champ.success ?? 0,
          stats: champ.stats,
          price,
          sellerId: modal.user.id,
          sellerTag: modal.user.tag,
          timestamp: Date.now()
        });
        saveMarket(marketArr);

        // 유저에서 챔피언 정보 삭제
        delete users[modal.user.id];
        saveUsers(users);

        await modal.reply({
          content: `챔피언 ${champ.name}이(가) ${price} BE에 거래소에 등록되었습니다!`,
          ephemeral: true
        });
        return;
      }
    };

    interaction.client.on('interactionCreate', modalHandler);

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] });
        await interaction.followUp({
          content: `⏰ **챔피언 거래소가 닫혔습니다!** (버튼 비활성화)`,
          ephemeral: true
        });
      } catch (e) {}
      interaction.client.removeListener('interactionCreate', modalHandler);
    });
  }
};
