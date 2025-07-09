const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

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

const userBuying = {};
const userShopOpen = {};

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
    try {
      if (userShopOpen[interaction.user.id]) {
        await interaction.reply({ content: '이미 상점 창이 열려있습니다. 먼저 기존 상점을 종료해주세요!', ephemeral: true });
        return;
      }
      userShopOpen[interaction.user.id] = true;

      // 유효 시간 세팅
      const expireSec = 180;
      const sessionExpireAt = Date.now() + expireSec * 1000;
      let interval;

      // 모두 공개
      await interaction.deferReply({ ephemeral: false });

      const kind = interaction.options.getString('종류');
      const be = await loadJson(bePath);
      const userBe = be[interaction.user.id]?.amount || 0;

      // ======= 임베드 생성 함수들 =======
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

        // 최초 메시지
        const shopMsg = await interaction.editReply({
          content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
          embeds: [embed],
          components: rows
        });

        // 실시간 남은 시간 갱신
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

        collector.on('end', async (collected, reason) => {
          clearInterval(interval);
          if (reason !== "user") {
            try {
              await interaction.editReply({
                content: '⏳ 상점 세션이 만료되었습니다. 명령어로 다시 열어주세요!',
                embeds: [], components: []
              });
            } catch (e) {}
          }
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

        // 최초 메시지
        const shopMsg = await interaction.editReply({
          content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
          embeds: [embed],
          components: rows
        });

        // 실시간 남은 시간 갱신
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

        collector.on('end', async (collected, reason) => {
          clearInterval(interval);
          if (reason !== "user") {
            try {
              await interaction.editReply({
                content: '⏳ 상점 세션이 만료되었습니다. 명령어로 다시 열어주세요!',
                embeds: [], components: []
              });
            } catch (e) {}
          }
          userBuying[interaction.user.id] = false;
          userShopOpen[interaction.user.id] = false;
        });
        return;
      }

      // ---- 강화 아이템 상점(역할) ----
      if (kind === 'upgrade') {
        const beLive = (await loadJson(bePath))[interaction.user.id]?.amount || 0;
        const getEmbedAndRows = (curBe) => {
          const embed = new EmbedBuilder()
            .setTitle("🪄 강화 아이템 상점 (역할 상품)")
            .setDescription(
              `🔷 내 파랑 정수: ${curBe} BE\n` +
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
          rowBuy.addComponents(
            new ButtonBuilder()
              .setCustomId("shop_close")
              .setLabel("상점 닫기")
              .setStyle(ButtonStyle.Danger)
          );
          return { embed, rows: [rowBuy] };
        };

        let { embed, rows } = getEmbedAndRows(beLive);

        // 최초 메시지
        const shopMsg = await interaction.editReply({
          content: `⏳ 상점 유효 시간: 3분 (남은 시간: ${getRemainSec()}초)`,
          embeds: [embed],
          components: rows
        });

        // 실시간 남은 시간 갱신
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
          if (userBuying[i.user.id]) {
            await i.reply({ content: '이미 구매 처리 중입니다. 잠시만 기다려 주세요!', ephemeral: true });
            return;
          }
          userBuying[i.user.id] = true;
          try {
            const btnItem = 강화ITEMS.find(x => i.customId === `upgrade_buy_${x.roleId}`);
            if (!btnItem) return;

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
        });

        collector.on('end', async (collected, reason) => {
          clearInterval(interval);
          if (reason !== "user") {
            try {
              await interaction.editReply({
                content: '⏳ 상점 세션이 만료되었습니다. 명령어로 다시 열어주세요!',
                embeds: [], components: []
              });
            } catch (e) {}
          }
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
