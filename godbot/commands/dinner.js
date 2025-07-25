// commands/dinner.js
const { SlashCommandBuilder } = require("discord.js");

const dinnerList = [
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
  "비빔국수","국수","물회","콩국수","냉면", "닭발", "무뼈닭발", "닭목살구이", "뼈없는닭갈비", "치즈불닭", "닭봉구이", "닭날개구이", "훈제오리", "오리주물럭", "오리불고기",
"참치마요덮밥", "소고기덮밥", "규동", "차슈덮밥", "텐동", "에비동", "유부초밥", "모둠튀김", "야끼소바", "오코노미야끼",
"타코야끼", "텐무스", "야끼우동", "카이센동", "규카츠", "우니덮밥", "냉우동", "멘치까스", "감바스", "스페인식 빠에야",
"이베리코목살", "바비큐폭립", "쉬림프박스", "크림새우", "깐풍기", "깐쇼새우", "유린기", "마파두부", "샤오롱바오", "훠궈",
"토마호크스테이크", "안심스테이크", "채끝스테이크", "T본스테이크", "립아이스테이크", "함박오므라이스", "크림파스타", "로제파스타", "봉골레파스타", "알리오올리오",
"아마트리치아나", "까르보나라", "명란파스타", "트러플파스타", "스테이크샐러드", "바질페스토샐러드", "고르곤졸라피자", "루꼴라피자", "콰트로치즈피자", "시카고피자",
"딥디쉬피자", "불고기피자", "페퍼로니피자", "포테이토피자", "갈릭디핑피자", "치즈스틱", "모짜렐라핫도그", "콘치즈", "떡갈비", "소불고기버거",
"치킨버거", "새우버거", "더블치즈버거", "베이컨치즈버거", "햄치즈토스트", "에그드랍", "프렌치토스트", "감자튀김", "고구마튀김", "케이준감자",
"치즈볼", "김말이튀김", "오징어튀김", "새우튀김", "매운오징어볶음밥", "제육덮밥", "김치볶음밥", "낙지덮밥", "오징어덮밥", "날치알볶음밥",
"우삼겹덮밥", "간장계란밥", "토마토리조또", "새우크림리조또", "해산물빠네", "치즈리조또", "전복죽", "참치죽", "야채죽", "누룽지탕", "소갈비찜", "묵은지찜", "묵은지김치찜",
"차돌박이전골", "낙곱새", "곱도리탕", "닭한마리", "닭칼국수", "해장국", "뼈해장국",
"도가니탕", "꼬리곰탕", "소머리국밥", "순댓국", "내장탕", "알탕", "북어국", "황태해장국", "시래기국", "무국",
"계란국", "떡국", "만둣국", "참치김치찌개", "고등어김치조림", "꽁치김치조림", "코다리조림", "아구찜", "홍어찜",
"홍어삼합", "참게매운탕", "민물새우매운탕", "추어탕", "장어구이", "장어덮밥", "장어탕", "연포탕", "문어숙회", "문어라면",
"연어포케", "참치포케", "회덮밥", "해초비빔밥", "명란비빔밥", "명란덮밥", "새우장덮밥", "간장새우덮밥", "양념게장비빔밥", "꽃게탕",
"게살죽", "게살오믈렛", "게살스프", "게살볶음밥", "고추장불고기", "훈제삼겹살", "목살스테이크", "항정살구이", "가브리살구이", "등심스테이크",
"차돌박이덮밥", "차돌된장비빔밥", "치즈계란말이", "스팸계란덮밥", "스팸마요", "참치김밥", "소고기김밥", "멸치김밥", "돈까스김밥", "제육김밥",
"매운치킨마요", "간장불고기마요", "햄마요", "명란마요", "닭강정", "간장닭강정", "매운닭강정", "후라이드순살", "양념순살", "크리미양념치킨",
"불향치킨", "로제떡볶이", "차돌떡볶이", "로제불닭", "매운비빔우동", "차돌비빔국수", "냉비빔면", "불쫄면", "비빔메밀", "온메밀", "비빔만두", "찐만두", "군만두", "물만두", "고기만두", "김치만두",
"갈비만두", "새우만두", "튀김만두", "만두전골",
"쫄면", "비빔쫄면", "라면사리전골", "치즈라면", "부대라면", "짜계치", "차돌라면", "파라면", "김치라면", "떡라면",
"라면볶이", "참치비빔면", "냉라면", "오징어비빔면", "명란비빔면", "소고기무국", "소고기미역국", "된장무국", "달걀찜", "게란장",
"명란계란찜", "감자조림", "연근조림", "우엉조림", "메추리알장조림", "소불고기", "버섯불고기", "닭불고기", "양송이스프", "옥수수스프",
"브로콜리볶음", "버섯볶음", "마늘쫑볶음", "오징어채볶음", "진미채볶음", "멸치볶음", "계란볶음밥", "새우볶음밥", "치킨볶음밥", "햄볶음밥",
"참치볶음밥", "굴소스볶음밥", "잡채", "잡채밥", "유산슬밥", "깐풍육", "볶음짬뽕", "삼선짬뽕", "삼선우동", "고추짬뽕",
"해물짬뽕밥", "짜장밥", "쟁반짜장", "유니짜장", "기스면", "삼선라면", "치즈우동", "카레우동", "볶음우동", "해물우동",
"로제우동", "참깨칼국수", "바지락칼국수", "매운칼국수", "들깨칼국수", "닭칼국수", "수제비", "감자수제비", "해물수제비", "들깨수제비",
"미역국수", "열무국수", "잔치국수", "쌀국수", "분짜", "반쎄오", "팟타이", "카오팟", "똠얌꿍", "마라볶음면"
  
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("저메추")
    .setDescription("저녁 메뉴를 추천해드립니다."),

  async execute(interaction) {
    const food = dinnerList[Math.floor(Math.random() * dinnerList.length)];
    await interaction.reply({
      content: `🍽️ 오늘 저녁은 **${food}** 어때요?`,
      ephemeral: true
    });
  }
};
