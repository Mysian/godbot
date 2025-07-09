const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

// 파일 경로
const nicknameRolesPath = path.join(__dirname, '../data/nickname-roles.json');
const titlesPath = path.join(__dirname, '../data/limited-titles.json');

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('상점관리')
    .setDescription('상점 역할/칭호 관리 (관리자만)')
    .addStringOption(opt =>
      opt.setName('종류')
        .setDescription('닉네임색상 or 한정칭호')
        .setRequired(true)
        .addChoices(
          { name: '닉네임색상', value: 'nickname' },
          { name: '한정칭호', value: 'title' }
        ))
    .addStringOption(opt =>
      opt.setName('작업')
        .setDescription('추가,수정,삭제')
        .setRequired(true)
        .addChoices(
          { name: '추가', value: 'add' },
          { name: '수정', value: 'edit' },
          { name: '삭제', value: 'remove' }
        ))
    .addStringOption(opt =>
      opt.setName('roleid')
        .setDescription('대상 역할ID (수정/삭제/추가시 필요)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('이름')
        .setDescription('이름 (추가/수정시)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('이모지')
        .setDescription('이모지 (추가/수정시)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('설명')
        .setDescription('설명 (추가/수정시)')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('가격')
        .setDescription('가격(BE)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('색상')
        .setDescription('HEX 코드 (닉네임 색상만, 예:#00C3FF)')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('재고')
        .setDescription('재고(한정판 칭호만)')
        .setRequired(false)
    ),

  async execute(interaction) {
    // 관리자만 사용 가능 (MANAGE_ROLES 이상 권한)
    if (!interaction.memberPermissions.has('Administrator')) {
      await interaction.reply({ content: '관리자만 사용 가능합니다.', ephemeral: true });
      return;
    }
    const type = interaction.options.getString('종류');
    const op = interaction.options.getString('작업');
    const roleId = interaction.options.getString('roleid');
    const name = interaction.options.getString('이름');
    const emoji = interaction.options.getString('이모지');
    const desc = interaction.options.getString('설명');
    const price = interaction.options.getInteger('가격');
    const color = interaction.options.getString('색상');
    const stock = interaction.options.getInteger('재고');

    // 닉네임 색상
    if (type === 'nickname') {
      let roles = await loadJson(nicknameRolesPath);
      if (op === 'add') {
        if (roles[roleId]) return await interaction.reply({ content: '이미 존재하는 역할ID입니다.', ephemeral: true });
        roles[roleId] = {
          roleId,
          name: name || '',
          emoji: emoji || '',
          price: price || 0,
          desc: desc || '',
          color: color || null
        };
        await saveJson(nicknameRolesPath, roles);
        return await interaction.reply({ content: `[닉네임색상] 추가 완료: ${roleId}`, ephemeral: true });
      }
      if (op === 'edit') {
        if (!roles[roleId]) return await interaction.reply({ content: '해당 역할ID가 없습니다.', ephemeral: true });
        if (name) roles[roleId].name = name;
        if (emoji) roles[roleId].emoji = emoji;
        if (price != null) roles[roleId].price = price;
        if (desc) roles[roleId].desc = desc;
        if (color) roles[roleId].color = color;
        await saveJson(nicknameRolesPath, roles);
        return await interaction.reply({ content: `[닉네임색상] 수정 완료: ${roleId}`, ephemeral: true });
      }
      if (op === 'remove') {
        if (!roles[roleId]) return await interaction.reply({ content: '해당 역할ID가 없습니다.', ephemeral: true });
        delete roles[roleId];
        await saveJson(nicknameRolesPath, roles);
        return await interaction.reply({ content: `[닉네임색상] 삭제 완료: ${roleId}`, ephemeral: true });
      }
    }
    // 한정판 칭호
    if (type === 'title') {
      let titles = await loadJson(titlesPath);
      if (op === 'add') {
        if (titles[roleId]) return await interaction.reply({ content: '이미 존재하는 역할ID입니다.', ephemeral: true });
        titles[roleId] = {
          roleId,
          name: name || '',
          emoji: emoji || '',
          price: price || 0,
          desc: desc || '',
          stock: stock != null ? stock : null
        };
        await saveJson(titlesPath, titles);
        return await interaction.reply({ content: `[한정칭호] 추가 완료: ${roleId}`, ephemeral: true });
      }
      if (op === 'edit') {
        if (!titles[roleId]) return await interaction.reply({ content: '해당 역할ID가 없습니다.', ephemeral: true });
        if (name) titles[roleId].name = name;
        if (emoji) titles[roleId].emoji = emoji;
        if (price != null) titles[roleId].price = price;
        if (desc) titles[roleId].desc = desc;
        if (stock != null) titles[roleId].stock = stock;
        await saveJson(titlesPath, titles);
        return await interaction.reply({ content: `[한정칭호] 수정 완료: ${roleId}`, ephemeral: true });
      }
      if (op === 'remove') {
        if (!titles[roleId]) return await interaction.reply({ content: '해당 역할ID가 없습니다.', ephemeral: true });
        delete titles[roleId];
        await saveJson(titlesPath, titles);
        return await interaction.reply({ content: `[한정칭호] 삭제 완료: ${roleId}`, ephemeral: true });
      }
    }
    await interaction.reply({ content: '잘못된 옵션.', ephemeral: true });
  }
};
