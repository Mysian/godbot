// commands/dinner.js
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dinnerList = [
  // 
  "삼겹살","곱창","막창","소갈비","LA갈비","스테이크","치킨","피자","파스타","초밥",
  "샤브샤브","감자탕","닭갈비","찜닭","해물탕","해물찜","전골","불고기","쭈꾸미볶음",
  "오삼불고기","보쌈","족발","비빔냉면","물냉면","치즈돈까스","연어스테이크","연어샐러드",
  "샐러드볼","치즈떡볶이","매운떡볶이","불닭","마라탕","마라샹궈","중식코스","양꼬치",
  "양갈비","라멘","멘보샤","탕수육","짜장면","짬뽕","고추잡채","잡채밥","볶음밥","스시",
  "라이스버거","부대찌개","김치찌개","된장찌개","순두부찌개","함박스테이크","오므라이스",
  "카레","닭도리탕","양념치킨","간장치킨","허니버터치킨","파닭","핫윙","봉추찜닭","파전",
  "빈대떡","해물파전","굴전","육전","김치전","곱창전골","버섯전골","두부김치","두루치기",
  "양념갈비","제육볶음","불백","비빔밥","고등어조림","갈치조림","삼치구이","꽁치구이",
  "조기구이","청국장","순대국밥","콩나물국밥","설렁탕","곰탕","육개장","닭개장","짬짜면",
  "차돌된장찌개","돼지갈비","모듬회","방어회","광어회","참치회","낙지볶음","오징어볶음",
  "비빔국수","국수","물회","콩국수","냉면"
];

const dataPath = path.join(__dirname, "../data/dinner-logs.json");

function loadData() {
  if (!fs.existsSync(dataPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch {
    return {};
  }
}
function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function getTodayStr() {
  const now = new Date();
  now.setHours(now.getHours() + 9); // KST
  return now.toISOString().slice(0, 10);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("저메추")
    .setDescription("저녁 메뉴를 추천해드립니다."),

  async execute(interaction) {
    const userId = interaction.user.id;
    const today = getTodayStr();
    const data = loadData();

    if (!data[today]) data[today] = {};
    if (!data[today][userId]) data[today][userId] = 0;

    if (data[today][userId] >= 3) {
      await interaction.reply({ content: "오늘은 이미 저녁메뉴 추천을 3번 모두 받으셨습니다! 내일 다시 이용해 주세요 😊", ephemeral: true });
      return;
    }

    data[today][userId] += 1;
    saveData(data);

    const food = dinnerList[Math.floor(Math.random() * dinnerList.length)];
    await interaction.reply(`🍽️ 오늘 저녁은 **${food}** 어때요? (오늘 남은 추천: ${3 - data[today][userId]}회)`);
  },
};
