const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DONOR_ROLE = '1397076919127900171';

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
  "더 많이 휴식하시고 더 많은 안정을 가지세요.",
  "오늘 외출하실 일이 있으시다면 하얀색 옷을 입어보세요.",
  "오늘은 특별할 것 없는 평범한 하루가 될 거예요.",
"누군가의 한마디에 기분이 달라질 수 있어요.",
"작은 걱정이 머릿속을 맴돌 수 있어요.",
"오래된 고민이 다시 떠오를 수 있어요.",
"새로운 소식이 들릴 듯 말 듯 애매한 하루예요.",
"주변의 분위기에 휩쓸리지 않도록 조심하세요.",
"자신도 모르게 실수할 수 있으니 천천히 움직여보세요.",
"예상하지 못한 변화가 찾아올 수 있어요.",
"아무 일도 일어나지 않는 조용한 하루일 수 있어요.",
"고민 끝에 내린 결정이 마음에 남을 수 있어요.",
"오늘은 시간을 허투루 보내지 않도록 해보세요.",
"바쁘지 않더라도 스스로를 챙기는 게 중요해요.",
"무리하게 움직이면 금방 피로가 찾아올 수 있어요.",
"기대와 다르게 하루가 흘러갈 수 있어요.",
"잠시 멈춰서 자신을 돌아보는 시간을 가져보세요.",
"주변의 작은 변화에 민감해질 수 있어요.",
"친구와의 대화에서 새로운 생각을 얻을 수 있어요.",
"가벼운 산책이 마음을 편하게 해줄 거예요.",
"예상하지 못한 만남이 기다리고 있을지도 몰라요.",
"잠깐의 실수가 큰 교훈이 될 수 있어요.",
"혼자만의 시간을 보내며 생각을 정리해보세요.",
"오늘은 하고 싶은 일보다 해야 할 일이 많을 수 있어요.",
"좋지 않은 소식이 들려와도 금방 지나갈 거예요.",
"마음의 여유를 가지면 뜻밖의 즐거움이 찾아올 수 있어요.",
"잠깐의 휴식이 큰 힘이 될 거예요.",
"무심코 지나친 일이 나중에 중요한 의미가 될 수 있어요.",
"생각지도 못한 곳에서 기회를 발견할 수 있어요.",
"작은 친절이 큰 변화를 만들어낼 수 있어요.",
"아쉬움이 남더라도 스스로를 칭찬해보세요.",
"실패도 또 다른 시작이 될 수 있어요.",
"오늘은 조용히 흐르는 하루가 될 수 있어요.",
"오래된 인연에게서 연락이 올지도 몰라요.",
"무언가를 놓치고 지나갈 수 있으니 천천히 살펴보세요.",
"작은 실수가 오히려 좋은 방향으로 이어질 수 있어요.",
"걱정이 많아지는 날일 수 있지만 곧 가라앉을 거예요.",
"오늘은 혼자 있는 시간이 더 편하게 느껴질 수 있어요.",
"새로운 시도를 망설이게 될 수 있어요.",
"평소와 다르게 주변의 관심을 많이 받게 될 수 있어요.",
"의외의 제안이 들어올 수 있으니 귀 기울여보세요.",
"당장은 답이 없어 보여도 시간이 해결해줄 거예요.",
"마음이 가는 대로 행동하면 의외의 성과가 있을 거예요.",
"예상보다 결과가 늦게 나타날 수 있어요.",
"누군가의 말에 상처를 받을 수 있으니 한 번 더 생각해보세요.",
"오랜만에 옛 추억이 떠오를 수 있는 하루예요.",
"계획했던 일이 어긋날 수 있지만 새로운 기회를 만날 수도 있어요.",
"평소보다 지출이 많아질 수 있으니 주의하세요.",
"마음 한켠이 허전해질 수 있어요.",
"잠시 멈춰가는 것도 나쁘지 않아요.",
"생각보다 일이 쉽게 풀리지 않을 수 있어요.",
"기다렸던 답변이 늦어질 수 있으니 여유를 가져보세요.",
"별 일 없던 하루가 나중엔 소중한 기억이 될 수 있어요.",
"주변 사람이 내게 기댈 수 있으니 마음의 문을 열어보세요.",
"기대하지 않았던 곳에서 위로를 받을 수 있어요.",
"작은 오해가 생길 수 있으니 솔직하게 말해보세요.",
"건강에 신경 쓰면 기분이 더 좋아질 거예요.",
"무언가 새로운 일이 시작될 조짐이 보여요.",
"마음이 불안할 땐 가까운 사람과 대화해보세요.",
"변화가 두려워도 한 걸음 내디뎌보세요.",
"생각지도 못한 곳에서 행운이 찾아올 수 있어요.",
"평범함 속에서 의미를 찾아보는 하루가 될 거예요.",
"오늘은 익숙한 것들에 새로움을 느낄 수 있어요.",
"예상과 달리 소소한 기쁨이 쌓이는 하루가 될 거예요.",
"혼란스러운 소식이 들어와도 흔들리지 마세요.",
"무심코 한 말이 누군가에게 큰 위로가 될 수 있어요.",
"계획했던 일이 예상보다 빨리 끝날 수 있어요.",
"이유 없이 마음이 울적할 수 있으니 자신을 돌봐주세요.",
"평소와 달리 집중이 잘 안 될 수 있어요.",
"주변에서 도와주는 손길이 늘어날 수 있어요.",
"새로운 일에 도전할 용기가 생길 거예요.",
"작은 다툼이 생길 수 있지만 금방 풀릴 거예요.",
"잠시 혼자 걷는 산책이 생각을 정리하는 데 도움이 될 거예요.",
"별다른 일 없이 조용히 지나갈 수도 있어요.",
"예상치 못한 기회가 찾아오면 망설이지 말고 잡아보세요.",
"사소한 걱정이 쌓이면 잠깐 쉬어가도 괜찮아요.",
"가끔은 멍하니 시간을 보내는 것도 필요해요.",
"오늘은 남의 이야기에 휘둘리지 않도록 해보세요.",
"기대와 달리 하루가 빠르게 지나갈 수 있어요.",
"특별히 기억에 남지 않는 하루가 될 수 있어요.",
"작은 실망도 시간이 지나면 잊혀질 거예요.",
"조용한 음악이 위로가 되는 하루가 될 수 있어요.",
"누군가의 부탁을 거절하기 어려운 날이 될 수 있어요.",
"마음이 불안하다면 잠깐 바깥 공기를 쐬어보세요.",
"해야 할 일이 많아 조금은 바쁘게 느껴질 수 있어요.",
"별다른 일 없이 지나가도 그 나름대로 의미가 있어요.",
"평소보다 말수가 줄어들 수 있으니, 스스로를 이해해주세요.",
"오늘은 사소한 것에 감사하는 마음을 가져보세요.",
"기대하지 않았던 칭찬을 들을 수 있어요.",
"작은 문제가 생겨도 차분히 해결할 수 있을 거예요.",
"고민이 깊어져도 언젠가는 해결의 실마리가 보일 거예요.",
"누군가의 따뜻한 말 한마디에 힘을 얻을 수 있어요.",
"별일 없어 보이지만 하루가 끝나면 뿌듯함이 남을 거예요.",
"계획이 틀어져도 당황하지 말고 여유를 가져보세요.",
"누군가의 작은 부탁이 하루를 바꿔놓을 수 있어요.",
"마음에 들지 않는 일이 있어도 금방 잊혀질 거예요.",
"하루 종일 무기력함이 느껴질 수 있어요.",
"바쁘지 않아도 자신만의 시간을 소중히 여겨보세요.",
"오늘은 새로운 것을 배우기에 좋은 날이에요.",
"작은 용기가 큰 변화를 만들 수 있어요.",
"예상보다 빨리 일이 해결될 수 있어요.",
"조용한 하루지만 마음속엔 다양한 감정이 오갈 수 있어요.",
"오늘은 누군가의 고민을 들어주는 역할을 하게 될 수 있어요.",
"기다리던 소식이 오늘은 오지 않을 수도 있어요.",
"기대하지 않았던 곳에서 좋은 일이 생길 수 있어요.",
"평소와 다르게 감정의 기복이 심해질 수 있어요.",
"자신의 실수에 너무 신경 쓰지 마세요.",
"어떤 문제든 시간이 지나면 해결될 거예요.",
"사소한 다툼이 생기더라도 금방 풀릴 수 있어요.",
"오늘은 과거의 후회에서 벗어나기에 좋은 날이에요.",
"누군가와의 우연한 만남이 의미 있는 인연이 될 수 있어요.",
"별다른 사건 없이 지나가도 그 나름대로 의미가 있어요.",
"오늘은 평소보다 감정이 섬세해질 수 있어요.",
"기대하지 않은 곳에서 도움의 손길이 찾아올 수 있어요.",
"어려운 일이 생기면 주변에 도움을 요청해보세요.",
"무의미해 보이는 일도 나중엔 도움이 될 수 있어요.",
"작은 변화가 오히려 큰 기쁨이 될 수 있어요.",
"오늘은 자신만의 취미에 몰두해보면 좋아요.",
"예상치 못한 상황이 생겨도 당황하지 마세요.",
"오늘 하루는 스스로를 위한 선물을 해보세요.",
"사소한 실수는 금방 잊혀질 거예요.",
"오늘은 자신을 믿는 게 가장 중요할 거예요.",
"생각보다 조용한 하루가 펼쳐질 수 있어요.",
"오늘은 익숙한 일이 낯설게 느껴질 수 있어요.",
"누군가의 칭찬이 의외로 크게 와닿을 수 있어요.",
"기대와 현실이 어긋날 수 있지만 실망은 금방 사라질 거예요.",
"모르는 번호로 연락이 올 수도 있어요.",
"오늘은 스스로에게 솔직해지는 하루가 될 거예요.",
"작은 일에 집착하지 않으려 노력해보세요.",
"무언가를 놓치고 있다는 기분이 들 수 있어요.",
"평소에 하지 않던 실수를 할 수도 있어요.",
"마음이 복잡하면 잠시 멈춰서 호흡을 가다듬어보세요.",
"누군가에게 서운한 감정을 느낄 수 있지만 곧 풀릴 거예요.",
"오늘은 집 안 정리에 신경 써보면 좋은 변화가 생길 수 있어요.",
"별다른 이유 없이 지치거나 피곤할 수 있어요.",
"기다리던 약속이 갑자기 취소될 수 있어요.",
"과거의 기억이 유독 많이 떠오르는 날일 수 있어요.",
"작은 실패가 새로운 도전의 시작이 될 수 있어요.",
"오늘은 부드러운 음악이 위로가 되어줄 거예요.",
"누군가의 말 한마디가 큰 힘이 될 수 있어요.",
"감정의 기복이 심해져서 스스로도 놀랄 수 있어요.",
"오늘은 의외로 운이 따르는 순간이 있을 거예요.",
"어려웠던 일이 생각보다 쉽게 해결될 수 있어요.",
"기분이 가라앉을 땐 잠깐 산책을 해보세요.",
"별거 아닌 일에 웃음이 터질 수 있는 하루예요.",
"일상의 소소함에서 행복을 찾게 될 거예요.",
"예상치 못한 선물이 찾아올 수도 있어요.",
"마음 한 구석이 따뜻해지는 순간이 올 거예요.",
"오늘은 계획에 너무 얽매이지 않아도 괜찮아요.",
"작은 다툼이 관계를 더 깊게 만들어줄 수 있어요.",
"자신도 모르게 좋은 선택을 하게 될 수 있어요.",
"오늘은 자기 자신에게 격려의 말을 건네보세요.",
"예상치 못한 반가운 소식을 들을 수 있어요.",
"오늘은 스스로를 돌아보는 데 시간이 필요할 수 있어요.",
"작은 기대가 현실이 될 수도 있는 하루예요.",
"마음이 가벼워지는 일을 해보면 좋아요.",
"아무 일 없는 평범함이 오히려 위로가 될 수 있어요.",
"오늘은 주위를 잘 살펴보면 숨은 기회를 발견할 수 있어요.",
"소소한 행복이 쌓여 하루가 따뜻해질 거예요.",
"친구의 한마디에 용기를 얻을 수 있어요.",
"누군가에게 고마운 마음을 표현해보면 좋은 일이 생길 거예요.",
"작은 불편함도 금방 사라질 수 있어요.",
"오늘은 일찍 잠자리에 드는 게 도움이 될 거예요.",
"계획한 일이 차질 없이 잘 진행될 거예요.",
"잠시 멈춰서 주변을 돌아보면 새로운 것을 발견할 수 있어요.",
"오늘은 내 생각과 다르게 일이 흘러갈 수 있어요.",
"기대하지 않았던 칭찬을 받을 수 있어요.",
"기분 좋은 소식이 전해져올 수 있어요.",
"마음이 흔들릴 때는 좋아하는 음악을 들어보세요.",
"오늘은 예상보다 할 일이 많아질 수 있어요.",
"조용히 생각을 정리하는 시간이 필요할 수 있어요.",
"누군가의 실수에 너그러워지면 관계가 더 좋아질 거예요.",
"오늘은 자신을 위한 작은 선물을 준비해보세요.",
"한 번 더 확인하면 실수를 줄일 수 있어요.",
"마음이 답답하다면 가까운 곳이라도 잠시 다녀와보세요.",
"오늘은 하고 싶던 일을 시작하기 좋은 날이에요.",
"계획에 너무 얽매이지 않고 유연하게 대처해보세요.",
"작은 변화가 큰 기쁨으로 다가올 수 있어요.",
"오늘은 새로운 취미를 시작해보면 즐거움이 찾아올 거예요.",
"별거 아닌 일로 웃음 짓게 되는 순간이 있을 거예요.",
"조용한 카페나 공원에서 시간을 보내면 좋은 영감을 받을 수 있어요.",
"마음의 짐을 잠시 내려놓는 것도 괜찮아요.",
"아무 생각 없이 보내는 시간이 오히려 도움이 될 수 있어요.",
"기대와 달리 새로운 소식이 들려오지 않을 수 있어요.",
"오늘은 가족과 대화를 나누는 것이 힘이 될 거예요.",
"사소한 오해가 커지지 않게 신경 써보세요.",
"의외의 곳에서 작은 행복을 찾을 수 있어요.",
"마음이 힘들 땐 스스로를 다독여보세요.",
"누군가의 조언이 의외로 큰 도움이 될 수 있어요.",
"오늘은 계획에 없던 일이 생길 수 있어요.",
"평소에 하지 않던 일을 해보면 색다른 기분을 느낄 수 있어요.",
"실패해도 금방 다시 일어설 수 있을 거예요.",
"오늘은 하고 싶은 말을 솔직하게 전해보세요.",
"무리하지 않고 자신의 페이스를 지키면 좋은 하루가 될 거예요.",
"마음이 불안할 때는 잠시 쉬어가는 것도 좋아요.",
"별 생각 없이 지나친 풍경이 기억에 남을 수 있어요.",
"예상치 못한 만남이 하루를 특별하게 만들 수 있어요.",
"오늘은 누구보다 자신에게 관대해져도 괜찮아요.",
"감정이 복잡할 때는 글로 마음을 정리해보세요.",
"조용한 공간에서 혼자만의 시간을 보내보세요.",
"계획보다 즉흥적으로 움직여도 좋은 결과가 있을 수 있어요.",
"자신의 감정을 숨기지 말고 솔직하게 표현해보세요.",
"생각보다 시간이 빨리 지나갈 수 있어요.",
"오늘은 나만의 작은 목표를 정해보면 좋아요.",
"다른 사람과 비교하지 말고 자신의 길을 걸어보세요.",
"새로운 정보가 들어올 수 있는 하루예요.",
"작은 일에도 감사하는 마음을 가져보세요.",
"오늘은 책을 읽거나 영화를 보며 여유를 가져보세요.",
"예상과 다른 결과가 나와도 당황하지 마세요.",
"누군가의 실수를 이해해주면 관계가 더 깊어질 거예요.",
"마음이 흔들려도 중심을 잃지 않도록 해보세요.",
"오늘 하루가 길게 느껴질 수 있지만 그만큼 많은 것을 얻을 수 있어요.",
"오늘은 예상하지 못한 상황에 마주칠 수 있어요.",
"가끔은 과감한 결정이 좋은 결과를 가져다줄 수 있어요.",
"마음의 짐이 조금은 가벼워질 수 있는 하루예요.",
"가까운 사람의 작은 배려가 힘이 되어줄 거예요.",
"조용히 혼자 있는 시간이 필요할 수 있어요.",
"소소한 일이 기분을 좌우할 수 있는 날이에요.",
"누군가의 진심 어린 말에 감동받을 수 있어요.",
"오늘은 약간의 변덕이 생길 수 있어요.",
"생각보다 일이 쉽게 풀릴 수 있어요.",
"작은 실수에도 자신을 너무 탓하지 마세요.",
"마음속에 쌓인 감정을 털어놓을 기회가 생길 수 있어요.",
"평소보다 집중력이 떨어질 수 있으니 잠시 휴식이 필요해요.",
"오늘은 새로운 만남이 기대되는 하루예요.",
"일상이 반복되어 지루함을 느낄 수 있어요.",
"의외의 소식에 놀라게 될 수도 있어요.",
"고민이 해결될 실마리를 찾게 될 수 있어요.",
"오늘은 누군가와의 오해를 풀기에 좋은 날이에요.",
"기대하지 않았던 응원이 큰 힘이 될 거예요.",
"가벼운 운동이 컨디션을 올려줄 수 있어요.",
"작은 변화가 새로운 시작을 의미할 수 있어요.",
"마음이 흔들릴 땐 잠시 멈춰서 생각해보세요.",
"오늘은 그저 쉬어가도 괜찮은 하루예요.",
"누군가의 따뜻한 미소가 기억에 남을 수 있어요.",
"생각보다 감정이 예민해질 수 있으니 조심하세요.",
"작은 관심이 큰 변화를 만들어낼 수 있어요.",
"오늘은 오래된 물건을 정리해보면 좋은 일이 생길 거예요.",
"기대와 다르게 하루가 흘러가도 의미가 남을 거예요.",
"의외로 바쁜 하루가 될 수 있으니 체력을 잘 관리하세요.",
"마음속에 남아 있던 고민이 조금은 정리될 수 있어요.",
"오늘은 새로운 소식에 귀를 기울여보세요.",
"오늘은 우연히 본 밈 하나가 기분을 바꿔줄 수 있어요.",
"갑자기 길에서 아는 사람을 마주칠 확률이 높아요.",
"택배가 오늘 도착할지 모르는 스릴을 즐겨보세요.",
"특별할 것 없던 하루가 한 통의 문자로 바뀔 수 있어요.",
"지나가던 고양이와 눈이 마주치면 행운이 올 수도 있어요.",
"평소에는 잘 안 먹던 음식이 갑자기 땡길 수 있어요.",
"오늘은 하늘을 한 번 더 쳐다보면 새로운 생각이 떠오를 거예요.",
"길을 걷다 마주치는 번호판 숫자에 의미를 두게 될지도 몰라요.",
"우산 없이 나갔는데 비가 올 확률이 조금 있어요.",
"평소엔 관심 없던 노래가 마음에 들어올 수 있어요.",
"무작정 버스를 탔다가 색다른 풍경을 만날 수 있어요.",
"냉장고 문을 열다가 잊고 있던 간식을 발견할 수 있어요.",
"의외의 사람에게서 연락이 와서 깜짝 놀랄 수 있어요.",
"오늘은 엘리베이터가 1층에 딱 맞춰 와줄지도 몰라요.",
"코너를 돌다 우연히 떨어진 동전을 발견할 수도 있어요.",
"기다리던 택배가 반나절 먼저 도착하는 기적이 있을 수 있어요.",
"오늘은 인터넷 검색 기록이 쓸데없이 유용할 수 있어요.",
"책상 밑에 있던 오래된 영수증이 추억을 불러올 수 있어요.",
"옷장 속 깊숙이 넣어둔 옷이 갑자기 입고 싶어질 수 있어요.",
"알람보다 1분 먼저 눈이 떠질 수 있는 아슬아슬함을 느껴보세요.",
"지하철에서 우연히 좋아하는 노래가 들릴 확률이 높아요.",
"오늘은 초록불이 연달아 켜지는 행운이 따를지도 몰라요.",
"카페에서 주문한 음료가 예상보다 더 맛있게 느껴질 수 있어요.",
"별 생각 없이 꺼낸 책 속에서 오래전 쪽지를 발견할 수 있어요.",
"오늘은 모르는 사람의 친절이 기분을 좋게 할 수 있어요.",
"평소와 다른 길로 돌아가면 새로운 풍경이 기다릴 수 있어요.",
"집에 가는 길에 하늘을 보면 구름 모양이 특별하게 보일 거예요.",
"모바일 게임에서 드물게 레어 아이템이 뜰 확률이 있어요.",
"카톡 이모티콘을 아무 이유 없이 자주 쓰게 될 수 있어요.",
"스스로에게 오늘을 칭찬하는 메시지를 한번 보내보세요.",
"오늘은 신호등이 꼭 내 앞에서만 빨간불일 확률이 높아요.",
"갑자기 듣는 노래 가사가 오늘의 기분을 딱 맞출 수 있어요.",
"침대에 누웠다가 불 끄는 걸 깜빡하고 다시 일어날 수도 있어요.",
"오늘은 편의점 신상이 눈에 확 들어올 수 있어요.",
"출근길에 엘리베이터 문이 딱 닫히는 타이밍을 만날 수 있어요.",
"가방에서 잃어버린 줄 알았던 이어폰이 나타날 수 있어요.",
"주머니에서 생각지 못한 동전이 나오는 기쁨을 느껴보세요.",
"오늘은 휴대폰 배터리가 평소보다 빨리 닳을 수 있어요.",
"친구가 보낸 이상한 이모티콘이 하루종일 머릿속에 맴돌 수 있어요.",
"급하게 나왔는데 양말이 짝짝이일 수도 있어요.",
"오늘은 길에서 개 한 마리만 봐도 기분이 좋아질 수 있어요.",
"카페에서 주문한 음료에 얼음이 유난히 많이 들어갈 수 있어요.",
"달력에 적어둔 일정을 까먹고 당황할 수 있으니 한 번 더 확인해보세요.",
"택배 기사님이 벨을 누르기 전에 눈치껏 현관문을 열 수 있어요.",
"오늘은 누군가 내 이름을 잘못 부를 확률이 있습니다.",
"지하철에서 자리가 날 듯 말 듯 아슬아슬하게 설 수 있어요.",
"먹고 싶은 음식 사진이 SNS에 자꾸 뜰 수 있어요.",
"TV 리모컨이 갑자기 침대 밑에서 발견될 수 있어요.",
"비 오는 날 우산을 안 가져갔는데 운 좋게 비를 피할 수도 있어요.",
"편의점 삼각김밥이 평소보다 더 맛있게 느껴질 거예요.",
"잠들기 직전에 갑자기 할 일이 생각날 수 있어요.",
"엘리베이터에 타려 했는데 가득 차서 다음 차를 기다릴 수 있어요.",
"오늘은 마트에서 1+1 상품을 우연히 발견할 수도 있어요.",
"사탕을 꺼냈는데 두 개가 붙어 나올 수도 있어요.",
"책상 위 먼지가 오늘따라 유난히 잘 보일 수 있어요.",
"화장실에 들어가자마자 전화가 올 확률이 높아요.",
"길을 가다 모르는 강아지가 따라올 수 있어요.",
"문득 지나가는 바람이 기분을 새롭게 만들어줄 거예요.",
"배달 음식이 예상보다 빨리 올 수도 있어요.",
"오늘은 꼭 필요했던 물건이 세일하는 걸 발견할 수 있어요.",
"갑자기 뒷주머니에서 만 원짜리가 발견될 수 있어요.",
"오늘은 양치하다 치약이 끝까지 안 나올 수 있어요.",
"버스에서 창밖 보다가 놓칠 뻔한 정류장에 딱 내릴 수 있어요.",
"아침에 거울 보다가 의외로 마음에 드는 머리스타일을 발견할 수 있어요.",
"즐겨 찾던 유튜브 채널이 오늘따라 재미없게 느껴질 수 있어요.",
"귀찮아서 미뤄둔 빨래가 갑자기 생각날 수 있어요.",
"스팸 메시지 중에 정말 필요한 정보가 섞여 있을 수 있어요.",
"오늘은 새 신발을 신었다가 발이 조금 아플 수 있어요.",
"우유를 마시려다 유통기한을 두 번 확인할 수도 있어요.",
"방문 앞에 배달음식이 내 예상보다 빨리 도착할 수 있어요.",
"계산대에서 동전을 하나 더 꺼내느라 어색한 침묵이 흐를 수 있어요.",
"지하철에서 갑자기 옆 사람이 자리 바꿔달라고 할 수 있어요.",
"달달한 간식을 참으려 했지만 결국 먹게 될 수 있어요.",
"불 꺼진 방에서 휴대폰 밝기에 눈이 잠깐 아플 수 있어요.",
"소중히 아껴둔 과자가 사라진 이유를 한참 고민할 수 있어요.",
"오늘은 친구가 내 옛날 사진을 단톡방에 올릴 확률이 있어요.",
"엘리베이터 안에서 어색한 침묵을 경험할 수 있어요.",
"가끔은 택배 박스만 쌓이고 내용물은 생각보다 작을 수 있어요.",
"길을 걷다 우연히 초록불이 한 번에 이어질 수 있어요.",
"오늘은 휴대폰 메모장에 쓴 글을 다시 읽어보고 웃을 수 있어요.",
"아침에 일어나서 알람을 껐는지 기억이 안 날 수 있어요.",
"정수기 물 받을 때 컵을 가득 채우는 데 성공할 수 있어요.",
"카페에서 기다렸던 자리 딱 하나가 나를 위해 남아있을 수도 있어요.",
"오늘은 자판기에서 음료가 두 개 나오는 꿈같은 일이 생길 수 있어요.",
"갑자기 비가 오지만, 이상하게 기분은 괜찮을 수 있어요.",
"이어폰을 찾다가 서랍 정리를 하게 될 수도 있어요.",
"오늘따라 아무 생각 없이 걷는 길이 더 짧게 느껴질 거예요.",
"집에 들어오자마자 휴대폰 충전을 까먹고 다시 나올 수 있어요.",
"방 청소하다 어릴 적 물건을 발견하고 잠시 추억에 잠길 수 있어요.",
"배달 앱에서 예상보다 할인이 많이 들어갈 수 있어요.",
"오늘은 주변의 소식에 귀를 기울이면 좋은 일이 생길 수 있어요.",
"새로운 도전에는 약간의 불안이 따를 수 있어요.",
"잠시 멈춰서 자신의 마음을 돌아보는 게 도움이 될 거예요.",
"지나친 기대는 실망으로 이어질 수 있으니 마음을 가볍게 가져보세요.",
"기다렸던 연락이 오지 않아 답답함을 느낄 수 있어요.",
"작은 실수가 오히려 주변과의 관계를 돈독하게 해줄 거예요.",
"계획에 없던 만남이 하루를 바꿔줄지도 몰라요.",
"오늘은 예상과 다른 흐름에 당황할 수 있어요.",
"주변의 기대에 부담을 느낄 수 있으니 자신의 속도를 지켜보세요.",
"갑작스러운 지출이 생길 수 있으니 주의하세요.",
"마음먹은 대로 일이 잘 풀리는 하루가 될 거예요.",
"불편한 대화가 생길 수 있지만 솔직함이 도움이 될 거예요.",
"의외의 칭찬을 듣고 기분이 좋아질 수 있어요.",
"피로가 누적되어 몸이 무거울 수 있으니 충분히 쉬어주세요.",
"작은 일에도 신경이 예민해질 수 있어요.",
"오늘은 새로운 정보를 얻게 될 거예요.",
"마음의 여유를 가지면 생각보다 많은 걸 얻을 수 있어요.",
"누군가의 무심한 말에 마음이 상할 수 있어요.",
"가까운 사람이 힘들어할 수 있으니 챙겨보세요.",
"오늘은 평소보다 감정 기복이 심할 수 있어요.",
"오랜만에 좋은 소식을 듣게 될 거예요.",
"계획했던 일이 생각보다 늦어질 수 있어요.",
"오늘은 평소와 다르게 새로운 아이디어가 떠오를 수 있어요.",
"실수로 인해 잠깐 마음이 불편할 수 있어요.",
"가까운 사람이 뜻밖의 도움을 줄 거예요.",
"작은 불편함도 웃으며 넘길 수 있는 하루가 될 거예요.",
"오늘은 예상치 못한 변화가 찾아올 수 있어요.",
"기분 좋은 일이 생기지만 오래가지 않을 수 있어요.",
"마음이 가벼워지는 순간을 느끼게 될 거예요.",
"지출이 예상보다 늘어날 수 있으니 신중히 행동하세요.",
"누군가의 조언이 큰 도움이 될 수 있어요.",
"오늘은 특별히 바쁘지 않은 하루가 될 거예요.",
"의외의 오해가 생길 수 있으니 말조심 해보세요.",
"좋은 기운이 주위를 감쌀 거예요.",
"힘들었던 일이 조금씩 해결될 거예요.",
"마음이 울적할 때는 가까운 사람과 대화를 나눠보세요.",
"새로운 사람과의 만남이 좋은 인연이 될 수 있어요.",
"오늘은 일이 쉽게 풀리지 않을 수 있어요.",
"작은 일에도 민감해질 수 있으니 마음을 다스려보세요.",
"기대하지 않았던 선물이 찾아올 수 있어요.",
"예상 밖의 실망이 있을 수 있어요.",
"마음에 여유를 가지면 운이 더 좋아질 거예요.",
"오늘은 평소보다 집중력이 높아질 거예요.",
"계획에 차질이 생길 수 있지만 포기하지 마세요.",
"특별한 일이 없어도 소소한 행복을 느낄 수 있어요.",
"불필요한 논쟁을 피하면 평온한 하루가 될 거예요.",
"기다렸던 소식이 오늘 도착할 수 있어요.",
"의외의 사람이 큰 힘이 되어줄 거예요.",
"몸이 무거울 수 있으니 건강을 챙겨보세요.",
"작은 칭찬에 큰 힘을 얻을 수 있어요.",
"오늘은 마음이 복잡해질 수 있으니 천천히 움직여보세요.",
"가까운 사람과의 오해가 생길 수 있으니 솔직하게 소통하세요.",
"생각지도 못한 지출이 생길 수 있어요.",
"행운이 곧 찾아올 것 같은 하루예요.",
"피곤함이 밀려와 쉬고 싶은 마음이 들 수 있어요.",
"새로운 취미를 시작하면 기분이 전환될 거예요.",
"주변의 기대가 부담이 될 수 있으니 자신의 속도를 지켜보세요.",
"가볍게 넘겼던 일이 다시 떠오를 수 있어요.",
"오늘은 자신을 칭찬하는 하루로 만들어보세요.",
"예상과 달리 결과가 늦게 나타날 수 있어요.",
"기대했던 만큼의 성과가 나오지 않을 수 있어요.",
"누군가의 도움으로 어려움을 쉽게 넘길 수 있어요.",
"감정이 예민해져 불필요한 다툼이 생길 수 있어요.",
"작은 용기가 큰 변화를 가져올 거예요.",
"오늘은 새로운 정보를 얻을 수 있는 기회가 찾아올 거예요.",
"중요한 약속을 잊지 않도록 주의하세요.",
"잠시 멈춰 자신을 돌아보는 시간을 가져보세요.",
"좋은 일이 연달아 생길 수 있는 하루예요.",
"별 일 없는 하루지만 그만큼 평화로울 수 있어요.",
"오늘은 예상보다 바쁜 하루가 될 수 있어요.",
"잠깐의 방심이 실수로 이어질 수 있으니 신경 써보세요.",
"오랜 고민이 해결될 기미가 보일 수 있어요.",
"친구와의 대화에서 소소한 기쁨을 느낄 수 있어요.",
"기대와는 다르게 실망스러운 결과가 나올 수 있어요.",
"몸과 마음에 휴식이 필요한 하루일 수 있어요.",
"작은 성공이 큰 자신감으로 이어질 거예요.",
"별다른 일 없는 평온한 하루가 될 거예요.",
"뜻밖의 소식이 하루를 특별하게 만들어줄 수 있어요.",
"마음이 불안해질 땐 잠시 혼자만의 시간을 가져보세요.",
"계획대로 일이 풀리지 않아 답답함을 느낄 수 있어요.",
"평소보다 감정 표현이 많아질 수 있으니 조심하세요.",
"누군가의 칭찬 한 마디가 큰 힘이 되어줄 거예요.",
"실수로 인한 오해가 생길 수 있으니 침착하게 대처하세요.",
"오늘은 마음의 여유를 갖고 일상을 즐겨보세요.",
"가까운 사람에게 기대고 싶은 하루가 될 수 있어요.",
"평소보다 피곤이 쉽게 쌓일 수 있어요.",
"작은 행운이 예상치 못한 순간에 찾아올 수 있어요.",
"주변의 분위기에 휩쓸리지 않도록 중심을 잡아보세요.",
"갑작스러운 제안이 고민을 안겨줄 수 있어요.",
"기다렸던 답변이 드디어 올 수 있는 날이에요.",
"실망스러운 일이 생겨도 금방 회복될 거예요.",
"오늘은 가벼운 운동이나 산책이 도움이 될 거예요.",
"누군가의 부탁으로 인해 계획이 바뀔 수 있어요.",
"의외의 만남이 인상 깊게 남을 수 있어요.",
"마음 한 구석이 허전하게 느껴질 수 있어요.",
"작은 실수가 좋은 계기가 되어줄 거예요.",
"오늘은 스스로를 돌보는 데 집중해보세요.",
"불필요한 다툼은 피하는 게 좋아요.",
"주변의 기대에 부담을 느낄 수 있으니 마음을 다잡아보세요.",
"뜻밖의 기회가 찾아오니 놓치지 않도록 주의하세요.",
"계획했던 일이 예상보다 빨리 끝날 수 있어요.",
"마음먹은 대로 일이 풀리지 않아 실망할 수 있어요.",
"오늘은 새로운 시도를 하기보다는 안정감을 찾아보세요.",
"예상하지 못한 실수로 인해 당황할 수 있어요.",
"친구나 가족과의 시간이 큰 위로가 되어줄 거예요.",
"기대했던 일에 반전이 있을 수 있어요.",
"마음이 예민해져 사소한 일에도 반응할 수 있어요.",
"오늘은 의외로 지출이 많아질 수 있으니 주의하세요.",
"오래된 인연과 다시 연락이 닿을 수 있어요.",
"잠깐의 쉬는 시간이 큰 에너지가 되어줄 거예요.",
"계획하지 않은 일이 생겨도 당황하지 마세요.",
"실패를 두려워하지 말고 한 걸음 내디뎌보세요.",
"조금은 느긋하게 하루를 보내보는 것도 좋아요.",
"누군가의 도움으로 문제를 쉽게 해결할 수 있어요.",
"오늘은 평소보다 운이 따라주는 날일 수 있어요.",
"작은 일에도 감사함을 느끼는 하루가 될 거예요.",
"잠시 멈춰서 숨을 고르는 시간이 필요할 수 있어요.",
"오늘은 새로운 소식이 기대를 모으는 하루예요.",
"평소와 다르게 일이 술술 풀릴 수 있어요.",
"작은 오해가 갈등으로 이어질 수 있으니 신경 써보세요.",
"오늘은 고민하던 문제가 해결될 수 있는 날이에요.",
"가벼운 실수가 예상 밖의 결과를 가져올 수 있어요.",
"마음먹은 대로 일이 척척 진행될 거예요.",
"예상치 못한 만남이 즐거움을 줄 수 있어요.",
"오늘은 뜻하지 않은 소식에 놀랄 수 있어요.",
"누군가의 응원 한마디에 큰 힘을 얻을 수 있어요.",
"자신의 감정을 솔직하게 표현하면 도움이 될 거예요.",
"오늘은 작은 행운이 여러 번 찾아올 수 있어요.",
"평소보다 쉽게 피곤함을 느낄 수 있어요.",
"갑작스러운 변화가 혼란을 줄 수 있으니 침착하게 대처해보세요.",
"좋은 소식이 연달아 들려올 수 있어요.",
"친구의 조언이 문제 해결의 열쇠가 될 수 있어요.",
"오늘은 새로운 취미를 시작해보기에 좋은 날이에요.",
"실수로 인해 마음이 불편해질 수 있으니 조심하세요.",
"작은 기쁨이 쌓여 큰 만족으로 이어질 수 있어요.",
"오늘은 조금 느리게 가도 괜찮아요.",
"평소보다 주변에 신경을 더 써보세요.",
"마음의 여유를 찾으면 뜻밖의 기쁨이 올 거예요.",
"갑작스러운 일이 계획을 방해할 수 있어요.",
"오늘은 잠깐의 휴식이 큰 힘이 되어줄 거예요.",
"불필요한 고민에 시간을 쓰지 않도록 해보세요.",
"누군가의 실수를 너그럽게 받아들여 보세요.",
"오늘은 예상과 다른 방향으로 흘러갈 수 있어요.",
"작은 성취감이 큰 동기부여가 될 거예요.",
"마음이 흔들릴 때는 잠시 멈춰 생각해보세요.",
"의외의 제안이 들어와 고민이 생길 수 있어요.",
"오늘은 주변 사람들과 따뜻한 시간을 보내보세요.",
"갑작스러운 소식에 감정이 흔들릴 수 있어요.",
"오늘은 특별한 일 없이 평범하게 지나갈 수 있어요.",
"계획에 없던 만남이 하루를 바꿔줄 수 있어요.",
"마음이 복잡할 땐 가까운 사람과 대화해보세요.",
"작은 실수도 금방 지나갈 거예요.",
"평소보다 집중력이 떨어질 수 있으니 주의하세요.",
"오늘은 내 선택에 자신감을 가져보세요.",
"누군가의 부탁에 곤란함을 느낄 수 있어요.",
"예상하지 못한 칭찬을 듣고 기분이 좋아질 거예요.",
"작은 지출이 쌓여 부담이 될 수 있어요.",
"오늘은 스스로를 응원해주는 하루로 만들어보세요.",
"갑작스러운 변화에 당황하지 말고 유연하게 대처하세요.",
"의외의 만남에서 좋은 인연을 찾을 수 있어요.",
"오늘은 몸과 마음을 쉬게 하는 것도 좋아요.",
"계획과 달리 일이 미뤄질 수 있으니 여유를 가져보세요.",
"마음이 울적할 땐 잠시 산책을 해보세요.",
"작은 용기가 새로운 시작을 가져올 수 있어요.",
"오늘은 평소보다 건강에 더 신경 써보세요.",
"누군가의 말에 쉽게 상처받지 않도록 주의하세요.",
"마음속 작은 걱정도 솔직하게 털어놔보세요.",
"좋은 일이 예상치 못한 순간에 찾아올 수 있어요.",
"오늘은 생각보다 많은 일들이 생길 수 있어요.",
"자신의 실수를 너무 탓하지 않아도 괜찮아요.",
"예상치 못한 일로 바쁜 하루를 보낼 수 있어요.",
"가까운 사람에게 의지하면 큰 힘이 될 거예요.",
"계획이 틀어질 수 있으니 융통성 있게 대처해보세요.",
"작은 칭찬이 하루를 특별하게 만들어줄 수 있어요.",
"오늘은 지출을 조금 더 신경 써보세요.",
"오랜만에 편안한 휴식을 취할 수 있어요.",
"마음의 문을 열면 뜻밖의 좋은 인연이 찾아올 수 있어요.",
"작은 실수가 반복되지 않도록 주의하세요.",
"오늘은 평소와 다르게 에너지가 넘치는 하루가 될 거예요.",
"누군가의 도움을 받을 수 있으니 감사한 마음을 가져보세요.",
"갑작스러운 변화에 혼란을 느낄 수 있어요.",
"새로운 정보가 고민을 해결하는 데 도움이 될 거예요.",
"친구와의 대화에서 예상치 못한 기쁨을 얻을 수 있어요.",
"기대했던 만큼의 결과가 나오지 않을 수 있어요.",
"마음이 불안하면 잠시 휴식을 취해보세요.",
"평소보다 신중하게 행동하면 실수를 줄일 수 있어요.",
"오늘은 작은 성공이 쌓여 큰 만족으로 이어질 수 있어요.",
"불필요한 걱정은 잠시 내려두세요.",
"오늘은 예상 외의 행운이 찾아올 수 있어요.",
"감정 기복이 심해질 수 있으니 조절해보세요.",
"친한 사람과의 대화가 큰 위로가 될 거예요.",
"무심코 한 행동이 오해로 이어질 수 있으니 조심하세요.",
"계획했던 일이 미뤄질 수 있지만 실망하지 마세요.",
"오늘은 건강을 챙기는 것이 중요해요.",
"작은 다툼이 생길 수 있으니 말을 아껴보세요.",
"기분 좋은 소식이 하루를 밝게 만들어줄 거예요.",
"오늘은 평범함 속에서 특별함을 발견할 수 있을 거예요.",
"마음의 여유가 뜻밖의 기쁨을 가져다줄 수 있어요.",
"누군가에게 기대면 예상보다 더 큰 도움을 받을 수 있어요.",
"불필요한 경쟁심은 버려보세요.",
"작은 걱정이 쌓이면 스트레스가 될 수 있으니 털어놓아보세요.",
"오늘은 나를 위한 시간을 가져보는 것도 좋아요.",
"생각지도 못한 기회가 찾아올 수 있으니 열린 마음을 가져보세요.",
"오늘은 새로운 소식이 기다리고 있을지도 몰라요.",
"마음에 들지 않는 일이 생겨도 너무 신경 쓰지 마세요.",
"작은 친절이 큰 변화를 만들 수 있어요.",
"예상과 달리 일이 쉽게 풀릴 수 있어요.",
"오늘은 새로운 시도를 하기 좋은 날이에요.",
"누군가의 실수로 불편함을 느낄 수 있어요.",
"오늘은 특별히 할 일이 없는 하루일 수 있어요.",
"자신에게 솔직해지면 마음이 편안해질 거예요.",
"주변의 변화에 예민해질 수 있으니 차분하게 생각해보세요.",
"오늘은 뜻밖의 만남이 기다리고 있을 수 있어요.",
"피곤함이 쌓이면 건강을 해칠 수 있으니 무리하지 마세요.",
"작은 목표를 이뤄내는 즐거움을 느낄 수 있어요.",
"마음속 고민을 누군가에게 털어놓으면 한결 가벼워질 거예요.",
"예상치 못한 소식이 하루를 바꿀 수 있어요.",
];

const bePath = path.join(__dirname, '../data/BE.json');
function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, "{}");
  return JSON.parse(fs.readFileSync(bePath, "utf8"));
}
function saveBE(data) {
  fs.writeFileSync(bePath, JSON.stringify(data, null, 2));
}
function addBE(userId, amount, reason) {
  const be = loadBE();
  if (!be[userId]) be[userId] = { amount: 0, history: [] };
  be[userId].amount += amount;
  be[userId].history.push({
    type: "earn",
    amount,
    reason,
    timestamp: Date.now()
  });
  saveBE(be);
}

// 유저별 마지막 사용일 저장 경로
const dataDir = path.join(__dirname, '../data');
const dataPath = path.join(dataDir, 'fortune-used.json');

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
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().split('T')[0];
}

// 운세 보상 로직
function getFortuneReward() {
  const rand = Math.random() * 100;
  if (rand < 0.5) { // 0.5%
    return { amount: 50000, emoji: "👑" };
  } else if (rand < 2) { // 1.5%
    return { amount: Math.floor(Math.random() * 10000) + 40000, emoji: "🌈" };
  } else if (rand < 5) { // 3%
    return { amount: Math.floor(Math.random() * 10000) + 30000, emoji: "🦄" };
  } else if (rand < 15) { // 10%
    return { amount: Math.floor(Math.random() * 10000) + 20000, emoji: "💎" };
  } else if (rand < 40) { // 25%
    return { amount: Math.floor(Math.random() * 10000) + 10000, emoji: "🪙" };
  } else {
    return { amount: Math.floor(Math.random() * 5000) + 5000, emoji: "🍀" };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('오늘의운세')
    .setDescription('오늘의 운세를 확인합니다. (자정마다 초기화, 모든 유저 공개)'),
  async execute(interaction) {
    const userId = interaction.user.id;
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

    // 𝕯𝖔𝖓𝖔𝖗 역할 여부 확인
    const isDonor = interaction.member.roles.cache.has(DONOR_ROLE);

    // 운세 랜덤 선택
    const fortune = fortunes[Math.floor(Math.random() * fortunes.length)];
    let rewardObj = getFortuneReward();

    // 도너라면 x2
    let rewardAmount = rewardObj.amount;
    if (isDonor) rewardAmount *= 2;

    // 정수 지급
    addBE(userId, rewardAmount, isDonor ? "오늘의 운세 보상 (𝕯𝖔𝖓𝖔𝖗 x2)" : "오늘의 운세 보상");

    // 기록
    userData[userId] = today;
    saveUserData(userData);

    // 임베드 생성
    let desc = [
      `<@${userId}> 님, ${fortune}`,
      ``,
      `${rewardObj.emoji} 파랑 정수 **${rewardAmount.toLocaleString()} BE**를 획득했습니다!`
    ];
    if (isDonor) desc.push('\n💜 𝕯𝖔𝖓𝖔𝖗 운세 보상 **2배** 지급!');

    const embed = new EmbedBuilder()
      .setTitle('오늘의 운세')
      .setDescription(desc.join('\n'))
      .setColor(isDonor ? 0xAE72F7 : 0x57D9A3)
      .setFooter({ text: `매일 자정 00:00 이후가 지나면 다시 뽑을 수 있습니다.` });

    // 전체 공개
    await interaction.reply({ embeds: [embed] });
  }
};
