// commands/nickname-change.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { getBE, addBE } = require('./be-util.js');
const profilesPath = path.join(__dirname, '../data/profiles.json');
const NICKNAME_BE_COST = 500000;
const LOG_CHANNEL_ID = '1380874052855529605'; // 관리자 로그 채널

async function readProfiles() {
  if (!fs.existsSync(profilesPath)) return {};
  const release = await lockfile.lock(profilesPath, { retries: 3 });
  const data = JSON.parse(fs.readFileSync(profilesPath));
  await release();
  return data;
}

function isValidNickname(nickname) {
  const cho = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const jung = 'ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ';
  if (!/^[\w가-힣]+$/.test(nickname)) return false;
  if ([...nickname].every(ch => cho.includes(ch) || jung.includes(ch))) return false;
  if ([...nickname].some(ch => cho.includes(ch) || jung.includes(ch))) {
    for (let i = 0; i < nickname.length; i++) {
      const ch = nickname[i];
      if (!(/[가-힣]/.test(ch) || /[a-zA-Z0-9]/.test(ch))) {
        return false;
      }
    }
  }
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('닉네임변경')
    .setDescription('파랑 정수(BE) 500,000을 사용하여 서버 내 닉네임을 변경합니다.')
    .addStringOption(opt =>
      opt.setName('닉네임')
        .setDescription('변경할 닉네임')
        .setRequired(true)
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    const member = interaction.member;
    const newNick = interaction.options.getString('닉네임').trim();
    const oldNick = member.nickname || member.user.username;

    // 1. 프로필 등록 여부 확인
    const profiles = await readProfiles();
    if (!profiles[userId]) {
      return interaction.reply({ content: '먼저 `/프로필등록`으로 프로필을 등록해야 닉네임 변경이 가능합니다!', ephemeral: true });
    }

    // 2. 파랑 정수(BE) 확인
    const userBE = getBE(userId);
    if (userBE < NICKNAME_BE_COST) {
      return interaction.reply({
        content: `닉네임 변경에는 ${NICKNAME_BE_COST.toLocaleString()} BE가 필요합니다!\n현재 보유: ${userBE.toLocaleString()} BE`,
        ephemeral: true
      });
    }

    // 3. 닉네임 유효성 검사
    if (!isValidNickname(newNick)) {
      return interaction.reply({
        content: '닉네임에는 특수문자, 이모티콘, 초성/자음/모음만 조합된 형태가 포함될 수 없습니다.\n한글/영문/숫자만 허용됩니다.',
        ephemeral: true
      });
    }

    // 4. 서버 내 닉네임 중복 불가 (캐시 최신화)
    const guild = interaction.guild;
    await guild.members.fetch();
    const exists = guild.members.cache.some(member =>
      member.nickname === newNick || (member.user && member.user.username === newNick)
    );
    if (exists) {
      return interaction.reply({
        content: '이미 해당 닉네임을 사용하는 유저가 있습니다. 다른 닉네임을 입력해주세요.',
        ephemeral: true
      });
    }

    // 5. 닉네임 변경 실행
    try {
      await member.setNickname(newNick, '닉네임 변경 명령어 사용');
      await addBE(userId, -NICKNAME_BE_COST, '닉네임 변경');
      await interaction.reply({
        content: `✅ 닉네임이 \`${newNick}\`(으)로 변경되었습니다! ( -${NICKNAME_BE_COST.toLocaleString()} BE )`,
        ephemeral: true
      });

      // 6. 로그 채널에 변경 기록 임베드 전송
      const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor(0x3057e0)
          .setTitle('📝 닉네임 변경 로그')
          .setDescription(`<@${userId}> 닉네임 변경 기록`)
          .addFields(
            { name: '변경 전', value: `\`${oldNick}\``, inline: true },
            { name: '변경 후', value: `\`${newNick}\``, inline: true },
            { name: '처리자', value: `<@${userId}> (\`${userId}\`)`, inline: false },
            { name: '일시', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
          )
          .setFooter({ text: `닉네임 변경 시 BE 차감: ${NICKNAME_BE_COST.toLocaleString()} BE` });

        await logChannel.send({ embeds: [embed] });
      }

    } catch (err) {
      return interaction.reply({
        content: '닉네임 변경에 실패했습니다. 봇 권한을 확인해주세요.',
        ephemeral: true
      });
    }
  },
};
