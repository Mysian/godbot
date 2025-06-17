// commands/manage-json.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('저장파일관리')
    .setDescription('data 폴더 내 모든 .json 파일의 데이터를 관리합니다.'),

  async execute(interaction) {
    // 1. data 폴더의 모든 .json 파일 목록 읽기
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    if (!files.length) {
      return interaction.reply({ content: 'data 폴더에 .json 파일이 없습니다.', ephemeral: true });
    }

    // 2. 셀렉트 메뉴로 파일 선택
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('jsonfile_select')
      .setPlaceholder('확인/수정할 JSON 파일을 선택하세요!')
      .addOptions(files.map(f => ({
        label: f,
        value: f,
      })));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: '관리할 .json 파일을 선택하세요.',
      components: [row],
      ephemeral: true,
    });

    // 3. 이후 이벤트: 파일 내용 조회/수정
    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 90000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'jsonfile_select') {
        const fileName = i.values[0];
        const filePath = path.join(dataDir, fileName);
        let text = fs.readFileSync(filePath, 'utf8');
        let pretty = '';
        try {
          const parsed = JSON.parse(text);
          pretty = JSON.stringify(parsed, null, 2);
        } catch {
          pretty = text;
        }
        const embed = new EmbedBuilder()
          .setTitle(`📦 ${fileName}`)
          .setDescription('아래 JSON 내용을 수정하려면 [수정] 버튼을 눌러주세요.')
          .addFields({ name: '내용', value: `\`\`\`json\n${pretty.slice(0, 1900)}\n\`\`\`` });

        const editBtn = new ButtonBuilder()
          .setCustomId(`edit_${fileName}`)
          .setLabel('수정')
          .setStyle(ButtonStyle.Primary);

        await i.update({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(editBtn)],
        });
      }

      // 4. 수정 버튼 누르면 모달로 전체 내용 편집
      if (i.customId.startsWith('edit_')) {
        const fileName = i.customId.slice(5);
        const filePath = path.join(dataDir, fileName);
        let text = fs.readFileSync(filePath, 'utf8');
        if (text.length > 1900) text = text.slice(0, 1900); // (디스코드 제한)
        const modal = new ModalBuilder()
          .setCustomId(`modal_${fileName}`)
          .setTitle(`${fileName} 수정`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('json_edit_content')
                .setLabel('JSON 데이터 (전체 복붙/수정)')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(text)
                .setRequired(true)
            )
          );
        await i.showModal(modal);
      }
    });

    // 5. 모달 제출 처리(실제 파일 저장)
    interaction.client.on('interactionCreate', async modalInteraction => {
      if (!modalInteraction.isModalSubmit()) return;
      if (!modalInteraction.customId.startsWith('modal_')) return;
      if (modalInteraction.user.id !== interaction.user.id) return;

      const fileName = modalInteraction.customId.slice(6);
      const filePath = path.join(dataDir, fileName);
      const content = modalInteraction.fields.getTextInputValue('json_edit_content');
      try {
        // 저장 전 JSON 파싱 검사(오류시 거부)
        JSON.parse(content);
        fs.writeFileSync(filePath, content, 'utf8');
        await modalInteraction.reply({ content: `✅ ${fileName} 저장 완료!`, ephemeral: true });
      } catch {
        await modalInteraction.reply({ content: '❌ 유효하지 않은 JSON 데이터입니다. 저장 실패.', ephemeral: true });
      }
    });
  }
};
