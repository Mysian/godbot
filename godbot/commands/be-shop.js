const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const ITEMS = require('../utils/items.js');
const SKILLS = require('../utils/active-skills.js');

const bePath = path.join(__dirname, '../data/BE.json');
const itemsPath = path.join(__dirname, '../data/items.json');
const skillsPath = path.join(__dirname, '../data/skills.json');

const 강화ITEMS = [
  {
    name: '불굴의 영혼',
    roleId: '1382169247538745404',
    price: 10000,
    desc: '챔피언 단일 강화 진행시 보유하고 있는 경우 100% 확률로 소멸을 방지한다. [1회성/고유상품]',
    emoji: '🧿'
  },
  {
    name: '불굴의 영혼 (전설)',
    roleId: '1382665471605870592',
    price: 50000,
    desc: '챔피언 한방 강화 진행시 보유하고 있는 경우 100% 확률로 소멸을 방지한다. [1회성/고유상품]',
    emoji: '🌟'
  }
];

// 파일 읽기/쓰기 proper-lockfile 래핑
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

// 중복 구매 방지용 메모리 플래그
const userBuying = {};

// 통파일 export
module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수상점')
    .setDescription('파랑 정수(BE)로 아이템·스킬·강화아이템을 구매할 수 있는 통합 상점입니다.')
    .addStringOption(option =>
      option
        .setName('종류')
        .setDescription('구매할 상점 종류를 선택하세요.')
        .setRequired(true)
        .addChoices(
          { name: '아이템 상점', value: 'item' },
          { name: '스킬 상점', value: 'skill' },
          { name: '강화 아이템', value: 'upgrade' }
        )
    ),

  async execute(interaction) {
    // 바로 deferReply로 중복 응답 방지
    await interaction.deferReply({ ephemeral: true });

    const kind = interaction.options.getString('종류');

    // ---- 아이템 상점 ----
    if (kind === 'item') {
      const ITEM_LIST = Object.values(ITEMS);
      const sorted = ITEM_LIST.slice().sort((a, b) => b.price - a.price);
      let page = 0;
      const ITEMS_PER_PAGE = 5;
      const maxPage = Math.ceil(ITEM_LIST.length / ITEMS_PER_PAGE);

      const getEmbedAndRows = (_page) => {
        const showItems = sorted.slice(_page * ITEMS_PER_PAGE, (_page + 1) * ITEMS_PER_PAGE);
        const embed = new EmbedBuilder()
          .setTitle("🛒 아이템 상점")
          .setDescription(showItems.map((item, i) =>
            `#${i + 1 + _page * ITEMS_PER_PAGE} | ${item.icon || ""} **${item.name}** (${item.price} BE)\n${item.desc}`
          ).join("\n\n"))
          .setFooter({ text: `총 아이템: ${ITEM_LIST.length} | 페이지 ${_page + 1}/${maxPage}` });

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("item_prev").setLabel("이전 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page === 0),
          new ButtonBuilder().setCustomId("item_refresh").setLabel("새로고침").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("item_next").setLabel("다음 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page + 1 >= maxPage),
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

      const { embed, rows } = getEmbedAndRows(page);
      await interaction.editReply({ embeds: [embed], components: rows });

      const filter = i => i.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

      collector.on('collect', async i => {
        let updated = false;
        if (i.customId === "item_prev" && page > 0) { page--; updated = true; }
        if (i.customId === "item_next" && (page + 1) * ITEMS_PER_PAGE < sorted.length) { page++; updated = true; }
        if (i.customId === "item_refresh") { updated = true; }

        if (updated) {
          const { embed, rows } = getEmbedAndRows(page);
          await i.update({ embeds: [embed], components: rows });
          return;
        }

        if (i.customId.startsWith("item_buy_")) {
          // 중복 방지: 구매 중 플래그
          if (userBuying[i.user.id]) {
            await i.reply({ content: '이미 구매 처리 중입니다. 잠시만 기다려 주세요!', ephemeral: true });
            return;
          }
          userBuying[i.user.id] = true;

          try {
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
          } finally {
            userBuying[i.user.id] = false;
          }
          return;
        }
      });

      collector.on('end', async () => {
        try { await interaction.editReply({ components: [] }); } catch (e) {}
      });
      return;
    }

    // ---- 스킬 상점 ----
    if (kind === 'skill') {
      const SKILL_LIST = Object.values(SKILLS);
      const sorted = SKILL_LIST.slice().sort((a, b) => b.price - a.price);
      let page = 0;
      const SKILLS_PER_PAGE = 5;
      const maxPage = Math.ceil(SKILL_LIST.length / SKILLS_PER_PAGE);

      const getEmbedAndRows = (_page) => {
        const showSkills = sorted.slice(_page * SKILLS_PER_PAGE, (_page + 1) * SKILLS_PER_PAGE);
        const embed = new EmbedBuilder()
          .setTitle("📚 스킬 상점")
          .setDescription(showSkills.map((skill, i) =>
            `#${i + 1 + _page * SKILLS_PER_PAGE} | ${skill.icon || ""} **${skill.name}** (${skill.price} BE)\n${skill.desc}`
          ).join("\n\n"))
          .setFooter({ text: `총 스킬: ${SKILL_LIST.length} | 페이지 ${_page + 1}/${maxPage}` });

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("skill_prev").setLabel("이전 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page === 0),
          new ButtonBuilder().setCustomId("skill_refresh").setLabel("새로고침").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("skill_next").setLabel("다음 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page + 1 >= maxPage),
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

      const { embed, rows } = getEmbedAndRows(page);
      await interaction.editReply({ embeds: [embed], components: rows });

      const filter = i => i.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

      collector.on('collect', async i => {
        let updated = false;
        if (i.customId === "skill_prev" && page > 0) { page--; updated = true; }
        if (i.customId === "skill_next" && (page + 1) * SKILLS_PER_PAGE < sorted.length) { page++; updated = true; }
        if (i.customId === "skill_refresh") { updated = true; }

        if (updated) {
          const { embed, rows } = getEmbedAndRows(page);
          await i.update({ embeds: [embed], components: rows });
          return;
        }

        if (i.customId.startsWith("skill_buy_")) {
          if (userBuying[i.user.id]) {
            await i.reply({ content: '이미 구매 처리 중입니다. 잠시만 기다려 주세요!', ephemeral: true });
            return;
          }
          userBuying[i.user.id] = true;

          try {
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
          } finally {
            userBuying[i.user.id] = false;
          }
          return;
        }
      });

      collector.on('end', async () => {
        try { await interaction.editReply({ components: [] }); } catch (e) {}
      });
      return;
    }

    // ---- 강화 아이템 상점(역할) ----
    if (kind === 'upgrade') {
      const embed = new EmbedBuilder()
        .setTitle("🪄 강화 아이템 상점 (역할 상품)")
        .setDescription(
          강화ITEMS.map((item, i) =>
            `#${i + 1} | ${item.emoji} **${item.name}** (${item.price} BE)\n${item.desc}\n`
          ).join("\n")
        )
        .setFooter({ text: `고유상품: 1회성 역할 아이템 | 구매시 즉시 지급` });

      const rowBuy = new ActionRowBuilder();
      강화ITEMS.forEach(item => {
        rowBuy.addComponents(
          new ButtonBuilder()
            .setCustomId(`upgrade_buy_${item.roleId}`)
            .setLabel(`${item.name} 구매`)
            .setStyle(ButtonStyle.Primary)
        );
      });

      await interaction.editReply({ embeds: [embed], components: [rowBuy] });

      const filter = i => i.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

      collector.on('collect', async i => {
        // 중복 방지: 구매 중 플래그
        if (userBuying[i.user.id]) {
          await i.reply({ content: '이미 구매 처리 중입니다. 잠시만 기다려 주세요!', ephemeral: true });
          return;
        }
        userBuying[i.user.id] = true;

        try {
          // 구매 버튼 클릭시
          const btnItem = 강화ITEMS.find(x => i.customId === `upgrade_buy_${x.roleId}`);
          if (!btnItem) return;

          // 서버에서 역할 보유 확인
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

          // 결제 내역
          be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
          be[i.user.id].amount -= btnItem.price;
          be[i.user.id].history.push({ type: "spend", amount: btnItem.price, reason: `${btnItem.name} 역할 구매`, timestamp: Date.now() });
          await saveJson(bePath, be);

          // 역할 지급(권한 체크)
          try {
            await member.roles.add(btnItem.roleId, "강화 아이템 구매");
          } catch (err) {
            await i.reply({ content: `❌ 역할 지급 실패! (권한 부족 또는 설정 오류)`, ephemeral: true });
            return;
          }

          await i.reply({ content: `✅ [${btnItem.name}] 역할을 ${btnItem.price} BE에 구매 완료! (서버 내 역할로 즉시 지급)`, ephemeral: true });
        } finally {
          userBuying[i.user.id] = false;
        }
      });

      collector.on('end', async () => {
        try { await interaction.editReply({ components: [] }); } catch (e) {}
      });
      return;
    }
  }
};
