const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

// ======================[ PATHS & CONFIGURATION ]======================

// --- File Paths ---
const bePath = path.join(__dirname, '../data/BE.json');
const itemsPath = path.join(__dirname, '../data/items.json');
const skillsPath = path.join(__dirname, '../data/skills.json');
const stockPath = path.join(__dirname, '../data/upgrade-stock.json');
const nicknameRolesPath = path.join(__dirname, '../data/nickname-roles.json');
const titlesPath = path.join(__dirname, '../data/limited-titles.json');

// --- Shop Configuration ---
const NICKNAME_ROLE_PER_USER = 1; // Max ownable nickname roles. Set to 0 for unlimited.
const CHANNEL_ROLE_ID = '1352582997400092755';
const CHANNEL_ROLE_PRICE = 3000000;
const SHOP_SESSION_TIMEOUT_SEC = 180; // Shop window validity duration

// --- Upgradeable Item Settings ---
const 강화ITEMS = [
  {
    name: '불굴의 영혼',
    roleId: '1382169247538745404',
    price: 10000,
    desc: '챔피언 단일 강화 진행시 보유하고 있는 경우 100% 확률로 소멸을 방지한다. [1회성/고유상품]\n※ 1시간마다 재고 1개 충전 [최대 10개]',
    emoji: '🧿',
    key: 'soul',
    period: 1 // Restock period in hours
  },
  {
    name: '불굴의 영혼 (전설)',
    roleId: '1382665471605870592',
    price: 50000,
    desc: '챔피언 한방 강화 진행시 보유하고 있는 경우 100% 확률로 소멸을 방지한다. [1회성/고유상품]\n※ 3시간마다 재고 1개 충전 [최대 5개]',
    emoji: '🌟',
    key: 'legendary',
    period: 3 // Restock period in hours
  }
];
const MAX_STOCK = { soul: 10, legendary: 5 };

// ======================[ UTILITY & FILE I/O ]======================

/** Formats a number with commas. */
function numFmt(num) { return num.toLocaleString(); }

/**
 * Asynchronously loads and parses a JSON file with file locking.
 * @param {string} p - The file path.
 * @param {boolean} [isArray=false] - Whether to initialize with an empty array if the file doesn't exist.
 * @returns {Promise<Object|Array>} The parsed JSON data.
 */
async function loadJson(p, isArray = false) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, isArray ? "[]" : "{}");
  const release = await lockfile.lock(p, { retries: 3 });
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data;
  } finally {
    await release();
  }
}

/**
 * Asynchronously saves data to a JSON file with file locking.
 * @param {string} p - The file path.
 * @param {Object|Array} data - The data to save.
 */
async function saveJson(p, data) {
  const release = await lockfile.lock(p, { retries: 3 });
  try {
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  } finally {
    await release();
  }
}

// ======================[ STOCK MANAGEMENT ]======================

/** Loads the stock data. */
async function loadStock() { return loadJson(stockPath); }
/** Saves the stock data. */
async function saveStock(data) { return saveJson(stockPath, data); }

/**
 * Checks and restocks an item based on its restock period.
 * @param {Object} item - The item configuration object from `강화ITEMS`.
 * @returns {Promise<number>} The current stock count.
 */
async function checkAndRestock(item) {
  const stock = await loadStock();
  const now = Date.now();
  if (!stock[item.key]) stock[item.key] = { stock: 0, last: 0 };

  let changed = false;
  const periodMs = item.period * 60 * 60 * 1000;
  let { last = 0, stock: currentStock = 0 } = stock[item.key];

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

/**
 * Checks if an item is in stock.
 * @param {Object} item - The item configuration object.
 * @returns {Promise<boolean>} True if stock > 0.
 */
async function checkStock(item) {
  const stockCount = await checkAndRestock(item);
  return stockCount > 0;
}

/**
 * Decreases the stock of a given item by one.
 * @param {Object} item - The item configuration object.
 */
async function decreaseStock(item) {
  const stock = await loadStock();
  if (!stock[item.key]) stock[item.key] = { stock: 0, last: 0 };
  stock[item.key].stock = Math.max(0, (stock[item.key].stock || 0) - 1);
  await saveStock(stock);
}

/**
 * Calculates the time in seconds until the next restock.
 * @param {Object} item - The item configuration object.
 * @returns {Promise<number>} Seconds until next restock, or 0 if fully stocked.
 */
async function nextRestock(item) {
  const stock = await loadStock();
  const now = Date.now();
  if (!stock[item.key]) stock[item.key] = { stock: 0, last: 0 };

  if (stock[item.key].stock >= MAX_STOCK[item.key]) return 0;

  const periodMs = item.period * 60 * 60 * 1000;
  const lastRestock = stock[item.key].last || 0;
  const nextTime = lastRestock + periodMs;

  return Math.max(0, Math.floor((nextTime - now) / 1000));
}

// ======================[ MEMORY FLAGS ]======================
// Prevents race conditions and multiple open windows per user.
const userBuying = new Set();
const userShopOpen = new Set();

// ======================[ SHOP HANDLERS ]======================

/**
 * Handles the "Battle Item" shop.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {number} initialBe - The user's initial BE balance.
 */
async function handleItemShop(interaction, initialBe) {
    const ITEMS = require('../utils/items.js');
    const ITEM_LIST = Object.values(ITEMS);
    const sorted = ITEM_LIST.slice().sort((a, b) => b.price - a.price);
    let page = 0;
    const ITEMS_PER_PAGE = 5;
    const maxPage = Math.ceil(ITEM_LIST.length / ITEMS_PER_PAGE);

    const getEmbedAndRows = (currentPage, currentBe) => {
        const showItems = sorted.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
        const embed = new EmbedBuilder()
            .setTitle("🛒 아이템 상점")
            .setColor("#3498db")
            .setDescription(`🔷 내 파랑 정수: ${numFmt(currentBe)} BE\n\n` +
                showItems.map((item, i) =>
                    `**${item.icon || "▫️"} ${item.name}** (${numFmt(item.price)} BE)\n*${item.desc}*`
                ).join("\n\n"))
            .setFooter({ text: `총 아이템: ${ITEM_LIST.length} | 페이지 ${currentPage + 1}/${maxPage}` });

        const navigationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("prev_page").setLabel("이전").setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
            new ButtonBuilder().setCustomId("refresh").setLabel("새로고침").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("next_page").setLabel("다음").setStyle(ButtonStyle.Secondary).setDisabled(currentPage + 1 >= maxPage),
            new ButtonBuilder().setCustomId("close_shop").setLabel("닫기").setStyle(ButtonStyle.Danger)
        );
        const purchaseRow = new ActionRowBuilder();
        showItems.forEach(item => {
            purchaseRow.addComponents(
                new ButtonBuilder()
                .setCustomId(`buy_${item.name}`)
                .setLabel(`${item.name} 구매`)
                .setStyle(ButtonStyle.Primary)
            );
        });
        return { embed, rows: [purchaseRow, navigationRow] };
    };
    
    await generalShopHandler(interaction, initialBe, page, maxPage, getEmbedAndRows, async (i, itemIdentifier) => {
        const itemName = itemIdentifier;
        const item = ITEM_LIST.find(x => x.name === itemName);
        if (!item) {
            await i.reply({ content: "❌ 해당 아이템을 찾을 수 없습니다.", ephemeral: true });
            return;
        }

        const items = await loadJson(itemsPath);
        items[i.user.id] = items[i.user.id] || {};
        const myItem = items[i.user.id][item.name] || { count: 0, desc: item.desc };
        if (myItem.count >= 99) {
            await i.reply({ content: `⚠️ 최대 99개까지만 소지할 수 있습니다. (현재: ${myItem.count}개)`, ephemeral: true });
            return;
        }

        const be = await loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < item.price) {
            await i.reply({ content: `❌ 파랑 정수가 부족합니다! (보유: ${numFmt(userBe)} BE)`, ephemeral: true });
            return;
        }

        be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
        be[i.user.id].amount -= item.price;
        be[i.user.id].history.push({ type: "spend", amount: item.price, reason: `${item.name} 구매`, timestamp: Date.now() });
        await saveJson(bePath, be);

        myItem.count += 1;
        items[i.user.id][item.name] = myItem;
        await saveJson(itemsPath, items);

        await i.reply({ content: `✅ **${item.name}** 1개를 ${numFmt(item.price)} BE에 구매했습니다! (현재 보유: ${myItem.count}개)`, ephemeral: true });
    });
}


/**
 * Handles the "Nickname Color" shop.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {number} initialBe - The user's initial BE balance.
 */
async function handleNicknameShop(interaction, initialBe) {
    const ROLES = await loadJson(nicknameRolesPath);
    const roleList = Object.values(ROLES);
    if (roleList.length === 0) {
        await interaction.editReply('현재 구매 가능한 닉네임 색상이 없습니다.');
        return;
    }
    let page = 0;
    const ROLES_PER_PAGE = 5; // Display more items per page
    const maxPage = Math.ceil(roleList.length / ROLES_PER_PAGE);
    
    const hexToImgUrl = (hex) => `https://singlecolorimage.com/get/${hex.replace('#', '')}/40x40`;

    const getEmbedAndRows = async (currentPage, currentBe) => {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const showRoles = roleList.slice(currentPage * ROLES_PER_PAGE, (currentPage + 1) * ROLES_PER_PAGE);

        const embed = new EmbedBuilder()
            .setTitle('🎨 닉네임 색상 상점')
            .setColor("#f1c40f")
            .setDescription(`마음에 드는 색상을 구매하여 닉네임을 꾸며보세요!\n🔷 내 파랑 정수: **${numFmt(currentBe)} BE**`)
            .setFooter({ text: `총 ${roleList.length}개의 색상 | 페이지 ${currentPage + 1}/${maxPage}` });

        showRoles.forEach(role => {
            const hasRole = member.roles.cache.has(role.roleId);
            embed.addFields({
                name: `${role.emoji || ''} ${role.name} (${numFmt(role.price)} BE)`,
                value: `[색상 미리보기](${hexToImgUrl(role.color)}) \`(${role.color})\`\n${role.desc}${hasRole ? '\n**✅ 보유중**' : ''}`,
                inline: true,
            });
        });

        const purchaseRow = new ActionRowBuilder();
        showRoles.forEach(role => {
            const hasRole = member.roles.cache.has(role.roleId);
            purchaseRow.addComponents(
                new ButtonBuilder()
                .setCustomId(`buy_${role.roleId}`)
                .setLabel(hasRole ? `${role.name}` : `${role.name} 구매`)
                .setStyle(hasRole ? ButtonStyle.Success : ButtonStyle.Primary)
                .setDisabled(hasRole)
            );
        });

        const navigationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev_page').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
            new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('next_page').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(currentPage + 1 >= maxPage),
            new ButtonBuilder().setCustomId('close_shop').setLabel('닫기').setStyle(ButtonStyle.Danger)
        );

        return { embed, rows: [purchaseRow, navigationRow] };
    };

    await generalShopHandler(interaction, initialBe, page, maxPage, getEmbedAndRows, async (i, itemIdentifier) => {
        const roleId = itemIdentifier;
        const roleData = roleList.find(x => x.roleId === roleId);
        if (!roleData) {
            await i.reply({ content: "❌ 해당 역할을 찾을 수 없습니다.", ephemeral: true });
            return;
        }
        
        const member = await i.guild.members.fetch(i.user.id);
        if (member.roles.cache.has(roleId)) {
            await i.reply({ content: `⚠️ 이미 **[${roleData.name}]** 색상을 보유하고 있습니다!`, ephemeral: true });
            return;
        }

        const be = await loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < roleData.price) {
            await i.reply({ content: `❌ 파랑 정수가 부족합니다! (보유: ${numFmt(userBe)} BE)`, ephemeral: true });
            return;
        }

        // Remove other color roles if user can only own one
        if (NICKNAME_ROLE_PER_USER > 0) {
            const allColorRoleIds = roleList.map(x => x.roleId);
            for (const rId of allColorRoleIds) {
                if (member.roles.cache.has(rId)) {
                    await member.roles.remove(rId, '신규 색상 구매로 인한 기존 색상 제거');
                }
            }
        }
        
        await member.roles.add(roleId, '닉네임 색상 구매');
        be[i.user.id].amount -= roleData.price;
        be[i.user.id].history.push({ type: "spend", amount: roleData.price, reason: `${roleData.name} 색상 역할 구매`, timestamp: Date.now() });
        await saveJson(bePath, be);
        
        await i.reply({ content: `✅ **[${roleData.name}]** 색상을 ${numFmt(roleData.price)} BE에 구매했습니다!`, ephemeral: true });
    });
}

/**
 * Handles the "Personal Channel Contract" shop.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {number} initialBe - The user's initial BE balance.
 */
async function handleChannelShop(interaction, initialBe) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasRole = member.roles.cache.has(CHANNEL_ROLE_ID);

    const embed = new EmbedBuilder()
        .setTitle('🛎️ 개인채널 계약금')
        .setColor('#FFD700')
        .setDescription(`**${numFmt(CHANNEL_ROLE_PRICE)} BE**\n\n역할을 구매하면 개인 전용 채널을 신청할 수 있는 자격이 주어집니다. 이 역할은 일회성 구매입니다.\n\n🔷 **내 파랑 정수:** ${numFmt(initialBe)} BE`)
        .addFields({ name: '상태', value: hasRole ? '✅ 이미 계약금 역할을 보유하고 있습니다.' : '🛒 즉시 구매 가능' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('buy_channel_contract')
            .setLabel(hasRole ? '보유중' : '구매하기')
            .setStyle(hasRole ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(hasRole),
        new ButtonBuilder()
            .setCustomId('close_shop')
            .setLabel('닫기')
            .setStyle(ButtonStyle.Danger)
    );

    await generalShopHandler(interaction, initialBe, 0, 1, () => ({ embed, rows: [row] }), async (i) => {
        const be = await loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < CHANNEL_ROLE_PRICE) {
            await i.reply({ content: `❌ 파랑 정수가 부족합니다! (보유: ${numFmt(userBe)} BE)`, ephemeral: true });
            return;
        }

        const currentMember = await i.guild.members.fetch(i.user.id);
        if (currentMember.roles.cache.has(CHANNEL_ROLE_ID)) {
             await i.reply({ content: `⚠️ 이미 개인채널 계약금 역할을 보유하고 있습니다.`, ephemeral: true });
             return;
        }

        await currentMember.roles.add(CHANNEL_ROLE_ID, '개인채널 계약금 구매');
        be[i.user.id].amount -= CHANNEL_ROLE_PRICE;
        be[i.user.id].history.push({ type: "spend", amount: CHANNEL_ROLE_PRICE, reason: "개인채널 계약금 구매", timestamp: Date.now() });
        await saveJson(bePath, be);
        
        await i.reply({ content: `✅ 개인채널 계약금 역할을 성공적으로 구매했습니다!`, ephemeral: true });
        
        // Disable the button after purchase
        row.components[0].setDisabled(true).setLabel('구매 완료').setStyle(ButtonStyle.Success);
        await i.message.edit({ components: [row] });
    });
}

/**
 * Handles the "Limited Edition Title" shop.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {number} initialBe - The user's initial BE balance.
 */
async function handleTitleShop(interaction, initialBe) {
    const TITLES = await loadJson(titlesPath);
    const titleList = Object.values(TITLES);
    if (titleList.length === 0) {
        await interaction.editReply('현재 판매중인 한정판 칭호가 없습니다.');
        return;
    }
    let page = 0;
    const TITLE_PER_PAGE = 5; // Increased for better UX
    const maxPage = Math.ceil(titleList.length / TITLE_PER_PAGE);
    
    const getEmbedAndRows = async (currentPage, currentBe) => {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const showTitles = titleList.slice(currentPage * TITLE_PER_PAGE, (currentPage + 1) * TITLE_PER_PAGE);

        const embed = new EmbedBuilder()
            .setTitle('🏅 한정판 칭호 상점')
            .setColor("#e74c3c")
            .setDescription(`희귀한 한정판 칭호를 획득하세요! 수량이 정해져있을 수 있습니다.\n🔷 내 파랑 정수: **${numFmt(currentBe)} BE**\n${'─'.repeat(30)}`)
            .setFooter({ text: `총 ${titleList.length}개의 칭호 | 페이지 ${currentPage + 1}/${maxPage}` });

        showTitles.forEach(title => {
            const hasRole = member.roles.cache.has(title.roleId);
            const isSoldOut = title.stock !== undefined && title.stock !== null && title.stock <= 0;
            let stockInfo = '';
            if (isSoldOut) stockInfo = `\n**[품절]**`;
            else if (title.stock) stockInfo = `\n**[재고: ${title.stock}개]**`;

            embed.addFields({
                name: `${title.emoji || ''} ${title.name} (${numFmt(title.price)} BE)`,
                value: `${title.desc}${hasRole ? '\n**✅ 보유중**' : stockInfo}`,
                inline: false
            });
        });

        const purchaseRow = new ActionRowBuilder();
        showTitles.forEach(title => {
            const hasRole = member.roles.cache.has(title.roleId);
            const isSoldOut = title.stock !== undefined && title.stock !== null && title.stock <= 0;
            purchaseRow.addComponents(
                new ButtonBuilder()
                .setCustomId(`buy_${title.roleId}`)
                .setLabel(hasRole ? `${title.name}` : `${title.name} 구매`)
                .setStyle(hasRole ? ButtonStyle.Success : (isSoldOut ? ButtonStyle.Secondary : ButtonStyle.Primary))
                .setDisabled(hasRole || isSoldOut)
            );
        });
        
        const navigationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev_page').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
            new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('next_page').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(currentPage + 1 >= maxPage),
            new ButtonBuilder().setCustomId('close_shop').setLabel('닫기').setStyle(ButtonStyle.Danger)
        );

        return { embed, rows: [purchaseRow, navigationRow] };
    };
    
    await generalShopHandler(interaction, initialBe, page, maxPage, getEmbedAndRows, async (i, itemIdentifier) => {
        const roleId = itemIdentifier;
        const ALL_TITLES = await loadJson(titlesPath); // Re-fetch for live stock check
        const titleData = Object.values(ALL_TITLES).find(x => x.roleId === roleId);

        if (!titleData) {
            await i.reply({ content: "❌ 해당 칭호를 찾을 수 없습니다.", ephemeral: true });
            return;
        }

        const member = await i.guild.members.fetch(i.user.id);
        if (member.roles.cache.has(roleId)) {
            await i.reply({ content: `⚠️ 이미 **[${titleData.name}]** 칭호를 보유하고 있습니다!`, ephemeral: true });
            return;
        }
        
        if (titleData.stock !== undefined && titleData.stock !== null && titleData.stock <= 0) {
            await i.reply({ content: "❌ 죄송합니다. 해당 칭호는 품절되었습니다.", ephemeral: true });
            return;
        }

        const be = await loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < titleData.price) {
            await i.reply({ content: `❌ 파랑 정수가 부족합니다! (보유: ${numFmt(userBe)} BE)`, ephemeral: true });
            return;
        }
        
        await member.roles.add(roleId, '한정판 칭호 구매');
        be[i.user.id].amount -= titleData.price;
        be[i.user.id].history.push({ type: "spend", amount: titleData.price, reason: `${titleData.name} 칭호 구매`, timestamp: Date.now() });
        await saveJson(bePath, be);
        
        // Decrease stock
        if (titleData.stock !== undefined && titleData.stock !== null) {
            if (ALL_TITLES[roleId]) {
                ALL_TITLES[roleId].stock--;
                await saveJson(titlesPath, ALL_TITLES);
            }
        }
        
        await i.reply({ content: `✅ **[${titleData.name}]** 칭호를 ${numFmt(titleData.price)} BE에 구매했습니다!`, ephemeral: true });
    });
}

/**
 * Handles the "Battle Skill" shop.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {number} initialBe - The user's initial BE balance.
 */
async function handleSkillShop(interaction, initialBe) {
    const SKILLS = require('../utils/active-skills.js');
    const SKILL_LIST = Object.values(SKILLS);
    const sorted = SKILL_LIST.slice().sort((a, b) => b.price - a.price);
    let page = 0;
    const SKILLS_PER_PAGE = 5;
    const maxPage = Math.ceil(SKILL_LIST.length / SKILLS_PER_PAGE);

    const getEmbedAndRows = async (currentPage, currentBe) => {
        const ownedSkills = (await loadJson(skillsPath))[interaction.user.id] || {};
        const showSkills = sorted.slice(currentPage * SKILLS_PER_PAGE, (currentPage + 1) * SKILLS_PER_PAGE);
        const embed = new EmbedBuilder()
            .setTitle("📚 배틀 스킬 상점")
            .setColor("#9b59b6")
            .setDescription(`전투에 도움이 되는 액티브 스킬을 구매하세요. 스킬은 중복 구매할 수 없습니다.\n🔷 내 파랑 정수: **${numFmt(currentBe)} BE**\n${'─'.repeat(30)}`)
            .setFooter({ text: `총 스킬: ${SKILL_LIST.length} | 페이지 ${currentPage + 1}/${maxPage}` });
        
        showSkills.forEach(skill => {
            const hasSkill = !!ownedSkills[skill.name];
            embed.addFields({
                name: `${skill.icon || ''} ${skill.name} (${numFmt(skill.price)} BE)`,
                value: `${skill.desc}${hasSkill ? '\n**✅ 보유중**' : ''}`,
                inline: false
            });
        });

        const navigationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("prev_page").setLabel("이전").setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
            new ButtonBuilder().setCustomId("refresh").setLabel("새로고침").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("next_page").setLabel("다음").setStyle(ButtonStyle.Secondary).setDisabled(currentPage + 1 >= maxPage),
            new ButtonBuilder().setCustomId("close_shop").setLabel("닫기").setStyle(ButtonStyle.Danger)
        );
        const purchaseRow = new ActionRowBuilder();
        showSkills.forEach(skill => {
            const hasSkill = !!ownedSkills[skill.name];
            purchaseRow.addComponents(
                new ButtonBuilder()
                .setCustomId(`buy_${skill.name}`)
                .setLabel(hasSkill ? `${skill.name}` : `${skill.name} 구매`)
                .setStyle(hasSkill ? ButtonStyle.Success : ButtonStyle.Primary)
                .setDisabled(hasSkill)
            );
        });
        return { embed, rows: [purchaseRow, navigationRow] };
    };
    
    await generalShopHandler(interaction, initialBe, page, maxPage, getEmbedAndRows, async (i, itemIdentifier) => {
        const skillName = itemIdentifier;
        const skill = SKILL_LIST.find(x => x.name === skillName);
        if (!skill) {
            await i.reply({ content: "❌ 해당 스킬을 찾을 수 없습니다.", ephemeral: true });
            return;
        }

        const skills = await loadJson(skillsPath);
        const mySkills = skills[i.user.id] || {};
        if (mySkills[skill.name]) {
            await i.reply({ content: `⚠️ 이미 **[${skill.name}]** 스킬을 보유하고 있습니다!`, ephemeral: true });
            return;
        }

        const be = await loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < skill.price) {
            await i.reply({ content: `❌ 파랑 정수가 부족합니다! (보유: ${numFmt(userBe)} BE)`, ephemeral: true });
            return;
        }

        be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
        be[i.user.id].amount -= skill.price;
        be[i.user.id].history.push({ type: "spend", amount: skill.price, reason: `${skill.name} 스킬 구매`, timestamp: Date.now() });
        await saveJson(bePath, be);

        skills[i.user.id] = skills[i.user.id] || {};
        skills[i.user.id][skill.name] = { desc: skill.desc };
        await saveJson(skillsPath, skills);

        await i.reply({ content: `✅ **[${skill.name}]** 스킬을 ${numFmt(skill.price)} BE에 구매했습니다!`, ephemeral: true });
    });
}

/**
 * Handles the "Upgrade Item" shop.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {number} initialBe - The user's initial BE balance.
 */
async function handleUpgradeShop(interaction, initialBe) {
    const getEmbedAndRows = async (currentPage, currentBe) => {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const stocks = {};
        for (const item of 강화ITEMS) {
            stocks[item.key] = await checkAndRestock(item);
        }
        
        const embed = new EmbedBuilder()
            .setTitle("🪄 강화 아이템 상점")
            .setColor("#e67e22")
            .setDescription(`강화 실패로부터 챔피언을 보호하는 1회성 아이템입니다.\n🔷 내 파랑 정수: **${numFmt(currentBe)} BE**\n${'─'.repeat(30)}`);
        
        for (const item of 강화ITEMS) {
            const stock = stocks[item.key];
            let stockMsg = '';
            if (stock <= 0) {
                const timeLeft = await nextRestock(item);
                if (timeLeft > 0) {
                    const h = Math.floor(timeLeft / 3600);
                    const m = Math.floor((timeLeft % 3600) / 60);
                    const s = timeLeft % 60;
                    stockMsg = `\n**[품절]** 다음 충전까지 약 ${h ? `${h}시간 ` : ''}${m ? `${m}분 ` : ''}${s}초`;
                } else {
                    stockMsg = `\n**[품절]**`;
                }
            } else {
                stockMsg = `\n**[재고: ${stock}개]**`;
            }

            const hasRole = member.roles.cache.has(item.roleId);
            if (hasRole) stockMsg = `\n**✅ 보유중**`;

            embed.addFields({
                name: `${item.emoji} ${item.name} (${numFmt(item.price)} BE)`,
                value: `${item.desc}${stockMsg}`,
                inline: false
            });
        }

        const purchaseRow = new ActionRowBuilder();
        for (const item of 강화ITEMS) {
            const stock = stocks[item.key];
            const hasRole = member.roles.cache.has(item.roleId);
            const isSoldOut = stock <= 0;

            purchaseRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`buy_${item.roleId}`)
                    .setLabel(hasRole ? `${item.name}` : isSoldOut ? `${item.name} (품절)` : `${item.name} 구매`)
                    .setStyle(hasRole ? ButtonStyle.Success : isSoldOut ? ButtonStyle.Secondary : ButtonStyle.Primary)
                    .setDisabled(hasRole || isSoldOut)
            );
        }
        
        const navigationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("refresh").setLabel("새로고침").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("close_shop").setLabel("닫기").setStyle(ButtonStyle.Danger)
        );

        return { embed, rows: [purchaseRow, navigationRow] };
    };

    await generalShopHandler(interaction, initialBe, 0, 1, getEmbedAndRows, async (i, itemIdentifier) => {
        const roleId = itemIdentifier;
        const item = 강화ITEMS.find(x => x.roleId === roleId);
        
        if (!item) {
             await i.reply({ content: "❌ 해당 아이템을 찾을 수 없습니다.", ephemeral: true });
             return;
        }
        
        if (!(await checkStock(item))) {
            await i.reply({ content: `❌ 죄송합니다. **[${item.name}]** 아이템은 품절되었습니다.`, ephemeral: true });
            return;
        }
        
        const member = await i.guild.members.fetch(i.user.id);
        if (member.roles.cache.has(item.roleId)) {
            await i.reply({ content: `⚠️ 이미 **[${item.name}]** 아이템을 보유하고 있습니다!`, ephemeral: true });
            return;
        }

        const be = await loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < item.price) {
            await i.reply({ content: `❌ 파랑 정수가 부족합니다! (보유: ${numFmt(userBe)} BE)`, ephemeral: true });
            return;
        }
        
        // Use a backup in case role assignment fails
        const beBackup = JSON.stringify(be); 
        
        // Deduct BE and stock first
        be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
        be[i.user.id].amount -= item.price;
        be[i.user.id].history.push({ type: "spend", amount: item.price, reason: `${item.name} 역할 구매`, timestamp: Date.now() });
        await saveJson(bePath, be);
        await decreaseStock(item);

        try {
            await member.roles.add(item.roleId, "강화 아이템 구매");
            await i.reply({ content: `✅ **[${item.name}]** 아이템을 ${numFmt(item.price)} BE에 구매했습니다! (역할로 지급됨)`, ephemeral: true });
        } catch (roleError) {
            console.error("Role assignment failed:", roleError);
            // Rollback BE deduction if role assignment fails
            await saveJson(bePath, JSON.parse(beBackup));
            // NOTE: Stock is not rolled back to prevent potential exploits. This should be reviewed based on server policy.
            await i.reply({ content: `❌ 역할 지급에 실패했습니다. BE 차감이 취소되었습니다. (서버 권한 문제일 수 있습니다)`, ephemeral: true });
        }
    });
}

// ======================[ GENERIC SHOP CONTROLLER ]======================

/**
 * A generic function to handle the entire shop lifecycle (display, interaction, timeout).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {number} initialBe The user's initial BE balance.
 * @param {number} initialPage The starting page number.
 * @param {number} maxPage The maximum number of pages.
 * @param {function} getEmbedAndRows A function that returns the embed and action rows for the current state.
 * @param {function} purchaseCallback A function to call when a 'buy' button is pressed.
 */
async function generalShopHandler(interaction, initialBe, initialPage, maxPage, getEmbedAndRows, purchaseCallback) {
    let currentPage = initialPage;
    const sessionExpireAt = Date.now() + SHOP_SESSION_TIMEOUT_SEC * 1000;
    
    const getRemainingTime = () => Math.max(0, Math.floor((sessionExpireAt - Date.now()) / 1000));
    
    const { embed, rows } = await getEmbedAndRows(currentPage, initialBe);
    
    const shopMsg = await interaction.editReply({
        content: `⏳ 상점이 ${getRemainingTime()}초 후에 닫힙니다.`,
        embeds: [embed],
        components: rows
    });

    const timer = setInterval(async () => {
        const remaining = getRemainingTime();
        if (remaining > 0) {
            await shopMsg.edit({ content: `⏳ 상점이 ${remaining}초 후에 닫힙니다.` }).catch(() => {});
        } else {
            clearInterval(timer);
        }
    }, 5000);

    const collector = shopMsg.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: SHOP_SESSION_TIMEOUT_SEC * 1000,
    });

    collector.on('collect', async i => {
        await i.deferUpdate();
        
        let needsUpdate = false;

        if (i.customId === 'close_shop') {
            collector.stop('user_closed');
            return;
        }
        if (i.customId === 'prev_page') {
            if (currentPage > 0) {
                currentPage--;
                needsUpdate = true;
            }
        }
        if (i.customId === 'next_page') {
            if (currentPage + 1 < maxPage) {
                currentPage++;
                needsUpdate = true;
            }
        }
        if (i.customId === 'refresh') {
            needsUpdate = true;
        }

        if (needsUpdate) {
            const beLive = (await loadJson(bePath))[interaction.user.id]?.amount || 0;
            const { embed: newEmbed, rows: newRows } = await getEmbedAndRows(currentPage, beLive);
            await shopMsg.edit({ embeds: [newEmbed], components: newRows });
            return;
        }
        
        if (i.customId.startsWith('buy_')) {
            if (userBuying.has(i.user.id)) {
                await i.followUp({ content: '⏳ 이전 구매를 처리하고 있습니다. 잠시만 기다려주세요.', ephemeral: true });
                return;
            }

            userBuying.add(i.user.id);
            try {
                const itemIdentifier = i.customId.replace('buy_', '');
                await purchaseCallback(i, itemIdentifier);
                
                // After purchase, refresh the shop to show updated state (e.g., stock, owned status)
                const beLive = (await loadJson(bePath))[interaction.user.id]?.amount || 0;
                const { embed: newEmbed, rows: newRows } = await getEmbedAndRows(currentPage, beLive);
                await shopMsg.edit({ embeds: [newEmbed], components: newRows });

            } catch (e) {
                console.error(`[Shop Purchase Error] User: ${i.user.tag}, ItemID: ${i.customId}`, e);
                await i.followUp({ content: '❌ 구매 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', ephemeral: true });
            } finally {
                userBuying.delete(i.user.id);
            }
        }
    });

    collector.on('end', async (collected, reason) => {
        clearInterval(timer);
        if (reason === 'user_closed') {
            await shopMsg.edit({ content: '상점이 사용자에 의해 닫혔습니다.', embeds: [], components: [] }).catch(() => {});
        } else {
            await shopMsg.delete().catch(() => {});
        }
    });
}

// ======================[ SLASH COMMAND DEFINITION ]======================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('상점')
        .setDescription('파랑 정수(BE)로 다양한 아이템, 역할 등을 구매합니다.')
        .addStringOption(option =>
            option
            .setName('종류')
            .setDescription('방문할 상점 종류를 선택하세요.')
            .setRequired(true)
            .addChoices(
                { name: '🛒 배틀 아이템', value: 'item' },
                { name: '📚 배틀 스킬', value: 'skill' },
                { name: '🎨 닉네임 색상', value: 'nickname' },
                { name: '🏅 한정판 칭호', value: 'title' },
                { name: '🪄 강화 아이템', value: 'upgrade' },
                { name: '🛎️ 개인채널 계약금', value: 'channel' }
            )
        ),
    async execute(interaction) {
        if (userShopOpen.has(interaction.user.id)) {
            await interaction.reply({ content: '⚠️ 이미 다른 상점 창이 열려있습니다. 먼저 기존 상점을 닫아주세요!', ephemeral: true });
            return;
        }

        userShopOpen.add(interaction.user.id);
        
        try {
            await interaction.deferReply({ ephemeral: false });

            const kind = interaction.options.getString('종류');
            const beData = await loadJson(bePath);
            const userBe = beData[interaction.user.id]?.amount || 0;
            
            // Route to the correct shop handler
            switch (kind) {
                case 'item':
                    await handleItemShop(interaction, userBe);
                    break;
                case 'nickname':
                    await handleNicknameShop(interaction, userBe);
                    break;
                case 'channel':
                    await handleChannelShop(interaction, userBe);
                    break;
                case 'title':
                    await handleTitleShop(interaction, userBe);
                    break;
                case 'skill':
                    await handleSkillShop(interaction, userBe);
                    break;
                case 'upgrade':
                    await handleUpgradeShop(interaction, userBe);
                    break;
                default:
                    await interaction.editReply('❌ 잘못된 상점 종류입니다.');
            }

        } catch (err) {
            console.error(`[Shop Open Error] User: ${interaction.user.tag}, Kind: ${interaction.options.getString('종류')}`, err);
            try {
                await interaction.editReply({ content: `❌ 상점을 여는 중 오류가 발생했습니다: ${err.message}`, components: [], embeds: [] });
            } catch {}
        } finally {
            // Cleanup flags after the shop is closed by the handler
            userShopOpen.delete(interaction.user.id);
            userBuying.delete(interaction.user.id);
        }
    }
};
