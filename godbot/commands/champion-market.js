const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const passiveSkills = require('../utils/passive-skills');
const { getChampionIcon } = require('../utils/champion-utils');

const marketPath = path.join(__dirname, '../data/champion-market.json');
const userChampPath = path.join(__dirname, '../data/champion-users.json');
const bePath = path.join(__dirname, '../data/BE.json');

function loadMarket() {
  if (!fs.existsSync(marketPath)) fs.writeFileSync(marketPath, '[]');
  return JSON.parse(fs.readFileSync(marketPath, 'utf8'));
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

// 임베드 만들기
async function makeMarketEmbed(page = 0, filter = null) {
  let market = loadMarket().sort((a, b) => b.timestamp - a.timestamp);
  if (filter) market = market.filter(item => item.championName.includes(filter));
  const perPage = 5;
  const start = page * perPage;
  const items = market.slice(start, start + perPage);

  const embed = new EmbedBuilder()
    .setTitle(filter ? `챔피언 거래소 (검색: ${filter})` : '챔피언 거래소')
    .setDescription(items.length ? `총 ${market.length}건 | ${page + 1}페이지` : '현재 등록된 매물이 없습니다.')
    .setColor(0x1d8fff);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const passive = passiveSkills[item.championName]
      ? `**${passiveSkills[item.championName].name}**: ${passiveSkills[item.championName].description}`
      : "정보 없음";
    const iconUrl = await getChampionIcon(item.championName);
    embed.addFields({
      name: `#${start + i + 1} | 🌟 ${item.championName} (Lv.${item.level})`,
      value: [
        `[아이콘](${iconUrl}) | 공격력: **${item.stats.attack}** | 주문력: **${item.stats.ap}** | 체력: **${item.stats.hp}** | 방어력: **${item.stats.defense}** | 관통력: **${item.stats.penetration}**`,
        `🪄 패시브: ${passive}`,
        `💎 가격: **${item.price} BE**`,
        `👤 판매자: <@${item.sellerId}>`
      ].join('\n')
    });
  }
  return embed;
}

// 버튼 생성
function makeButtons(page, maxPage) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('champ_market_prev')
      .setLabel('이전 페이지')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('champ_market_next')
      .setLabel('다음 페이지')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPage),
    new ButtonBuilder()
      .setCustomId('champ_market_search')
      .setLabel('챔피언 검색')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('champ_market_buy')
      .setLabel('챔피언 구매')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('champ_market_sell')
      .setLabel('챔피언 판매')
      .setStyle(ButtonStyle.Danger)
  );
}

// 챔피언 판매 모달
function makeSellModal() {
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
      )
    );
}

// 챔피언 구매 모달
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

// 챔피언 검색 모달
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
    let page = 0;
    let filter = null;
    let market = loadMarket();
    let maxPage = Math.max(0, Math.ceil(market.length / 5) - 1);

    let embed = await makeMarketEmbed(page, filter);
    let buttons = makeButtons(page, maxPage);

    await interaction.reply({ embeds: [embed], components: [buttons] });

    // 버튼/모달 인터랙션 핸들러
    const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async i => {
      // 페이지네이션
      if (i.customId === 'champ_market_prev') page--;
      if (i.customId === 'champ_market_next') page++;

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
        // 유저가 챔피언을 갖고 있어야만 판매 가능
        const users = loadUsers();
        if (!users[i.user.id]) {
          await i.reply({ content: '현재 보유 중인 챔피언이 없습니다. 챔피언을 먼저 획득하세요!', ephemeral: true });
          return;
        }
        await i.showModal(makeSellModal());
        return;
      }

      // 임베드 새로고침
      market = loadMarket();
      if (filter) market = market.filter(item => item.championName.includes(filter));
      maxPage = Math.max(0, Math.ceil(market.length / 5) - 1);
      embed = await makeMarketEmbed(page, filter);
      buttons = makeButtons(page, maxPage);
      await i.update({ embeds: [embed], components: [buttons] });
    });

    // 모달 제출 핸들러
    interaction.client.on('interactionCreate', async modal => {
      if (!modal.isModalSubmit()) return;

      // 챔피언 검색
      if (modal.customId === 'champ_search_modal') {
        filter = modal.fields.getTextInputValue('name');
        page = 0;
        market = loadMarket();
        market = market.filter(item => item.championName.includes(filter));
        maxPage = Math.max(0, Math.ceil(market.length / 5) - 1);
        embed = await makeMarketEmbed(page, filter);
        buttons = makeButtons(page, maxPage);
        await modal.reply({ embeds: [embed], components: [buttons] });
        return;
      }

      // 챔피언 구매
      if (modal.customId === 'champ_buy_modal') {
        const itemNum = parseInt(modal.fields.getTextInputValue('itemNum')) - 1;
        const allMarket = filter
          ? loadMarket().filter(item => item.championName.includes(filter)).sort((a, b) => b.timestamp - a.timestamp)
          : loadMarket().sort((a, b) => b.timestamp - a.timestamp);

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
        let market = loadMarket();
        const idx = market.findIndex(m => m.timestamp === item.timestamp && m.sellerId === item.sellerId);
        if (idx !== -1) {
          market.splice(idx, 1);
          saveMarket(market);
        }

        await modal.reply({ content: `🎉 ${item.championName} 챔피언을 ${item.price} BE에 구매 완료!`, ephemeral: false });
        return;
      }

      // 챔피언 판매
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
        // champion-market.json에 매물 추가
        const market = loadMarket();
        market.push({
          championName: champ.name,
          level: champ.level,
          success: champ.success ?? 0,
          stats: champ.stats,
          price,
          sellerId: modal.user.id,
          sellerTag: modal.user.tag,
          timestamp: Date.now()
        });
        saveMarket(market);

        // 유저에서 챔피언 정보 삭제
        delete users[modal.user.id];
        saveUsers(users);

        await modal.reply({ content: `챔피언 ${champ.name}이(가) ${price} BE에 거래소에 등록되었습니다!`, ephemeral: false });
        return;
      }
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] }).catch(() => {});
      } catch (e) {}
    });
  }
};
