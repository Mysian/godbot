const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

// === 경로 및 파일 ===
const bePath = path.join(__dirname, '../data/BE.json');
const itemsPath = path.join(__dirname, '../data/items.json');
const skillsPath = path.join(__dirname, '../data/skills.json');
const stockPath = path.join(__dirname, '../data/upgrade-stock.json');
const nicknameRolesPath = path.join(__dirname, '../data/nickname-roles.json');
const titlesPath = path.join(__dirname, '../data/limited-titles.json');

const NICKNAME_ROLE_PER_USER = 1; // 한 명당 1개만 허용(수정가능)
const CHANNEL_ROLE_ID = '1352582997400092755';
const CHANNEL_ROLE_PRICE = 3000000;

// === 강화 아이템 설정 ===
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

// === 파일 IO ===
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

// === 강화 아이템 재고 IO ===
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

// === 강화 아이템 재고 관리 ===
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

// === 메모리 플래그 ===
const userBuying = {};
const userShopOpen = {};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('상점')
    .setDescription('파랑 정수(BE)로 다양한 아이템/강화/역할을 구매할 수 있습니다.')
    .addStringOption(option =>
      option
        .setName('종류')
        .setDescription('상점 종류를 선택하세요.')
        .setRequired(true)
        .addChoices(
          { name: '챔피언 강화 아이템', value: 'upgrade' },
          { name: '배틀 아이템', value: 'item' },
          { name: '배틀 스킬', value: 'skill' },
          { name: '닉네임 색상', value: 'nickname' },
          { name: '개인채널 계약금', value: 'channel' },
          { name: '한정판 칭호', value: 'title' }
        )
    ),
  async execute(interaction) {
    try {
      if (userShopOpen[interaction.user.id]) {
        await interaction.reply({ content: '이미 상점 창이 열려있습니다. 먼저 기존 상점을 종료해주세요!', ephemeral: true });
        return;
      }
      userShopOpen[interaction.user.id] = true;
      const expireSec = 180;
      const sessionExpireAt = Date.now() + expireSec * 1000;
      let interval;
      await interaction.deferReply({ ephemeral: false });

      const kind = interaction.options.getString('종류');
      const be = await loadJson(bePath);
      const userBe = be[interaction.user.id]?.amount || 0;
      function getRemainSec() {
        return Math.max(0, Math.floor((sessionExpireAt - Date.now()) / 1000));
      }

      // ---- 아이템 상점 ----
      if (kind === 'item') {
        const ITEMS = require('../utils/items.js');
        const ITEM_LIST = Object.values(ITEMS);
        const sorted = ITEM_LIST.slice().sort((a, b) => b.price - a.price);
        let page = 0;
        const ITEMS_PER_PAGE = 5;
        const maxPage = Math.ceil(ITEM_LIST.length / ITEMS_PER_PAGE);

        const getEmbedAndRows = (_page, curBe) => {
          const showItems = sorted.slice(_page * ITEMS_PER_PAGE, (_page + 1) * ITEMS_PER_PAGE);
          const embed = new EmbedBuilder()
            .setTitle("🛒 아이템 상점")
            .setDescription(
              `🔷 내 파랑 정수: ${curBe} BE\n` +
              showItems.map((item, i) =>
                `#${i + 1 + _page * ITEMS_PER_PAGE} | ${item.icon || ""} **${item.name}** (${item.price} BE)\n${item.desc}`
              ).join("\n\n"))
            .setFooter({ text: `총 아이템: ${ITEM_LIST.length} | 페이지 ${_page + 1}/${maxPage}` });

          const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("item_prev").setLabel("이전 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page === 0),
            new ButtonBuilder().setCustomId("item_refresh").setLabel("새로고침").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("item_next").setLabel("다음 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page + 1 >= maxPage),
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
          return { embed, rows: [row1, rowBuy] };
        };

        let { embed, rows } = getEmbedAndRows(page, userBe);

        const shopMsg = await interaction.editReply({
          content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
          embeds: [embed],
          components: rows
        });

        interval = setInterval(async () => {
          try {
            await interaction.editReply({
              content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
              embeds: [embed],
              components: rows
            });
          } catch (e) {}
        }, 1000);

        const filter = i => i.user.id === interaction.user.id;
        const collector = shopMsg.createMessageComponentCollector({ filter, time: expireSec * 1000 });

        collector.on('collect', async i => {
          if (i.customId === "shop_close") {
            collector.stop("user");
            try { await i.update({ content: '상점이 닫혔습니다.', embeds: [], components: [] }); } catch {}
            return;
          }
          let updated = false;
          if (i.customId === "item_prev" && page > 0) { page--; updated = true; }
          if (i.customId === "item_next" && (page + 1) * ITEMS_PER_PAGE < sorted.length) { page++; updated = true; }
          if (i.customId === "item_refresh") { updated = true; }

          if (updated) {
            const beLive = (await loadJson(bePath))[interaction.user.id]?.amount || 0;
            ({ embed, rows } = getEmbedAndRows(page, beLive));
            await i.update({
              content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
              embeds: [embed],
              components: rows
            });
            return;
          }

          if (i.customId.startsWith("item_buy_")) {
            if (userBuying[i.user.id]) {
              await i.reply({ content: '이미 구매 처리 중입니다. 잠시만 기다려 주세요!', ephemeral: true });
              return;
            }
            userBuying[i.user.id] = true;
            try {
              const ITEMS = require('../utils/items.js');
              const ITEM_LIST = Object.values(ITEMS);
              const itemName = i.customId.replace("item_buy_", "");
              const item = ITEM_LIST.find(x => x.name === itemName);
              if (!item) {
                await i.reply({ content: "해당 아이템을 찾을 수 없습니다.", ephemeral: true });
                return;
              }
              const items = await loadJson(itemsPath);
              items[i.user.id] = items[i.user.id] || {};
              const myItem = items[i.user.id][item.name] || { count: 0, desc: item.desc };
              if (myItem.count >= 99) {
                await i.reply({ content: `최대 99개까지만 소지할 수 있습니다. (보유: ${myItem.count})`, ephemeral: true });
                return;
              }
              const be = await loadJson(bePath);
              const userBe = be[i.user.id]?.amount || 0;
              if (userBe < item.price) {
                await i.reply({ content: `파랑 정수 부족! (보유: ${userBe} BE)`, ephemeral: true });
                return;
              }
              be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
              be[i.user.id].amount -= item.price;
              be[i.user.id].history.push({ type: "spend", amount: item.price, reason: `${item.name} 구매`, timestamp: Date.now() });
              await saveJson(bePath, be);

              myItem.count += 1;
              items[i.user.id][item.name] = myItem;
              await saveJson(itemsPath, items);

              await i.reply({ content: `✅ [${item.name}]을(를) ${item.price} BE에 구매 완료! (최대 99개까지 소지 가능)`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류 발생: ${e.message}`, ephemeral: true });
            } finally {
              userBuying[i.user.id] = false;
            }
            return;
          }
        });

        collector.on('end', async () => {
          clearInterval(interval);
          try {
            await interaction.deleteReply();
          } catch (e) {}
          userBuying[interaction.user.id] = false;
          userShopOpen[interaction.user.id] = false;
        });
        return;
      }

      // ---- 닉네임 색상 역할 상점 ----
if (kind === 'nickname') {
  const ROLES = await loadJson(nicknameRolesPath);
  const roleList = Object.values(ROLES);
  if (roleList.length === 0) {
    await interaction.editReply('등록된 색상 역할이 없습니다.');
    userShopOpen[interaction.user.id] = false;
    return;
  }
  let page = 0;
  const ROLES_PER_PAGE = 1;
  const maxPage = Math.ceil(roleList.length / ROLES_PER_PAGE);
  let member = await interaction.guild.members.fetch(interaction.user.id);

  // 색상 코드 → 이미지 URL 변환 함수
  const hexToImgUrl = (hex) =>
    `https://singlecolorimage.com/get/${hex.replace('#', '')}/100x100`;
  const getEmbedAndRows = (_page, curBe) => {
    const showRoles = roleList.slice(_page * ROLES_PER_PAGE, (_page + 1) * ROLES_PER_PAGE);

    // 임베드 생성
    const embed = new EmbedBuilder()
      .setTitle('🎨 닉네임 색상 상점')
      .setDescription(`🔷 내 파랑 정수: ${curBe} BE`)
      .setFooter({ text: `총 색상 역할: ${roleList.length} | 페이지 ${_page + 1}/${maxPage}` });

    // (선택) 첫 번째 색상 이미지를 메인 임베드 이미지로 노출
    if (showRoles[0]?.color)
      embed.setImage(hexToImgUrl(showRoles[0].color));

    // 4개 색상 모두 필드로 추가
    showRoles.forEach((role, idx) => {
      embed.addFields({
        name: `${role.emoji || ''} ${role.name} (${role.price} BE)`,
        value:
          `${role.desc}\n` +
          (role.color
            ? `\`색상코드:\` ${role.color}\n[컬러 박스 미리보기](${hexToImgUrl(role.color)})`
            : ''
          ) +
          (member.roles.cache.has(role.roleId) ? '\n**[보유중]**' : ''),
        inline: false,
      });
    });

    // 버튼
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
      new ButtonBuilder().setCustomId('nick_prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(_page===0),
      new ButtonBuilder().setCustomId('nick_next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(_page+1>=maxPage),
      new ButtonBuilder().setCustomId('shop_close').setLabel('상점 닫기').setStyle(ButtonStyle.Danger)
    );
    return { embed, rows: [row, rowPage] };
  };

  let { embed, rows } = getEmbedAndRows(page, userBe);

  const shopMsg = await interaction.editReply({
    content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
    embeds: [embed],
    components: rows
  });

  interval = setInterval(async () => {
    try {
      const { embed: newEmbed, rows: newRows } = getEmbedAndRows(page, userBe);
      await interaction.editReply({
        content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
        embeds: [newEmbed],
        components: newRows
      });
    } catch {}
  }, 1000);

  const filter = i => i.user.id === interaction.user.id;
  const collector = shopMsg.createMessageComponentCollector({ filter, time: expireSec * 1000 });
  collector.on('collect', async i => {
    if (i.customId === 'shop_close') {
      collector.stop("user");
      try { await i.update({ content: '상점이 닫혔습니다.', embeds: [], components: [] }); } catch {}
      return;
    }
    let updated = false;
    if (i.customId === 'nick_prev' && page > 0) { page--; updated = true; }
    if (i.customId === 'nick_next' && (page+1)*ROLES_PER_PAGE < roleList.length) { page++; updated = true; }
    if (updated) {
      ({ embed, rows } = getEmbedAndRows(page, userBe));
      await i.update({
        content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
        embeds: [embed],
        components: rows
      });
      return;
    }
    if (i.customId.startsWith('nickname_buy_')) {
      const roleId = i.customId.replace('nickname_buy_', '');
      const roleData = roleList.find(x => x.roleId === roleId);
      if (!roleData) {
        await i.reply({ content: "해당 역할을 찾을 수 없습니다.", ephemeral: true });
        return;
      }
      if (member.roles.cache.has(roleId)) {
        await i.reply({ content: `이미 [${roleData.name}] 색상 역할을 보유 중입니다!`, ephemeral: true });
        return;
      }
      if (userBuying[i.user.id]) {
        await i.reply({ content: '이미 구매 처리 중입니다.', ephemeral: true });
        return;
      }
      userBuying[i.user.id] = true;
      try {
        const be = await loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < roleData.price) {
          await i.reply({ content: `파랑 정수 부족! (보유: ${userBe} BE)`, ephemeral: true });
          return;
        }
        // 한 명당 1개만 소유(다른 색상 있으면 제거)
        if (NICKNAME_ROLE_PER_USER > 0) {
          const allRoleIds = roleList.map(x => x.roleId);
          for (const rId of allRoleIds) {
            if (member.roles.cache.has(rId)) await member.roles.remove(rId, '색상 중복 방지');
          }
        }
        await member.roles.add(roleId, '닉네임 색상 구매');
        be[i.user.id].amount -= roleData.price;
        be[i.user.id].history.push({ type: "spend", amount: roleData.price, reason: `${roleData.name} 색상 역할 구매`, timestamp: Date.now() });
        await saveJson(bePath, be);
        await i.reply({ content: `✅ [${roleData.name}] 색상 역할을 ${roleData.price} BE에 구매 완료!`, ephemeral: true });
      } catch (e) {
        await i.reply({ content: `❌ 오류: ${e.message}`, ephemeral: true });
      } finally { userBuying[i.user.id] = false; }
      return;
    }
  });
  collector.on('end', async () => {
    clearInterval(interval);
    try { await interaction.deleteReply(); } catch {}
    userBuying[interaction.user.id] = false;
    userShopOpen[interaction.user.id] = false;
  });
  return;
}

      // ---- 개인채널 계약금 상점 ----
      if (kind === 'channel') {
        let member = await interaction.guild.members.fetch(interaction.user.id);
        let already = member.roles.cache.has(CHANNEL_ROLE_ID);
        const embed = new EmbedBuilder()
          .setTitle('🛎️ 개인채널 계약금')
          .setDescription(`3,000,000 BE\n역할 구매시 개인 전용 채널을 신청할 수 있는 권한이 부여됩니다.\n\n${already ? '> 이미 보유 중!' : '> 즉시 구매 가능'}`)
          .setColor('#FFD700');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('channel_buy')
            .setLabel(already ? '이미 보유중' : '구매')
            .setStyle(already ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(already),
          new ButtonBuilder()
            .setCustomId('shop_close')
            .setLabel('상점 닫기')
            .setStyle(ButtonStyle.Danger)
        );
        const shopMsg = await interaction.editReply({
          content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
          embeds: [embed],
          components: [row]
        });
        interval = setInterval(async () => {
          try {
            await interaction.editReply({
              content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
              embeds: [embed],
              components: [row]
            });
          } catch {}
        }, 1000);
        const filter = i => i.user.id === interaction.user.id;
        const collector = shopMsg.createMessageComponentCollector({ filter, time: expireSec * 1000 });
        collector.on('collect', async i => {
          if (i.customId === 'shop_close') {
            collector.stop("user");
            try { await i.update({ content: '상점이 닫혔습니다.', embeds: [], components: [] }); } catch {}
            return;
          }
          if (i.customId === 'channel_buy') {
            if (userBuying[i.user.id]) {
              await i.reply({ content: '이미 구매 처리 중입니다.', ephemeral: true });
              return;
            }
            userBuying[i.user.id] = true;
            try {
              const be = await loadJson(bePath);
              const userBe = be[i.user.id]?.amount || 0;
              if (userBe < CHANNEL_ROLE_PRICE) {
                await i.reply({ content: `파랑 정수 부족! (보유: ${userBe} BE)`, ephemeral: true });
                return;
              }
              await member.roles.add(CHANNEL_ROLE_ID, '개인채널 계약금 구매');
              be[i.user.id].amount -= CHANNEL_ROLE_PRICE;
              be[i.user.id].history.push({ type: "spend", amount: CHANNEL_ROLE_PRICE, reason: "개인채널 계약금 구매", timestamp: Date.now() });
              await saveJson(bePath, be);
              await i.reply({ content: `✅ 개인채널 계약금 역할 지급 완료!`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류: ${e.message}`, ephemeral: true });
            } finally { userBuying[i.user.id] = false; }
            return;
          }
        });
        collector.on('end', async () => {
          clearInterval(interval);
          try { await interaction.deleteReply(); } catch {}
          userBuying[interaction.user.id] = false;
          userShopOpen[interaction.user.id] = false;
        });
        return;
      }

      // ---- 한정판 칭호 상점 ----
      if (kind === 'title') {
        const TITLES = await loadJson(titlesPath);
        const titleList = Object.values(TITLES);
        if (titleList.length === 0) {
          await interaction.editReply('등록된 한정판 칭호가 없습니다.');
          userShopOpen[interaction.user.id] = false;
          return;
        }
        let page = 0, TITLE_PER_PAGE = 5, maxPage = Math.ceil(titleList.length / TITLE_PER_PAGE);
        let member = await interaction.guild.members.fetch(interaction.user.id);
        const getEmbedAndRows = (_page, curBe) => {
          const showTitles = titleList.slice(_page * TITLE_PER_PAGE, (_page + 1) * TITLE_PER_PAGE);
          const embed = new EmbedBuilder()
            .setTitle('🏅 한정판 칭호 상점')
            .setDescription(
              `🔷 내 파랑 정수: ${curBe} BE\n` +
              showTitles.map((t, i) => {
                let owned = member.roles.cache.has(t.roleId);
                let stockMsg = (t.stock === undefined || t.stock === null) ? '' : (t.stock <= 0 ? '\n> [품절]' : `\n> [남은 수량: ${t.stock}개]`);
                return `#${i+1+_page*TITLE_PER_PAGE} | ${t.emoji||''} **${t.name}** (${t.price} BE)
${t.desc}
${stockMsg}
> ${owned ? '**[보유중]**' : ''}`;
              }).join('\n\n')
            )
            .setFooter({ text: `총 칭호: ${titleList.length} | 페이지 ${_page + 1}/${maxPage}` });
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
            new ButtonBuilder().setCustomId('title_prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(_page===0),
            new ButtonBuilder().setCustomId('title_refresh').setLabel('새로고침').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('title_next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(_page+1>=maxPage),
            new ButtonBuilder().setCustomId('shop_close').setLabel('상점 닫기').setStyle(ButtonStyle.Danger)
          );
          return { embed, rows: [row, rowPage] };
        };
        let { embed, rows } = getEmbedAndRows(page, userBe);
        const shopMsg = await interaction.editReply({
          content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
          embeds: [embed],
          components: rows
        });
        interval = setInterval(async () => {
          try {
            const { embed: newEmbed, rows: newRows } = getEmbedAndRows(page, userBe);
            await interaction.editReply({
              content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
              embeds: [newEmbed],
              components: newRows
            });
          } catch {}
        }, 1000);
        const filter = i => i.user.id === interaction.user.id;
        const collector = shopMsg.createMessageComponentCollector({ filter, time: expireSec * 1000 });
        collector.on('collect', async i => {
          if (i.customId === 'shop_close') {
            collector.stop("user");
            try { await i.update({ content: '상점이 닫혔습니다.', embeds: [], components: [] }); } catch {}
            return;
          }
          let updated = false;
          if (i.customId === 'title_prev' && page > 0) { page--; updated = true; }
          if (i.customId === 'title_next' && (page+1)*TITLE_PER_PAGE < titleList.length) { page++; updated = true; }
          if (i.customId === 'title_refresh') { updated = true; }
          if (updated) {
            ({ embed, rows } = getEmbedAndRows(page, userBe));
            await i.update({
              content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
              embeds: [embed],
              components: rows
            });
            return;
          }
          if (i.customId.startsWith('title_buy_')) {
            const roleId = i.customId.replace('title_buy_', '');
            const titleData = titleList.find(x => x.roleId === roleId);
            if (!titleData) {
              await i.reply({ content: "해당 칭호를 찾을 수 없습니다.", ephemeral: true });
              return;
            }
            if (member.roles.cache.has(roleId)) {
              await i.reply({ content: `이미 [${titleData.name}] 칭호를 보유 중입니다!`, ephemeral: true });
              return;
            }
            if (titleData.stock !== undefined && titleData.stock !== null && titleData.stock <= 0) {
              await i.reply({ content: "품절입니다!", ephemeral: true });
              return;
            }
            if (userBuying[i.user.id]) {
              await i.reply({ content: '이미 구매 처리 중입니다.', ephemeral: true });
              return;
            }
            userBuying[i.user.id] = true;
            try {
              const be = await loadJson(bePath);
              const userBe = be[i.user.id]?.amount || 0;
              if (userBe < titleData.price) {
                await i.reply({ content: `파랑 정수 부족! (보유: ${userBe} BE)`, ephemeral: true });
                return;
              }
              await member.roles.add(roleId, '한정판 칭호 구매');
              be[i.user.id].amount -= titleData.price;
              be[i.user.id].history.push({ type: "spend", amount: titleData.price, reason: `${titleData.name} 칭호 구매`, timestamp: Date.now() });
              await saveJson(bePath, be);
              // 수량 차감
              if (titleData.stock !== undefined && titleData.stock !== null) {
                titleData.stock--;
                const TITLES2 = await loadJson(titlesPath);
                if (TITLES2[roleId]) {
                  TITLES2[roleId].stock = titleData.stock;
                  await saveJson(titlesPath, TITLES2);
                }
              }
              await i.reply({ content: `✅ [${titleData.name}] 칭호 역할을 ${titleData.price} BE에 구매 완료!`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류: ${e.message}`, ephemeral: true });
            } finally { userBuying[i.user.id] = false; }
            return;
          }
        });
        collector.on('end', async () => {
          clearInterval(interval);
          try { await interaction.deleteReply(); } catch {}
          userBuying[interaction.user.id] = false;
          userShopOpen[interaction.user.id] = false;
        });
        return;
      }

      // ---- 스킬 상점 ----
      if (kind === 'skill') {
        const SKILLS = require('../utils/active-skills.js');
        const SKILL_LIST = Object.values(SKILLS);
        const sorted = SKILL_LIST.slice().sort((a, b) => b.price - a.price);
        let page = 0;
        const SKILLS_PER_PAGE = 5;
        const maxPage = Math.ceil(SKILL_LIST.length / SKILLS_PER_PAGE);

        const getEmbedAndRows = (_page, curBe) => {
          const showSkills = sorted.slice(_page * SKILLS_PER_PAGE, (_page + 1) * SKILLS_PER_PAGE);
          const embed = new EmbedBuilder()
            .setTitle("📚 스킬 상점")
            .setDescription(
              `🔷 내 파랑 정수: ${curBe} BE\n` +
              showSkills.map((skill, i) =>
                `#${i + 1 + _page * SKILLS_PER_PAGE} | ${skill.icon || ""} **${skill.name}** (${skill.price} BE)\n${skill.desc}`
              ).join("\n\n"))
            .setFooter({ text: `총 스킬: ${SKILL_LIST.length} | 페이지 ${_page + 1}/${maxPage}` });

          const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("skill_prev").setLabel("이전 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page === 0),
            new ButtonBuilder().setCustomId("skill_refresh").setLabel("새로고침").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("skill_next").setLabel("다음 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page + 1 >= maxPage),
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
          return { embed, rows: [row1, rowBuy] };
        };

        let { embed, rows } = getEmbedAndRows(page, userBe);

        const shopMsg = await interaction.editReply({
          content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
          embeds: [embed],
          components: rows
        });

        interval = setInterval(async () => {
          try {
            await interaction.editReply({
              content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
              embeds: [embed],
              components: rows
            });
          } catch (e) {}
        }, 1000);

        const filter = i => i.user.id === interaction.user.id;
        const collector = shopMsg.createMessageComponentCollector({ filter, time: expireSec * 1000 });

        collector.on('collect', async i => {
          if (i.customId === "shop_close") {
            collector.stop("user");
            try { await i.update({ content: '상점이 닫혔습니다.', embeds: [], components: [] }); } catch {}
            return;
          }
          let updated = false;
          if (i.customId === "skill_prev" && page > 0) { page--; updated = true; }
          if (i.customId === "skill_next" && (page + 1) * SKILLS_PER_PAGE < sorted.length) { page++; updated = true; }
          if (i.customId === "skill_refresh") { updated = true; }

          if (updated) {
            const beLive = (await loadJson(bePath))[interaction.user.id]?.amount || 0;
            ({ embed, rows } = getEmbedAndRows(page, beLive));
            await i.update({
              content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
              embeds: [embed],
              components: rows
            });
            return;
          }

          if (i.customId.startsWith("skill_buy_")) {
            if (userBuying[i.user.id]) {
              await i.reply({ content: '이미 구매 처리 중입니다. 잠시만 기다려 주세요!', ephemeral: true });
              return;
            }
            userBuying[i.user.id] = true;
            try {
              const SKILLS = require('../utils/active-skills.js');
              const SKILL_LIST = Object.values(SKILLS);
              const skillName = i.customId.replace("skill_buy_", "");
              const skill = SKILL_LIST.find(x => x.name === skillName);
              if (!skill) {
                await i.reply({ content: "해당 스킬을 찾을 수 없습니다.", ephemeral: true });
                return;
              }
              const skills = await loadJson(skillsPath);
              const mySkills = skills[i.user.id] || {};
              if (mySkills[skill.name]) {
                await i.reply({ content: `이미 [${skill.name}] 스킬을 소유하고 있습니다! (스킬은 1개만 소유 가능)`, ephemeral: true });
                return;
              }
              const be = await loadJson(bePath);
              const userBe = be[i.user.id]?.amount || 0;
              if (userBe < skill.price) {
                await i.reply({ content: `파랑 정수 부족! (보유: ${userBe} BE)`, ephemeral: true });
                return;
              }
              be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
              be[i.user.id].amount -= skill.price;
              be[i.user.id].history.push({ type: "spend", amount: skill.price, reason: `${skill.name} 스킬 구매`, timestamp: Date.now() });
              await saveJson(bePath, be);

              skills[i.user.id] = skills[i.user.id] || {};
              skills[i.user.id][skill.name] = { desc: skill.desc };
              await saveJson(skillsPath, skills);

              await i.reply({ content: `✅ [${skill.name}] 스킬을 ${skill.price} BE에 구매 완료! (동일 스킬 중복 보유 불가)`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류 발생: ${e.message}`, ephemeral: true });
            } finally {
              userBuying[i.user.id] = false;
            }
            return;
          }
        });

        collector.on('end', async () => {
          clearInterval(interval);
          try {
            await interaction.deleteReply();
          } catch (e) {}
          userBuying[interaction.user.id] = false;
          userShopOpen[interaction.user.id] = false;
        });
        return;
      }

      // ---- 강화 아이템 상점(역할, json 기반 재고 관리) ----
      if (kind === 'upgrade') {
        const getEmbedAndRows = async (curBe) => {
          // 각각의 현재 재고 동적으로 불러옴
          const stocks = {};
          for (const item of 강화ITEMS) {
            stocks[item.key] = await checkAndRestock(item);
          }
          const embed = new EmbedBuilder()
            .setTitle("🪄 강화 아이템 상점 (역할 상품)")
            .setDescription(
              `🔷 내 파랑 정수: ${curBe} BE\n` +
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
                return `#${i + 1} | ${item.emoji} **${item.name}** (${item.price} BE)\n${item.desc}${msg}\n`
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
          rowBuy.addComponents(
            new ButtonBuilder()
              .setCustomId("shop_close")
              .setLabel("상점 닫기")
              .setStyle(ButtonStyle.Danger)
          );
          return { embed, rows: [rowBuy] };
        };

        let { embed, rows } = await getEmbedAndRows(userBe);

        const shopMsg = await interaction.editReply({
          content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
          embeds: [embed],
          components: rows
        });

        interval = setInterval(async () => {
          try {
            const { embed: newEmbed, rows: newRows } = await getEmbedAndRows(userBe);
            await interaction.editReply({
              content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
              embeds: [newEmbed],
              components: newRows
            });
          } catch (e) {}
        }, 1000);

        const filter = i => i.user.id === interaction.user.id;
        const collector = shopMsg.createMessageComponentCollector({ filter, time: expireSec * 1000 });

        collector.on('collect', async i => {
          if (i.customId === "shop_close") {
            collector.stop("user");
            try { await i.update({ content: '상점이 닫혔습니다.', embeds: [], components: [] }); } catch {}
            return;
          }
          const btnItem = 강화ITEMS.find(x => i.customId === `upgrade_buy_${x.roleId}`);
          if (btnItem) {
            if (!(await checkStock(btnItem))) {
              await i.reply({ content: `❌ [${btnItem.name}] 품절입니다.`, ephemeral: true });
              return;
            }
            if (userBuying[i.user.id]) {
              await i.reply({ content: '이미 구매 처리 중입니다. 잠시만 기다려 주세요!', ephemeral: true });
              return;
            }
            userBuying[i.user.id] = true;
            try {
              const member = await i.guild.members.fetch(i.user.id);
              if (member.roles.cache.has(btnItem.roleId)) {
                await i.reply({ content: `이미 [${btnItem.name}] 역할을 소유하고 있어요!`, ephemeral: true });
                return;
              }
              const be = await loadJson(bePath);
              const userBe = be[i.user.id]?.amount || 0;
              if (userBe < btnItem.price) {
                await i.reply({ content: `파랑 정수 부족! (보유: ${userBe} BE)`, ephemeral: true });
                return;
              }
              await decreaseStock(btnItem); // ★구매 성공 시 재고 차감

              const beBackup = JSON.stringify(be);
              be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
              be[i.user.id].amount -= btnItem.price;
              be[i.user.id].history.push({ type: "spend", amount: btnItem.price, reason: `${btnItem.name} 역할 구매`, timestamp: Date.now() });
              await saveJson(bePath, be);

              try {
                await member.roles.add(btnItem.roleId, "강화 아이템 구매");
              } catch (err) {
                await saveJson(bePath, JSON.parse(beBackup));
                await i.reply({ content: `❌ 역할 지급 실패! (권한 부족 또는 설정 오류 / BE 차감 취소됨)`, ephemeral: true });
                return;
              }
              await i.reply({ content: `✅ [${btnItem.name}] 역할을 ${btnItem.price} BE에 구매 완료! (서버 내 역할로 즉시 지급)`, ephemeral: true });
            } catch (e) {
              await i.reply({ content: `❌ 오류 발생: ${e.message}`, ephemeral: true });
            } finally {
              userBuying[i.user.id] = false;
            }
          }
        });

        collector.on('end', async () => {
          clearInterval(interval);
          try {
            await interaction.deleteReply();
          } catch (e) {}
          userBuying[interaction.user.id] = false;
          userShopOpen[interaction.user.id] = false;
        });
        return;
      }

      
    } catch (err) {
      try {
        await interaction.editReply({ content: `❌ 오류 발생: ${err.message}` });
      } catch {}
      userShopOpen[interaction.user.id] = false;
      userBuying[interaction.user.id] = false;
    }
  }
};
