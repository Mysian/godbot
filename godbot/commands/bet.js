const { 
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder 
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getBE, addBE } = require('./be-util.js');
const betsPath = path.join(__dirname, '../data/bets.json');

function loadBets() {
  if (!fs.existsSync(betsPath)) fs.writeFileSync(betsPath, '[]');
  return JSON.parse(fs.readFileSync(betsPath, 'utf8'));
}
function saveBets(data) {
  fs.writeFileSync(betsPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('내기')
    .setDescription('진행중인 내기 목록을 확인하고, 참여/생성/종료할 수 있습니다.'),

  async execute(interaction) {
    let bets = loadBets();
    if (!bets.length) {
      return await interaction.reply({ content: '현재 진행 중인 내기가 없습니다.', ephemeral: true });
    }
    let page = 0;
    const PAGE_SIZE = 3;
    const totalPages = Math.ceil(bets.length / PAGE_SIZE);

    // 임베드 생성 함수
    const makeEmbed = (page) => {
      const start = page * PAGE_SIZE;
      const items = bets.slice(start, start + PAGE_SIZE);
      const embed = new EmbedBuilder()
        .setTitle(`현재 진행 중인 내기 목록 [${page + 1}/${totalPages}]`)
        .setColor(0x2b99ff)
        .setDescription(items.map((bet, idx) =>
          `**${start + idx + 1}. [${bet.topic}]**\n- 항목: ${bet.choices.join(' / ')}\n- 금액: ${bet.min} ~ ${bet.max} BE\n- 주최: <@${bet.owner}>\n- 참여자: ${bet.participants.length}명`
        ).join('\n\n'));
      return embed;
    };

    // 버튼 생성
    const makeRow = (page) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1),
      new ButtonBuilder().setCustomId('join').setLabel('참여').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('new').setLabel('내기 생성').setStyle(ButtonStyle.Success)
    );

    // 첫 메시지
    const msg = await interaction.reply({ embeds: [makeEmbed(page)], components: [makeRow(page)], ephemeral: true, fetchReply: true });

    // collector로 페이지네이션 및 버튼 핸들
    const collector = msg.createMessageComponentCollector({ time: 90_000 });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) return i.reply({ content: '본인만 조작할 수 있습니다.', ephemeral: true });
      if (i.customId === 'prev') page--;
      else if (i.customId === 'next') page++;
      else if (i.customId === 'new') {
        // 내기 생성 모달 호출 (핸들러는 아래 modal 함수 참고)
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
        // 참여할 내기 선택
        const currBets = bets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
        if (!currBets.length) return i.reply({ content: '참여할 내기가 없습니다.', ephemeral: true });
        const select = new StringSelectMenuBuilder()
          .setCustomId('bet_join_select')
          .setPlaceholder('참여할 내기를 선택하세요')
          .addOptions(currBets.map((bet, idx) => ({
            label: `[${bet.topic}]`,
            value: `${page * PAGE_SIZE + idx}`,
            description: `항목: ${bet.choices.join('/')} | 금액: ${bet.min}~${bet.max}BE`
          })));
        await i.reply({
          content: '참여할 내기를 선택하세요.',
          components: [new ActionRowBuilder().addComponents(select)],
          ephemeral: true
        });
        return;
      }
      await i.update({ embeds: [makeEmbed(page)], components: [makeRow(page)] });
    });

    collector.on('end', async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },

  // === 모달 통합 핸들러 ===
  async modal(interaction) {
    // 내기 생성 모달
    if (interaction.customId === "bet_create") {
      const topic = interaction.fields.getTextInputValue('topic').trim();
      const choices = interaction.fields.getTextInputValue('choices').split(',').map(x => x.trim()).filter(Boolean);
      const min = parseInt(interaction.fields.getTextInputValue('min').replace(/\D/g, ''));
      const max = parseInt(interaction.fields.getTextInputValue('max').replace(/\D/g, ''));
      if (choices.length < 2 || isNaN(min) || isNaN(max) || min <= 0 || max < min) {
        return interaction.reply({ content: '입력값 오류! 항목 2개 이상, 금액 양수 입력!', ephemeral: true });
      }
      let bets = loadBets();
      bets.push({ topic, choices, min, max, owner: interaction.user.id, participants: [], active: true });
      saveBets(bets);
      return interaction.reply({ content: `내기 [${topic}]가 생성되었습니다!`, ephemeral: true });
    }
    // 내기 참여 선택 (셀렉트 메뉴 -> 모달)
    else if (interaction.customId === "bet_join_select") {
      const betIdx = parseInt(interaction.values[0]);
      let bets = loadBets();
      const bet = bets[betIdx];
      if (!bet || !bet.active) return interaction.reply({ content: '해당 내기를 찾을 수 없습니다.', ephemeral: true });
      if (bet.participants.some(p => p.user === interaction.user.id)) {
        return interaction.reply({ content: '이미 참여한 내기입니다.', ephemeral: true });
      }
      // 항목 선택 모달
      const modal = new ModalBuilder().setCustomId(`bet_join_${betIdx}`).setTitle(`[${bet.topic}] 내기 참여`);
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
    // 내기 참여 최종
    else if (interaction.customId.startsWith("bet_join_")) {
      const betIdx = parseInt(interaction.customId.split('_')[2]);
      let bets = loadBets();
      const bet = bets[betIdx];
      if (!bet || !bet.active) return interaction.reply({ content: '해당 내기를 찾을 수 없습니다.', ephemeral: true });
      if (bet.participants.some(p => p.user === interaction.user.id)) {
        return interaction.reply({ content: '이미 참여한 내기입니다.', ephemeral: true });
      }
      const choice = interaction.fields.getTextInputValue('choice').trim();
      const amount = parseInt(interaction.fields.getTextInputValue('amount').replace(/\D/g, ''));
      if (!bet.choices.includes(choice) || isNaN(amount) || amount < bet.min || amount > bet.max) {
        return interaction.reply({ content: '항목 또는 금액 오류!', ephemeral: true });
      }
      if (getBE(interaction.user.id) < amount) {
        return interaction.reply({ content: '잔액이 부족합니다!', ephemeral: true });
      }
      await addBE(interaction.user.id, -amount, `[내기] ${bet.topic} - ${choice}`);
      bet.participants.push({ user: interaction.user.id, choice, amount });
      saveBets(bets);
      return interaction.reply({ content: `내기 [${bet.topic}]에 [${choice}]로 ${amount}BE 참여 완료!`, ephemeral: true });
    }
  }
};
