const { 
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder 
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getBE, addBE } = require('./be-util.js');
const betsPath = path.join(__dirname, '../data/bets.json');

// ===== 고유 id 생성 함수 =====
function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function loadBets() {
  if (!fs.existsSync(betsPath)) fs.writeFileSync(betsPath, '[]');
  return JSON.parse(fs.readFileSync(betsPath, 'utf8'));
}
function saveBets(data) {
  fs.writeFileSync(betsPath, JSON.stringify(data, null, 2));
}
function isAdmin(member) {
  return member.permissions.has('Administrator') || member.permissions.has('ManageGuild');
}
// === 특정 역할 예외 처리 함수(주최자 참여만 예외) ===
function isBetException(member) {
  const ALLOW_ROLE_IDS = ["786128824365482025", "1201856430580432906"];
  return member && member.roles.cache.some(role => ALLOW_ROLE_IDS.includes(role.id));
}
const BET_FEE_PERCENT = 10;
const PAGE_SIZE = 3;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('내기')
    .setDescription('진행중인 내기 목록을 확인, 참여, 마감, 정산, 무산할 수 있습니다.'),
  async execute(interaction) {
    try {
      let bets = loadBets();
      let page = 0;
      const totalPages = Math.max(1, Math.ceil(bets.length / PAGE_SIZE));
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      const makeEmbed = (page) => {
        if (!bets.length) {
          return new EmbedBuilder()
            .setTitle(`현재 진행 중인 내기 없음`)
            .setColor(0x2b99ff)
            .setDescription(`진행 중인 내기가 없습니다. 아래 버튼으로 새 내기를 생성할 수 있습니다.`);
        }
        const start = page * PAGE_SIZE;
        const items = bets.slice(start, start + PAGE_SIZE);
        const embed = new EmbedBuilder()
          .setTitle(`현재 진행 중인 내기 목록 [${page + 1}/${totalPages}]`)
          .setColor(0x2b99ff)
          .setDescription(
            "💡 **내기 안내**\n- 1인 1회만 참여, 진행자(주최자)는 참여 불가(일부 역할은 예외)\n- 정산시 전체 베팅액의 10% 수수료 차감, 나머지는 승자끼리 비율분배\n- '마감' 후 '결과(정산)'에서 승리 항목을 선택해 자동 분배\n- 무산시 모든 참여자에게 베팅금 환불"
          );
        items.forEach((bet, idx) => {
          let status = '';
          if (!bet.active) status = bet.settled ? ' (정산 완료)' : ' (마감됨)';
          let choiceStatus = '';
          if (bet.choices && bet.choices.length) {
            let statusArr = [];
            for (const choice of bet.choices) {
              const group = bet.participants.filter(p => p.choice === choice);
              const percent = bet.participants.length
                ? Math.round(group.length / bet.participants.length * 100)
                : 0;
              const gauge = "█".repeat(Math.round(percent / 10)).padEnd(10, "░");
              statusArr.push(
                `> **${choice}**  (${group.length}명, ${percent}%)\n> \`${gauge}\``
              );
            }
            choiceStatus = statusArr.join('\n');
          }
          embed.addFields({
            name: `#${start + idx + 1} [${bet.topic}]${status}`,
            value:
              `- 항목: ${bet.choices.join(' / ')}\n` +
              `- 금액: ${bet.min} ~ ${bet.max} BE\n` +
              `- 주최: <@${bet.owner}>\n` +
              `- 참여자: ${bet.participants.length}명\n` +
              `\n**배팅 현황**\n${choiceStatus}`
          });
        });
        return embed;
      };

      const makeRow = (page, member) => {
        if (!bets.length) {
          return [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('new').setLabel('내기 생성').setStyle(ButtonStyle.Success)
          )];
        }
        const start = page * PAGE_SIZE;
        const items = bets.slice(start, start + PAGE_SIZE);
        const showClose = items.some((bet) =>
          bet.active &&
          (bet.owner === interaction.user.id ||
            (member && isAdmin(member)))
        );
        const showSettle = items.some((bet) =>
          !bet.active && !bet.settled &&
          (bet.owner === interaction.user.id ||
            (member && isAdmin(member)))
        );
        const showCancel = items.some(bet =>
          bet.active &&
          (bet.owner === interaction.user.id || (member && isAdmin(member)))
        );
        let firstRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1),
          new ButtonBuilder().setCustomId('join').setLabel('참여').setStyle(ButtonStyle.Primary)
            .setDisabled(items.every(bet => !bet.active)),
          new ButtonBuilder().setCustomId('new').setLabel('내기 생성').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('share').setLabel('내기 공유').setStyle(ButtonStyle.Secondary)
        );
        let secondRow = new ActionRowBuilder();
        if (showClose)
          secondRow.addComponents(new ButtonBuilder().setCustomId('close').setLabel('마감').setStyle(ButtonStyle.Danger));
        if (showSettle)
          secondRow.addComponents(new ButtonBuilder().setCustomId('settle').setLabel('결과(정산)').setStyle(ButtonStyle.Primary));
        if (showCancel)
          secondRow.addComponents(new ButtonBuilder().setCustomId('cancel').setLabel('내기 무산').setStyle(ButtonStyle.Secondary));
        let rows = [firstRow];
        if (secondRow.components.length > 0)
          rows.push(secondRow);
        return rows;
      };

      const rows = makeRow(page, member);
      const msg = await interaction.reply({ 
        embeds: [makeEmbed(page)], 
        components: rows,
        flags: 1 << 6,
        fetchReply: true 
      });

      const collector = msg.createMessageComponentCollector({
        filter: i => i.isButton() && i.user.id === interaction.user.id,
        time: 300_000
      });

      collector.on('collect', async i => {
        try {
          if (i.customId === 'prev') page--;
          else if (i.customId === 'next') page++;
          else if (i.customId === 'new') {
            const modal = new ModalBuilder().setCustomId('bet_create').setTitle('새 내기 생성');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('topic').setLabel('내기 주제').setStyle(TextInputStyle.Short).setRequired(true)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('choices').setLabel('항목(쉼표로 구분, 최소 2개)').setStyle(TextInputStyle.Short).setRequired(true)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('min').setLabel('최소 금액').setStyle(TextInputStyle.Short).setRequired(true)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('max').setLabel('최대 금액').setStyle(TextInputStyle.Short).setRequired(true)
              )
            );
            await i.showModal(modal);
            return;
          }
          else if (i.customId === 'join') {
            const currBets = bets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
              .filter(bet => bet.active);
            if (!currBets.length) return i.reply({ content: '참여 가능한 내기가 없습니다.', flags: 1 << 6 });
            const select = new StringSelectMenuBuilder()
              .setCustomId('bet_join_select')
              .setPlaceholder('참여할 내기를 선택하세요')
              .addOptions(currBets.map((bet) => ({
                label: `[${bet.topic}]`,
                value: bet.id, // 고유 id!
                description: `항목: ${bet.choices.join('/')} | 금액: ${bet.min}~${bet.max}BE`
              })));
            await i.reply({
              content: '참여할 내기를 선택하세요. (베팅은 1회만 가능, 주최자 참여 불가)',
              components: [new ActionRowBuilder().addComponents(select)],
              flags: 1 << 6
            });
            return;
          }
          else if (i.customId === 'close') {
            const currBets = bets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
              .filter(bet =>
                bet.active && (
                  bet.owner === interaction.user.id ||
                  (member && isAdmin(member))
                )
              );
            if (!currBets.length)
              return i.reply({ content: '마감 가능한 내기가 없습니다.', flags: 1 << 6 });
            const select = new StringSelectMenuBuilder()
              .setCustomId('bet_close_select')
              .setPlaceholder('마감할 내기를 선택하세요')
              .addOptions(currBets.map((bet) => ({
                label: `[${bet.topic}]`,
                value: bet.id,
                description: `항목: ${bet.choices.join('/')} | 금액: ${bet.min}~${bet.max}BE`
              })));
            await i.reply({
              content: '내기를 마감하면 더 이상 참여가 불가합니다.',
              components: [new ActionRowBuilder().addComponents(select)],
              flags: 1 << 6
            });
            return;
          }
          else if (i.customId === 'settle') {
            const currBets = bets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
              .filter(bet =>
                !bet.active && !bet.settled && (
                  bet.owner === interaction.user.id ||
                  (member && isAdmin(member))
                )
              );
            if (!currBets.length)
              return i.reply({ content: '정산 가능한 내기가 없습니다.', flags: 1 << 6 });
            const select = new StringSelectMenuBuilder()
              .setCustomId('bet_settle_select')
              .setPlaceholder('정산할 내기를 선택하세요')
              .addOptions(currBets.map((bet) => ({
                label: `[${bet.topic}]`,
                value: bet.id,
                description: `항목: ${bet.choices.join('/')} | 금액: ${bet.min}~${bet.max}BE`
              })));
            await i.reply({
              content: '정산할 내기를 선택하세요. (전체 베팅액의 10% 수수료가 차감됩니다)',
              components: [new ActionRowBuilder().addComponents(select)],
              flags: 1 << 6
            });
            return;
          }
          // === 공유버튼 로직 (id로) ===
          else if (i.customId === 'share') {
            const betsAll = loadBets();
            const betsActive = betsAll.filter(bet => bet.active);
            if (!betsActive.length)
              return i.reply({ content: '진행 중인 내기가 없습니다.', flags: 1 << 6 });

            const select = new StringSelectMenuBuilder()
              .setCustomId('bet_share_select')
              .setPlaceholder('공유할 내기를 선택하세요')
              .addOptions(betsActive.map((bet) => ({
                label: `[${bet.topic}]`,
                value: bet.id, // id!
                description: `항목: ${bet.choices.join('/')} | 금액: ${bet.min}~${bet.max}BE`
              })));

            await i.reply({
              content: '공유할 내기를 선택하세요.',
              components: [new ActionRowBuilder().addComponents(select)],
              flags: 1 << 6
            });
            return;
          }
          else if (i.customId === 'cancel') {
            const currBets = bets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
              .filter(bet =>
                bet.active &&
                (bet.owner === interaction.user.id || (member && isAdmin(member)))
              );
            if (!currBets.length)
              return i.reply({ content: '무산 가능한 내기가 없습니다.', flags: 1 << 6 });
            const select = new StringSelectMenuBuilder()
              .setCustomId('bet_cancel_select')
              .setPlaceholder('무산할 내기를 선택하세요')
              .addOptions(currBets.map((bet) => ({
                label: `[${bet.topic}]`,
                value: bet.id,
                description: `항목: ${bet.choices.join('/')} | 금액: ${bet.min}~${bet.max}BE`
              })));
            await i.reply({
              content: '내기를 무산 처리하면 모든 기록이 삭제되고, 참여자에게 환불됩니다.',
              components: [new ActionRowBuilder().addComponents(select)],
              flags: 1 << 6
            });
            return;
          }
          await i.update({ embeds: [makeEmbed(page)], components: makeRow(page, member) });
        } catch (err) {
          if (!i.replied && !i.deferred) {
            await i.reply({ content: '❌ 버튼 처리 중 오류!\n' + (err.message || err), flags: 1 << 6 }).catch(() => {});
          }
        }
      });

      collector.on('end', async () => {
        await msg.edit({ components: [] }).catch(() => {});
      });
    } catch (err) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ 내기 실행 중 오류 발생!\n' + (err.message || err), flags: 1 << 6 }).catch(() => {});
      }
    }
  },

  async modal(interaction) {
    try {
      if (interaction.customId === "bet_create") {
        const topic = interaction.fields.getTextInputValue('topic').trim();
        const choices = interaction.fields.getTextInputValue('choices').split(',').map(x => x.trim()).filter(Boolean);
        const min = parseInt(interaction.fields.getTextInputValue('min').replace(/\D/g, ''));
        const max = parseInt(interaction.fields.getTextInputValue('max').replace(/\D/g, ''));
        if (choices.length < 2 || isNaN(min) || isNaN(max) || min <= 0 || max < min) {
          return interaction.reply({ content: '입력값 오류! 항목 2개 이상, 금액 양수 입력!', flags: 1 << 6 });
        }
        let bets = loadBets();
        bets.push({ id: uuid(), topic, choices, min, max, owner: interaction.user.id, participants: [], active: true });
        saveBets(bets);
        return interaction.reply({ content: `내기 [${topic}]가 생성되었습니다!\n- 항목: ${choices.join(', ')}\n- 금액: ${min}~${max}BE\n진행자(주최자)는 참여할 수 없으며, 참여는 1회만 가능합니다.`, flags: 1 << 6 });
      }
      else if (interaction.customId === "bet_join_select") {
        const betId = interaction.values[0];
        let bets = loadBets();
        const bet = bets.find(b => b.id === betId);
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const isException = isBetException(member);

        if (!bet || !bet.active)
          return interaction.reply({ content: '해당 내기를 찾을 수 없습니다.', flags: 1 << 6 });

        // 내기 1회 참여 제한(역할 관계없이 모두 적용)
        if (bet.participants.some(p => p.user === interaction.user.id))
          return interaction.reply({ content: '이미 참여한 내기입니다.', flags: 1 << 6 });

        // 주최자 참여 금지: 특정 역할만 예외
        if (!isException && bet.owner === interaction.user.id)
          return interaction.reply({ content: '본인이 만든 내기에는 참여할 수 없습니다.', flags: 1 << 6 });

        const modal = new ModalBuilder().setCustomId(`bet_join_${bet.id}`).setTitle(`[${bet.topic}] 내기 참여`);
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('choice').setLabel(`항목(${bet.choices.join(', ')})`).setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('amount').setLabel(`금액(${bet.min}~${bet.max})`).setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
        await interaction.showModal(modal);
      }
      else if (interaction.customId.startsWith("bet_join_")) {
        const betId = interaction.customId.split('_').slice(2).join('_');
        let bets = loadBets();
        const bet = bets.find(b => b.id === betId);
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const isException = isBetException(member);

        if (!bet || !bet.active)
          return interaction.reply({ content: '해당 내기를 찾을 수 없습니다.', flags: 1 << 6 });

        // 내기 1회 참여 제한(역할 관계없이 모두 적용)
        if (bet.participants.some(p => p.user === interaction.user.id))
          return interaction.reply({ content: '이미 참여한 내기입니다.', flags: 1 << 6 });

        // 주최자 참여 금지: 특정 역할만 예외
        if (!isException && bet.owner === interaction.user.id)
          return interaction.reply({ content: '본인이 만든 내기에는 참여할 수 없습니다.', flags: 1 << 6 });

        const choice = interaction.fields.getTextInputValue('choice').trim();
        const amount = parseInt(interaction.fields.getTextInputValue('amount').replace(/\D/g, ''));
        if (!bet.choices.includes(choice) || isNaN(amount) || amount < bet.min || amount > bet.max) {
          return interaction.reply({ content: '항목 또는 금액 오류!', flags: 1 << 6 });
        }
        if (getBE(interaction.user.id) < amount) {
          return interaction.reply({ content: '잔액이 부족합니다!', flags: 1 << 6 });
        }
        await addBE(interaction.user.id, -amount, `[내기] ${bet.topic} - ${choice}`);
        bet.participants.push({ user: interaction.user.id, choice, amount });
        saveBets(bets);
        return interaction.reply({ content: `[${bet.topic}]에 [${choice}]로 ${amount}BE 참여 완료!\n\n- 참여는 1회만 가능하며, 진행자(주최자)는 참여 불가(일부 역할은 예외)입니다.\n- 정산시 10% 수수료가 차감되고 나머지는 승자끼리 비율분배됩니다.`, flags: 1 << 6 });
      }
      else if (interaction.customId === "bet_close_select") {
        const betId = interaction.values[0];
        let bets = loadBets();
        const bet = bets.find(b => b.id === betId);
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (
          !bet ||
          !bet.active ||
          !(bet.owner === interaction.user.id || (member && isAdmin(member)))
        ) {
          return interaction.reply({ content: '마감 권한이 없습니다.', flags: 1 << 6 });
        }
        bet.active = false;
        saveBets(bets);
        return interaction.reply({ content: `내기 [${bet.topic}]가 마감되었습니다.\n이제 '결과(정산)' 버튼으로 승리 항목을 선택하면 자동 분배가 진행됩니다!`, flags: 1 << 6 });
      }
      else if (interaction.customId === "bet_settle_select") {
        const betId = interaction.values[0];
        let bets = loadBets();
        const bet = bets.find(b => b.id === betId);
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (
          !bet ||
          bet.active ||
          bet.settled ||
          !(bet.owner === interaction.user.id || (member && isAdmin(member)))
        ) {
          return interaction.reply({ content: '정산 권한이 없습니다.', flags: 1 << 6 });
        }
        const select = new StringSelectMenuBuilder()
          .setCustomId(`bet_result_select_${bet.id}`)
          .setPlaceholder('승리한 항목을 선택하세요')
          .addOptions([...new Set(bet.choices)].map((ch) => ({
            label: ch,
            value: ch
          })));
        await interaction.reply({
          content: `[${bet.topic}]의 승리 항목을 선택하세요.\n정산 시 전체 베팅액의 10%가 수수료로 차감되며, 남은 금액이 승자끼리 비율분배됩니다.`,
          components: [new ActionRowBuilder().addComponents(select)],
          flags: 1 << 6
        });
      }
      else if (interaction.customId.startsWith('bet_result_select_')) {
        const betId = interaction.customId.split('_').slice(3).join('_');
        let bets = loadBets();
        const betIdx = bets.findIndex(b => b.id === betId);
        const bet = bets[betIdx];
        const winChoice = interaction.values[0];
        if (!bet || bet.settled) 
          return interaction.reply({ content: '이미 정산된 내기이거나 잘못된 접근입니다.', flags: 1 << 6 });
        const total = bet.participants.reduce((a, p) => a + p.amount, 0);
        const winners = bet.participants.filter(p => p.choice === winChoice);
        const winTotal = winners.reduce((a, p) => a + p.amount, 0);

        if (!winners.length) {
          bets.splice(betIdx, 1);
          saveBets(bets);

          let embed = new EmbedBuilder()
            .setTitle(`❌ [${bet.topic}] 내기 정산 결과`)
            .setDescription(`**"${winChoice}"**에 베팅한 사람이 없어 배당 없음\n\n참여자 전원은 베팅금을 잃었습니다.`)
            .setColor(0xed4245)
            .setFooter({ text: `진행자: ${bet.owner}` });

          await interaction.channel.send({ embeds: [embed] });
          return interaction.reply({ content: '정산 완료!', flags: 1 << 6 });
        }

        const fee = Math.floor(total * BET_FEE_PERCENT / 100);
        const pot = total - fee;
        for (const w of winners) {
          const share = Math.floor(pot * (w.amount / winTotal));
          await addBE(w.user, share, `[내기정산] ${bet.topic} (${winChoice})`);
        }

        let resultText = winners.map(w =>
          `- <@${w.user}>: ${Math.floor(pot * (w.amount / winTotal)).toLocaleString()}BE`
        ).join('\n');
        bets.splice(betIdx, 1);
        saveBets(bets);

        let embed = new EmbedBuilder()
          .setTitle(`✅ [${bet.topic}] 내기 정산 결과`)
          .setDescription(
            `**승리 항목:** ${winChoice}\n` +
            `**총 상금:** ${total.toLocaleString()}BE\n` +
            `**수수료:** ${fee.toLocaleString()}BE (10%)\n` +
            `**분배금:** ${pot.toLocaleString()}BE\n\n` +
            `**승리자 배분**\n${resultText}`
          )
          .setColor(0x30d158)
          .setFooter({ text: `진행자: ${bet.owner}` });

        await interaction.channel.send({ embeds: [embed] });
        return interaction.reply({ content: '정산 완료!', flags: 1 << 6 });
      }
      else if (interaction.customId === "bet_share_select") {
        const betId = interaction.values[0];
        const bets = loadBets();
        const bet = bets.find(b => b.id === betId);
        if (!bet || !bet.active)
          return interaction.reply({ content: '내기를 찾을 수 없습니다.', flags: 1 << 6 });

        let embed = new EmbedBuilder()
          .setTitle(`🔥 [${bet.topic}] 내기 안내`)
          .setDescription(
            `**진행자:** <@${bet.owner}>\n` +
            `**항목:** ${bet.choices.join(" / ")}\n` +
            `**금액:** ${bet.min} ~ ${bet.max} BE\n` +
            `**참여자:** ${bet.participants.length}명\n\n` +
            `**아래 버튼으로 바로 참여 가능!**\n\n` +
            `> </내기:1394584041272905869> 명령어로도 언제든 확인`
          )
          .setColor(0xffa200)
          .setFooter({ text: "본 공지는 5분간 버튼 참여가 가능합니다." });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`bet_share_join_${bet.id}`) // id!
            .setLabel('내기 참여하기')
            .setStyle(ButtonStyle.Success)
        );

        const msg = await interaction.channel.send({ embeds: [embed], components: [row] });

        setTimeout(async () => {
          try {
            await msg.edit({ components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`bet_share_join_${bet.id}`)
                .setLabel('내기 참여하기')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true)
            )] });
          } catch {}
        }, 300000);

        await interaction.reply({ content: '공유 완료!', flags: 1 << 6 });
        return;
      }
      else if (interaction.customId.startsWith('bet_share_join_')) {
        const betId = interaction.customId.split('_').slice(3).join('_');
        const bets = loadBets();
        const bet = bets.find(b => b.id === betId);
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const isException = isBetException(member);

        if (!bet || !bet.active)
          return interaction.reply({ content: '해당 내기를 찾을 수 없습니다.', ephemeral: true });

        // 내기 1회 참여 제한(역할 관계없이 모두 적용)
        if (bet.participants.some(p => p.user === interaction.user.id))
          return interaction.reply({ content: '이미 참여한 내기입니다.', flags: 1 << 6 });

        // 주최자 참여 금지: 특정 역할만 예외
        if (!isException && bet.owner === interaction.user.id)
          return interaction.reply({ content: '본인이 만든 내기에는 참여할 수 없습니다.', flags: 1 << 6 });

        const modal = new ModalBuilder()
          .setCustomId(`bet_join_${bet.id}`)
          .setTitle(`[${bet.topic}] 내기 참여`);
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('choice').setLabel(`항목(${bet.choices.join(', ')})`).setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('amount').setLabel(`금액(${bet.min}~${bet.max})`).setStyle(TextInputStyle.Short).setRequired(true)
          )
        );
        await interaction.showModal(modal);
        return;
      }
      else if (interaction.customId === "bet_cancel_select") {
        const betId = interaction.values[0];
        let bets = loadBets();
        const betIdx = bets.findIndex(b => b.id === betId);
        const bet = bets[betIdx];
        if (!bet || !bet.active)
          return interaction.reply({ content: '이미 마감됐거나 존재하지 않는 내기입니다.', flags: 1 << 6 });
        const topic = bet.topic;
        let refundText = '';
        for (const p of bet.participants) {
          await addBE(p.user, p.amount, `[내기무산] ${topic} 환불`);
          refundText += `- <@${p.user}>님: ${p.amount.toLocaleString()}BE 환불\n`;
        }
        bets.splice(betIdx, 1);
        saveBets(bets);
        let result = `❌ **[${topic}] 내기**가 무산 처리되었습니다.\n`;
        if (refundText) result += `\n아래와 같이 참여자 전원에게 환불되었습니다:\n${refundText}`;
        await interaction.channel.send({ content: result });
        await interaction.reply({ content: '무산 완료! 참여자 모두 환불되었습니다.', flags: 1 << 6 });
        return;
      }
    } catch (err) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ 내기 모달 처리 중 오류!\n' + (err.message || err), flags: 1 << 6 }).catch(() => {});
      }
    }
  }
};
