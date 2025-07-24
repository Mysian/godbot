// commands/donate-check.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const donorRolesPath = path.join(__dirname, '../data/donor_roles.json');
const itemDonationsPath = path.join(__dirname, '../data/item_donations.json');
const DONOR_ROLE_ID = '1397076919127900171';

// 파일 입출력
function loadDonorRoles() {
  if (!fs.existsSync(donorRolesPath)) return {};
  return JSON.parse(fs.readFileSync(donorRolesPath, 'utf8'));
}
function saveDonorRoles(data) {
  fs.writeFileSync(donorRolesPath, JSON.stringify(data, null, 2));
}
function loadItemDonations() {
  if (!fs.existsSync(itemDonationsPath)) return [];
  return JSON.parse(fs.readFileSync(itemDonationsPath, 'utf8'));
}
function saveItemDonations(arr) {
  fs.writeFileSync(itemDonationsPath, JSON.stringify(arr, null, 2));
}
function formatDateKST(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}
function getDaysLeft(dateStr) {
  if (!dateStr) return 0;
  const now = new Date();
  const end = new Date(dateStr);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('후원내역')
    .setDescription('후원 내역/후원자 목록을 확인합니다.')
    .addStringOption(opt => 
      opt.setName('종류')
        .setDescription('필터: 전체, 후원금, 상품')
        .addChoices(
          { name: '전체', value: 'all' },
          { name: '후원금', value: 'money' },
          { name: '상품', value: 'item' }
        )
    ),

  async execute(interaction) {
    const filter = interaction.options.getString('종류') || 'all';
    let page = 1;

    // 정책 안내문
    const POLICY_NOTICE =
      '💸 **후원금:** 1,000원당 후원자 역할 3일\n' +
      '🎁 **상품:** 1건 당 후원자 역할 7일 (누적)\n';

    // 리스트+버튼+페이징 구성
    const updateList = async (page, filter, userId = interaction.user.id) => {
      let donorData = loadDonorRoles();
      let itemDonations = loadItemDonations();

      // 후원금/상품 리스트 가공
      let moneyList = Object.entries(donorData).map(([uid, info]) => ({
        userId: uid,
        roleId: info.roleId,
        expiresAt: info.expiresAt
      }));

      let itemList = itemDonations.map((x, idx) => ({
        userId: x.userId,
        name: x.name,
        item: x.item,
        reason: x.reason,
        situation: x.situation,
        anonymous: x.anonymous,
        date: x.date,
        index: idx // 삭제용
      }));

      // 필터
      let showMoney = (filter === 'all' || filter === 'money');
      let showItem = (filter === 'all' || filter === 'item');
      let allList = [];
      if (showMoney) allList.push(...moneyList.map(x => ({ type: 'money', ...x })));
      if (showItem) allList.push(...itemList.map(x => ({ type: 'item', ...x })));
      allList.sort((a, b) => {
        if (a.type === 'money' && b.type === 'money') return new Date(b.expiresAt) - new Date(a.expiresAt);
        if (a.type === 'item' && b.type === 'item') return new Date(b.date) - new Date(a.date);
        return a.type === 'money' ? -1 : 1;
      });

      // 페이징
      const perPage = 10;
      const total = allList.length;
      const maxPage = Math.max(1, Math.ceil(total / perPage));
      page = Math.min(Math.max(page, 1), maxPage);

      const showList = allList.slice((page - 1) * perPage, page * perPage);

      // Embed 생성
      const embed = new EmbedBuilder()
        .setTitle('🎁 후원 내역 조회')
        .setDescription(
          POLICY_NOTICE + '\n' +
          (
            filter === 'money' ? '💸 **후원금 후원자 목록**' :
            filter === 'item' ? '🎁 **상품 후원자 목록**' :
            '💸 **후원금** + 🎁 **상품** 후원자 전체 목록'
          ) +
          `\n\n**페이지**: ${page}/${maxPage}  |  **전체 ${total}건**`
        )
        .setColor(0xf9bb52);

      // 실제 삭제타겟(select용)
      let selectOptions = [];
      let idx = 1;
      showList.forEach(entry => {
        if (entry.type === 'money') {
          let expiresStr = formatDateKST(entry.expiresAt);
          let daysLeft = getDaysLeft(entry.expiresAt);
          let userMention = `<@${entry.userId}>`;
          let isSelf = entry.userId === userId;
          embed.addFields({
            name: `💸 ${userMention} (ID: ${entry.userId})`,
            value: [
              `• 예정 만료: \`${expiresStr}\``,
              `• 남은 기한: **${daysLeft}일**`,
              isSelf ? '🔻 **[내 역할 직접 취소]** 버튼 클릭 시 즉시 만료됨!' : ''
            ].filter(Boolean).join('\n'),
            inline: false
          });
          selectOptions.push({
            label: `[후원금] ${userMention} (ID: ${entry.userId})`,
            value: `money_${entry.userId}`,
            description: `만료: ${expiresStr} / 남은: ${daysLeft}일`
          });
        }
        if (entry.type === 'item') {
          let userMention = `<@${entry.userId}>`;
          embed.addFields({
            name: `🎁 ${userMention} (ID: ${entry.userId})`,
            value: [
              `• 상품: \`${entry.item}\``,
              entry.name && !entry.anonymous ? `• 닉네임: ${entry.name}` : '',
              `• 후원일: ${formatDateKST(entry.date)}`,
              entry.reason ? `• 사유: ${entry.reason}` : '',
              entry.situation ? `• 사용처/희망상황: ${entry.situation}` : '',
              entry.anonymous ? '• **익명 후원**' : ''
            ].filter(Boolean).join('\n'),
            inline: false
          });
          selectOptions.push({
            label: `[상품] ${userMention} (ID: ${entry.userId})`,
            value: `item_${entry.index}`,
            description: entry.item.length > 80 ? entry.item.slice(0,77) + '...' : entry.item
          });
        }
        idx++;
      });

      if (showList.length === 0) {
        embed.addFields({
          name: '내역 없음',
          value: '조회된 후원 내역이 없습니다.',
          inline: false
        });
      }

      // 1줄: 페이지/필터만
      let row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId('prev').setLabel('⬅️ 이전').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
          new ButtonBuilder().setCustomId('next').setLabel('다음 ➡️').setStyle(ButtonStyle.Secondary).setDisabled(page === maxPage),
          new ButtonBuilder().setCustomId('filter_all').setLabel('전체').setStyle(filter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('filter_money').setLabel('후원금').setStyle(filter === 'money' ? ButtonStyle.Primary : ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('filter_item').setLabel('상품').setStyle(filter === 'item' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );

      // 2줄: SelectMenu(삭제), 내역취소(본인) 버튼
      let selectRow = null;
      if (selectOptions.length > 0) {
        selectRow = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('delete_select')
              .setPlaceholder('삭제할 후원 내역을 선택하세요')
              .addOptions(selectOptions.slice(0, 25)) // SelectMenu 한 줄 최대 25개
          );
      }
      let cancelRow = null;
      if (showList.find(x => x.type === 'money' && x.userId === userId)) {
        cancelRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('cancel_self')
            .setLabel('내 후원자 역할 취소')
            .setStyle(ButtonStyle.Danger)
        );
      }

      let rows = [row];
      if (selectRow) rows.push(selectRow);
      if (cancelRow) rows.push(cancelRow);

      return { embed, rows, page, maxPage, filter };
    };

    // 첫 호출
    let { embed, rows, page: curPage, filter: curFilter } = await updateList(1, filter);

    await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 120_000
    });

    collector.on('collect', async btnInt => {
      let nextPage = curPage;
      let nextFilter = curFilter;

      // SelectMenu(삭제)
      if (btnInt.customId === 'delete_select') {
        const selected = btnInt.values[0];
        if (selected.startsWith('money_')) {
          let userId = selected.replace('money_', '');
          let donorData = loadDonorRoles();
          if (donorData[userId]) {
            delete donorData[userId];
            saveDonorRoles(donorData);
            try {
              let member = await interaction.guild.members.fetch(userId).catch(() => null);
              if (member) await member.roles.remove(DONOR_ROLE_ID).catch(() => {});
            } catch {}
            await btnInt.reply({ content: `후원금 내역 및 역할이 삭제되었습니다.`, ephemeral: true });
          } else {
            await btnInt.reply({ content: `이미 삭제된 내역입니다.`, ephemeral: true });
          }
        }
        if (selected.startsWith('item_')) {
          let index = Number(selected.replace('item_', ''));
          let arr = loadItemDonations();
          if (arr[index]) {
            arr.splice(index, 1);
            saveItemDonations(arr);
            await btnInt.reply({ content: `상품 후원 내역이 삭제되었습니다.`, ephemeral: true });
          } else {
            await btnInt.reply({ content: `이미 삭제된 내역입니다.`, ephemeral: true });
          }
        }
        let updated = await updateList(curPage, curFilter, interaction.user.id);
        await interaction.editReply({ embeds: [updated.embed], components: updated.rows });
        return;
      }

      if (btnInt.customId === 'prev') nextPage--;
      if (btnInt.customId === 'next') nextPage++;
      if (btnInt.customId === 'filter_all') nextFilter = 'all', nextPage = 1;
      if (btnInt.customId === 'filter_money') nextFilter = 'money', nextPage = 1;
      if (btnInt.customId === 'filter_item') nextFilter = 'item', nextPage = 1;

      if (btnInt.customId === 'cancel_self') {
        let donorData = loadDonorRoles();
        if (donorData[interaction.user.id]) {
          delete donorData[interaction.user.id];
          saveDonorRoles(donorData);
          try {
            let member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            if (member) await member.roles.remove(DONOR_ROLE_ID).catch(() => {});
          } catch {}
        }
        await btnInt.update({
          embeds: [new EmbedBuilder()
            .setTitle('✅ 내 후원자 역할 취소 완료!')
            .setDescription('후원자 역할이 즉시 해제되었습니다.\n언제든 다시 후원시 기간이 새로 부여됩니다.')
            .setColor(0x39db7f)
          ],
          components: []
        });
        collector.stop();
        return;
      }

      // 리스트 갱신
      let updated = await updateList(nextPage, nextFilter, interaction.user.id);
      curPage = updated.page;
      curFilter = updated.filter;

      await btnInt.update({ embeds: [updated.embed], components: updated.rows });
    });

    collector.on('end', async () => {
      rows.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
      try {
        await interaction.editReply({ components: rows });
      } catch {}
    });
  }
};
