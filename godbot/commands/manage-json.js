// commands/manage-json.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const dataDir = path.join(__dirname, '../data');
const PAGE_SIZE = 1900; // 한 embed에서 보여줄 최대 JSON 길이

module.exports = {
  data: new SlashCommandBuilder()
    .setName('저장파일관리')
    .setDescription('data 폴더 내 모든 .json 파일의 데이터를 관리/다운로드합니다.')
    .addStringOption(opt =>
      opt.setName('옵션')
        .setDescription('작업 종류')
        .setRequired(true)
        .addChoices(
          { name: '확인/수정', value: 'edit' },
          { name: '다운로드', value: 'download' },
        )
    ),
  async execute(interaction) {
    const option = interaction.options.getString('옵션');

    // === [1] 다운로드 ===
    if (option === 'download') {
      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
      if (!files.length)
        return interaction.reply({ content: 'data 폴더에 .json 파일이 없습니다.', ephemeral: true });

      const zip = new AdmZip();
      for (const file of files) {
        zip.addLocalFile(path.join(dataDir, file), '', file);
      }
      // 날짜_시간.zip (YYYYMMDD_HHMMSS.zip)
      const now = new Date();
      const dateStr =
        now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') + '_' +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');
      const filename = `${dateStr}.zip`;
      const tmpPath = path.join(__dirname, `../data/${filename}`);
      zip.writeZip(tmpPath);

      const attachment = new AttachmentBuilder(tmpPath, { name: filename });
      await interaction.reply({
        content: `모든 .json 파일을 압축했습니다. (${filename})`,
        files: [attachment],
        ephemeral: true,
      });

      setTimeout(() => { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); }, 60 * 1000);
      return;
    }

    // === [2] 확인/수정 ===
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    if (!files.length) {
      return interaction.reply({ content: 'data 폴더에 .json 파일이 없습니다.', ephemeral: true });
    }
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

    const filter = i => i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({
      filter,
      time: 90000,
    });

    // 모달 제출 핸들러 정의 (collector 내에서만 등록)
    const modalHandler = async modalInteraction => {
      if (!modalInteraction.isModalSubmit()) return;
      if (!modalInteraction.customId.startsWith('modal_')) return;
      if (modalInteraction.user.id !== interaction.user.id) return;

      const fileName = modalInteraction.customId.slice(6);
      const filePath = path.join(dataDir, fileName);
      const content = modalInteraction.fields.getTextInputValue('json_edit_content');
      try {
        JSON.parse(content);
        fs.writeFileSync(filePath, content, 'utf8');
        await modalInteraction.reply({ content: `✅ ${fileName} 저장 완료!`, ephemeral: true });
      } catch {
        await modalInteraction.reply({ content: '❌ 유효하지 않은 JSON 데이터입니다. 저장 실패.', ephemeral: true });
      }
    };

    interaction.client.on('interactionCreate', modalHandler);

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

        // 페이지네이션을 위해 쪼개기
        const totalPages = Math.ceil(pretty.length / PAGE_SIZE);
        let page = 0;

        const getEmbed = (pageIdx) => {
          return new EmbedBuilder()
            .setTitle(`📦 ${fileName} (페이지 ${pageIdx + 1}/${totalPages})`)
            .setDescription('아래 JSON 내용을 수정하려면 [수정] 버튼을 눌러주세요.')
            .addFields({
              name: '내용',
              value: `\`\`\`json\n${pretty.slice(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE)}\n\`\`\``
            });
        };

        // 이전/다음/수정 버튼
        const getRow = (pageIdx) => {
          const prevBtn = new ButtonBuilder()
            .setCustomId(`prev_${fileName}`)
            .setLabel('◀ 이전')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIdx === 0);

          const nextBtn = new ButtonBuilder()
            .setCustomId(`next_${fileName}`)
            .setLabel('다음 ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIdx >= totalPages - 1);

          const editBtn = new ButtonBuilder()
            .setCustomId(`edit_${fileName}`)
            .setLabel('수정')
            .setStyle(ButtonStyle.Primary);

          return new ActionRowBuilder().addComponents(prevBtn, nextBtn, editBtn);
        };

        await i.update({
          embeds: [getEmbed(page)],
          components: [getRow(page)]
        });

        // 페이지네이션용 collector (이전에 생성된 collector와 중첩 방지)
        const pageCollector = i.channel.createMessageComponentCollector({
          filter: btn => btn.user.id === i.user.id,
          time: 180000 // 3분
        });

        pageCollector.on('collect', async btnI => {
          if (btnI.customId === `prev_${fileName}` && page > 0) {
            page--;
            await btnI.update({
              embeds: [getEmbed(page)],
              components: [getRow(page)]
            });
          }
          if (btnI.customId === `next_${fileName}` && page < totalPages - 1) {
            page++;
            await btnI.update({
              embeds: [getEmbed(page)],
              components: [getRow(page)]
            });
          }
          if (btnI.customId === `edit_${fileName}`) {
            let editText = pretty;
            if (pretty.length > PAGE_SIZE * 3) {
              // 너무 크면 전체 다 보여주지 않고 처음 세 페이지만 합쳐서 보여줌
              editText = pretty.slice(0, PAGE_SIZE * 3);
            }
            const modal = new ModalBuilder()
              .setCustomId(`modal_${fileName}`)
              .setTitle(`${fileName} 수정`)
              .addComponents(
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId('json_edit_content')
                    .setLabel('JSON 데이터 (전체 복붙/수정)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(editText)
                    .setRequired(true)
                )
              );
            await btnI.showModal(modal);
          }
        });

        pageCollector.on('end', () => {
          // 만료시 버튼 비활성화
          i.editReply({
            components: []
          }).catch(() => { });
        });
      }

      if (i.customId.startsWith('edit_')) {
        const fileName = i.customId.slice(5);
        const filePath = path.join(dataDir, fileName);
        let text = fs.readFileSync(filePath, 'utf8');
        if (text.length > PAGE_SIZE * 3) text = text.slice(0, PAGE_SIZE * 3);
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

    collector.on('end', () => {
      interaction.client.removeListener('interactionCreate', modalHandler);
    });
  }
};
