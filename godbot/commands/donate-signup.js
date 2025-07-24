// commands/donate-signup.js

const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const donorRolesPath = path.join(__dirname, '../data/donor_roles.json');
const itemDonationsPath = path.join(__dirname, '../data/item_donations.json');
const DONOR_ROLE_ID = '1397076919127900171';

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

// 역할 기간 누적 부여
async function giveDonorRole(member, days) {
  if (!days || days < 1) return;
  let donorData = loadDonorRoles();
  let now = new Date();
  let base = now;
  if (donorData[member.id]?.expiresAt) {
    let prev = new Date(donorData[member.id].expiresAt);
    base = prev > now ? prev : now;
  }
  let expires = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  donorData[member.id] = {
    roleId: DONOR_ROLE_ID,
    expiresAt: expires.toISOString()
  };
  saveDonorRoles(donorData);
  await member.roles.add(DONOR_ROLE_ID).catch(() => {});
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('후원자등록')
    .setDescription('후원자 역할 또는 상품 후원자를 수동 등록합니다.')
    .addStringOption(o => o.setName('종류').setDescription('등록 종류를 선택').setRequired(true)
      .addChoices({ name: '후원금', value: 'money' }, { name: '상품', value: 'item' }))
    .addUserOption(o => o.setName('유저').setDescription('등록할 유저').setRequired(true))
    .addIntegerOption(o => o.setName('기간').setDescription('[후원금용] 역할 일수(최소 1)').setRequired(false))
    .addStringOption(o => o.setName('메모').setDescription('[후원금용] 참고 메모').setRequired(false))
    .addStringOption(o => o.setName('상품명').setDescription('[상품용] 상품명').setRequired(false))
    .addStringOption(o => o.setName('사유').setDescription('[상품용] 후원 이유').setRequired(false))
    .addStringOption(o => o.setName('사용처').setDescription('[상품용] 사용처/희망상황').setRequired(false))
    .addStringOption(o => o.setName('익명').setDescription('[상품용] 익명여부 (예/아니오)').setRequired(false)),

  async execute(interaction) {
    const kind = interaction.options.getString('종류');
    const user = interaction.options.getUser('유저');
    if (!user) {
      await interaction.reply({ content: '유저를 반드시 선택해야 합니다.', ephemeral: true });
      return;
    }
    // 후원금 등록 (직접 일수 기입)
    if (kind === 'money') {
      const days = interaction.options.getInteger('기간');
      if (!days || days < 1) return await interaction.reply({ content: '등록 일수는 1 이상이어야 합니다.', ephemeral: true });
      const memo = interaction.options.getString('메모') || '';
      await giveDonorRole(await interaction.guild.members.fetch(user.id), days);
      let donorData = loadDonorRoles();
      donorData[user.id].adminMemo = memo;
      saveDonorRoles(donorData);
      await interaction.reply({ content: `✅ ${user}님에게 후원자 역할 ${days}일 부여 완료!`, ephemeral: true });
    } 
    // 상품 후원 등록 → 7일 자동 부여
    else if (kind === 'item') {
      const item = interaction.options.getString('상품명') || '';
      const reason = interaction.options.getString('사유') || '';
      const situation = interaction.options.getString('사용처') || '';
      const anonymous = (interaction.options.getString('익명') || '').trim().toLowerCase() === '예';
      let arr = loadItemDonations();
      arr.unshift({
        userId: user.id,
        name: anonymous ? '익명' : user.username,
        item,
        reason,
        situation,
        anonymous,
        date: new Date().toISOString()
      });
      saveItemDonations(arr);

      await giveDonorRole(await interaction.guild.members.fetch(user.id), 7);
      await interaction.reply({ content: `✅ ${user}님을 상품 후원자로 등록했고, 역할 7일 자동 부여 완료!`, ephemeral: true });
    } else {
      await interaction.reply({ content: '종류는 "후원금" 또는 "상품" 중 선택해주세요.', ephemeral: true });
    }
  }
};
