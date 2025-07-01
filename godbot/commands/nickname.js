// commands/nickname.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// 욕설, 금지어, 디코 위반어 필터 (간단 예시/추가 확장 가능)
const BAD_WORDS = [
  'fuck', 'shit', '바보', '병신', '시발', '좆', '섹스', '애미', '애비', '씨발', 'sex', 'discord.gg', 'http', 'www', '디스코드',
  "강간", "개걸레", "개걸레년", "개병신", "개병신새끼", "개병신아", "개병신이", "개보지", "개새끼", "개시발", "개시발놈아",
  "개시발련아", "개시발련이", "개씨발", "개씨발년이", "개씨발놈이", "개씨발련이", "개씨빨", "개좆", "개좆같네", "개좆같다",
  "개좆같이", "개찐따", "거지새끼", "나거한", "노 무라 현노", "노 지금 무라 현노", "노이기", "다이기", "딱좃노", "딱좋노",
  "땋좋노", "떡치기", "떡치실", "떡치자", "떡칠", "떡칠 사람", "떡칠래", "떡칠래요", "떡칠분", "떡칠사람", "몸파는", "몸파는년",
  "병신", "병신새끼", "보1지", "보지에", "보지에다", "보지에다가", "봊", "븅신", "비융신", "ㅅㅂ", "섹스", "섹스", "소추",
  "시발", "ㅅㅣ발", "시발놈아", "시발련아", "시발롬아", "시발새끼", "시이발", "씨바", "씨발", "ㅆㅣ발", "씨발놈아", "씨발련아",
  "씨발롬아", "씨이발", "씹년", "씹놈", "씹창", "씹창났네", "씹창이네", "아시발", "아시빨", "아씨발", "아씨빨", "엥시발",
  "오시발", "운지하노", "운지해", "운지해라", "으시발", "응디응디", "이시발", "임신", "자1지", "자지에", "자지에다", "자지에다가",
  "장애련", "장애새끼", "잦", "존나시발", "존나시빨", "존나씨발", "존나씨빨", "좆", "좆같", "좆같네", "좆같다", "좆같이", "좆거지",
  "좆도", "좆찐따", "좆창", "좆창났네", "좆창이네", "틀딱년아", "틀딱련아", "틀딱새끼야", "하시발", "하시빨", "하씨발", "하씨빨",
  "C발", "MC무현", "^^ㅂ", "^^ㅣ발", "^^ㅣ벌", "떡치기", "떡칠", "병신", "븅신", "비융신", "ㅅㅂ", "ㅅ발", "ㅅㅃ", "쉬발",
  "쉬이발", "시ㅂ", "시발", "시벌", "시부랄", "시빨", "십할", "ㅆㅃ", "씨발", "씨벌", "씨부랄", "씨불", "씨빨", "씹할", "Tlq",
  "tlqkf", "Tlqkf"
];
// 초성(ㄱ~ㅎ), 이모지, 특수문자(디코 이모지) 차단 정규식
const FORBIDDEN_REGEX = /([\u3131-\u314e])|(:[a-zA-Z0-9_]+:)|([\uD800-\uDBFF][\uDC00-\uDFFF])|([^\x00-\x7F]+)/g;

const ROLE_ID = '1273055963535904840'; // 별명 변경권
const LOG_CHANNEL_ID = '1380874052855529605';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('별명변경')
    .setDescription('별명 변경권으로 내 별명을 바꿉니다.')
    .addStringOption(option =>
      option.setName('새별명')
        .setDescription('설정할 새 별명을 입력하세요')
        .setMinLength(2)
        .setMaxLength(24)
        .setRequired(true)
    ),
  async execute(interaction) {
    const member = interaction.member;
    // 역할 확인
    if (!member.roles.cache.has(ROLE_ID)) {
      await interaction.reply({ content: '❌ 별명 변경권 역할이 있어야 이 명령어를 사용할 수 있어.', ephemeral: true });
      return;
    }

    // 새 별명
    const newNick = interaction.options.getString('새별명').trim();

    // 필터링: 금지어 포함, 초성/이모지/이모티콘 포함 시 거부
    if (BAD_WORDS.some(w => newNick.toLowerCase().includes(w))) {
      await interaction.reply({ content: '❌ 욕설, 금지어, 광고, 비속어, 디코 위반어는 사용할 수 없어.', ephemeral: true });
      return;
    }
    // 이모지, 초성, 이모티콘, 특수문자(디코 이모지) 필터
    if (FORBIDDEN_REGEX.test(newNick)) {
      await interaction.reply({ content: '❌ 이모지, 이모티콘, 초성, 특수문자는 별명에 사용할 수 없어.', ephemeral: true });
      return;
    }

    // 기존 닉네임
    const oldNick = member.nickname || member.user.username;
    if (newNick === oldNick) {
      await interaction.reply({ content: '❌ 기존 별명과 동일해. 다른 별명으로 바꿔줘!', ephemeral: true });
      return;
    }

    // 별명 변경 시도
    try {
      await member.setNickname(newNick, '[별명 변경권 사용]');
      // 역할 제거 (별명 변경권 소모)
      await member.roles.remove(ROLE_ID);

      await interaction.reply({ content: `✅ 별명이 \`${oldNick}\` → \`${newNick}\` 으로 변경됐어!\n별명 변경권이 소모됐어.`, ephemeral: true });

      // 로그 임베드 전송
      const logEmbed = new EmbedBuilder()
        .setColor(0x76C7F4)
        .setTitle('별명 변경 로그')
        .setDescription(`> **유저:** <@${member.id}> (${member.user.tag})\n> **별명:** \`${oldNick}\` → \`${newNick}\`\n> **사용 아이템:** <@&${ROLE_ID}>`)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel && logChannel.isTextBased()) {
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: '❌ 별명 변경에 실패했어. (관리자에게 문의)', ephemeral: true });
    }
  }
};
