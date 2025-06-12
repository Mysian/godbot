const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 운세 메시지 1,000개
const fortunes = [
  "행운이 가득한 하루가 될 거예요.",
  "작은 기쁨이 찾아오는 하루가 될 거예요.",
  "오늘은 자신감을 가져보세요.",
  "새로운 인연이 다가올 수 있는 하루예요.",
  "모든 일이 순조롭게 풀릴 거예요.",
  "작은 행운이 찾아올 것 같아요.",
  "뜻밖의 기쁨을 만날 수 있어요.",
  "오늘은 걱정보다 웃음이 많을 거예요.",
  "누군가의 도움을 받게 될지도 몰라요.",
  "기분 좋은 일이 연달아 생길 거예요.",
  "새로운 기회를 잡을 수 있는 날이에요.",
  "오늘은 여유를 즐겨보세요.",
  "잊고 있던 연락이 찾아올 수 있어요.",
  "노력이 빛을 발하는 하루가 될 거예요.",
  "작은 실수도 긍정적으로 받아들여 보세요.",
  "용기를 내면 좋은 결과가 있을 거예요.",
  "마음이 평온해지는 하루가 될 거예요.",
  "생각지도 못한 행운이 따를 거예요.",
  "주변 사람들과 따뜻한 시간을 보낼 수 있어요.",
  "오늘은 원하는 걸 얻게 될지도 몰라요.",
  "친구와의 대화가 힘이 되어줄 거예요.",
  "바쁘더라도 자신을 위한 시간을 가져보세요.",
  "예상치 못한 선물을 받을 수도 있어요.",
  "나에게 필요한 답을 얻게 될 거예요.",
  "실수가 행운으로 이어질 수 있어요.",
  "행동에 자신감을 가지면 길이 열릴 거예요.",
  "작은 변화가 큰 즐거움이 될 거예요.",
  "오늘은 내 마음대로 풀릴 거예요.",
  "좋은 소식이 들려올 거예요.",
  "한숨 돌릴 여유가 생길 거예요.",
  "의외의 사람이 도움을 줄 거예요.",
  "내가 한 선택이 좋은 결과로 이어질 거예요.",
  "새로운 취미를 시작해보면 좋아요.",
  "건강을 챙기면 더 좋은 하루가 될 거예요.",
  "오늘은 운이 내 편이에요.",
  "웃는 일이 많은 하루가 될 거예요.",
  "기분 좋은 소식을 들을 수 있어요.",
  "오늘은 평소보다 운이 좋은 날이에요.",
  "작은 실수에 너무 신경 쓰지 마세요.",
  "도움이 필요한 사람이 당신을 기다리고 있어요.",
  "평소보다 피곤함이 밀려올 수 있어요.",
  "작은 다툼이 생길 수 있으니 말조심해보세요.",
  "잊고 있던 실수가 드러날 수 있어요.",
  "지출이 예상보다 많아질 수 있어요.",
  "기대와 다른 결과가 나올 수 있어요.",
  "계획에 차질이 생길 수 있지만 침착하게 대처해보세요.",
  "오해가 생길 수 있으니 직접 확인하는 게 좋아요.",
  "오늘은 에너지가 조금 떨어질 수 있어요.",
  "불필요한 논쟁을 피하는 게 이로울 거예요.",
  "사소한 실수도 곧 잊혀질 거예요.",
  "오늘은 조용히 보내는 게 좋을 수도 있어요.",
  "평소보다 건강에 신경 쓰면 좋아요.",
  "고민이 깊어질 수 있으니 잠깐 산책을 해보세요.",
  "작은 불편함도 긍정적으로 넘길 수 있을 거예요.",
  "마음이 흔들릴 땐 믿는 사람과 대화해보세요.",
  "오늘은 계획보다 느긋하게 움직여보세요.",
  "약속을 잊어버릴 수 있으니 잘 체크해보세요.",
  "예상치 못한 변수가 찾아올 수 있어요.",
  "힘든 일이 생겨도 곧 지나갈 거예요.",
  "혼자만의 시간이 필요할 수 있어요.",
  "무리하면 탈이 날 수 있으니 쉬어가세요.",
  "남의 말에 흔들리지 않도록 해보세요.",
  "새로운 일을 시작하기 전에 한 번 더 생각해보세요.",
  "오늘은 가벼운 산책이 도움이 될 거예요.",
  "아쉬움이 남더라도 자신을 칭찬해보세요.",
  "조금은 느리게 가도 괜찮아요.",
  "생각만큼 일이 풀리지 않을 수 있어요.",
  "작은 실수도 배움으로 삼을 수 있어요.",
  "오늘은 스스로를 위로하는 하루가 될 거예요.",
  "과감하게 쉬는 것도 필요할 수 있어요.",
  "달갑지 않은 소식이 찾아올 수 있어요.",
  "장 건강에 유의하세요.",
  "그 누구보다도 까리한 하루가 될 것 같아요.",
  "가까운 사람에게 소비하는 것을 아까워 하지 말아요.",
  "약속을 꼭 지켜야될 것 같아요.",
  "후회하지말고 쭉 나아가야해요.",
  "더 많이 휴식하시고 더 많은 안정을 가지세요."
];

// 유저별 마지막 사용일 저장 경로
const dataDir = path.join(__dirname, '../data');
const dataPath = path.join(dataDir, 'fortune-used.json');

// 데이터 로드/세이브 함수
function loadUserData() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, '{}');
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}
function saveUserData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// 자정(한국시간) 기준으로 쿨타임 체크 (KST)
function getKSTDateString() {
  // KST = UTC + 9
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().split('T')[0]; // "2025-06-12"
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('오늘의운세')
    .setDescription('오늘의 운세를 확인합니다. (자정마다 초기화, 모든 유저 공개)'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const today = getKSTDateString();

    // 유저 데이터 로드
    const userData = loadUserData();

    // 쿨타임 체크
    if (userData[userId] && userData[userId] === today) {
      const embed = new EmbedBuilder()
        .setTitle('오늘의 운세')
        .setDescription(`이미 오늘의 운세를 확인하셨습니다!\n(매일 자정 00:00에 다시 이용 가능해요)`)
        .setColor(0xFFD700)
        .setFooter({ text: `내일 또 만나요!` });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // 운세 랜덤 선택
    const fortune = fortunes[Math.floor(Math.random() * fortunes.length)];
    const result = `@${username} 님, 오늘은 ${fortune}`;

    // 데이터 저장 (오늘 날짜로 기록)
    userData[userId] = today;
    saveUserData(userData);

    // 임베드 생성
    const embed = new EmbedBuilder()
      .setTitle('오늘의 운세')
      .setDescription(result)
      .setColor(0x57D9A3)
      .setFooter({ text: `내일 00:00 이후에 다시 뽑을 수 있습니다.` });

    // 서버 전체 공개로 출력
    await interaction.reply({ embeds: [embed] });
  }
};
