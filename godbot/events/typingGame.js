const { Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const ALLOWED_CHANNEL = '1393421229083328594';
const DATA_PATH = path.join(__dirname, '../data/typing-rank.json');
const { createCanvas, registerFont } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
registerFont(path.join(__dirname, '../fonts/NanumGothic.ttf'), { family: 'NanumGothic' });

function renderTextToImage(text) {
  const width = 880, height = 90;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.font = '32px NanumGothic';
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'middle';
  // 여러 줄 지원
  let lines = [];
  let line = '', words = text.split(' ');
  for (let word of words) {
    let test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > width - 40) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 20, 45 + i * 38);
  }
  return new AttachmentBuilder(canvas.toBuffer(), { name: 'typing.png' });
}


const HANGUL = [
"시작이 반이다. 지금 이 순간 한 걸음을 내딛어 보세요.",
"실패는 성공의 어머니이며, 포기는 가장 큰 실패다.",
"포기하지 않는 한, 당신은 아직 패배한 것이 아니다.",
"매일 조금씩의 노력이 결국 큰 변화를 만든다.",
"오늘의 고통은 내일의 성장으로 이어진다.",
"할 수 있다고 믿는 순간, 이미 반은 이룬 것이다.",
"성공이란 넘어질 때마다 다시 일어서는 것이다.",
"작은 습관이 쌓여 인생을 바꾼다는 걸 잊지 마세요.",
"내일은 오늘 노력한 만큼 빛나게 마련이다.",
"위대한 일도 한 걸음부터 시작된다는 사실을 명심하세요.",
"누구나 처음에는 서툴지만, 반복이 실력을 만든다.",
"포기하지 않고 달리면 결국 도착점에 도달하게 된다.",
"진정한 용기는 두려움을 이기는 마음에서 나온다.",
"어제보다 더 나은 오늘을 위해 노력해보세요.",
"행복은 멀리 있지 않고, 지금 이 순간에 있습니다.",
"작은 성공을 쌓아 큰 목표를 이뤄나가세요.",
"실수는 성장의 과정이니 두려워하지 마세요.",
"불가능해 보이는 것도 도전하면 가능해집니다.",
"노력은 결코 배신하지 않는다는 것을 기억하세요.",
"지금 이 순간이 당신 인생의 새로운 출발점입니다.",
"모든 꿈은 시도에서 시작된다는 사실을 잊지 마세요.",
"할 수 없다고 생각하면 정말 아무것도 할 수 없습니다.",
"끝이라고 생각한 곳이 새로운 시작일 수 있습니다.",
"천천히 가더라도 멈추지 않는 것이 중요합니다.",
"타인의 시선보다 나 자신의 꿈에 집중해보세요.",
"어려움은 잠시지만, 포기는 평생 후회로 남습니다.",
"도전은 두렵지만, 도전하지 않으면 아무 일도 일어나지 않습니다.",
"지금의 작은 선택이 미래의 큰 변화를 만듭니다.",
"성장은 매일의 꾸준함에서 비롯됩니다.",
"불확실함을 견디는 힘이 진짜 용기입니다.",
"오늘이 어제보다 나아졌다면 그걸로 충분합니다.",
"작은 성공을 축하하는 습관을 가져보세요.",
"당신의 노력이 언젠가 반드시 빛을 발할 거예요.",
"포기하는 순간 모든 가능성이 사라집니다.",
"힘들수록 더 웃으면서 앞으로 나아가세요.",
"스스로를 믿는 마음이 가장 큰 힘이 됩니다.",
"변화는 늘 두려움을 동반하지만, 성장으로 이어집니다.",
"당신은 당신이 생각하는 것보다 훨씬 강합니다.",
"실패를 두려워하지 마세요. 도전한 당신이 이미 멋진 사람입니다.",
"길을 잃었다고 느껴질 때, 잠시 쉬어가도 괜찮아요.",
"매일 조금씩, 오늘도 한 걸음 내딛어보세요.",
"누군가를 응원할 수 있다는 것도 큰 행복입니다.",
"어려운 일일수록 끝까지 해내는 뿌듯함이 큽니다.",
"노력하는 자에게 행운은 반드시 찾아옵니다.",
"생각보다 먼 길도, 한 걸음씩 가면 도달할 수 있습니다.",
"작은 친절이 누군가의 하루를 바꿀 수도 있습니다.",
"실패는 끝이 아니라 더 나은 내일의 시작입니다.",
"최선을 다한 하루는 후회 없는 하루가 됩니다.",
"꿈을 포기하지 않는 한, 꿈은 반드시 현실이 됩니다.",
"자신의 가치를 스스로 깎아내리지 마세요. 당신은 소중한 사람입니다.",
"누군가의 한마디 응원이 큰 힘이 될 수 있습니다.",
"실패를 통해 배우는 것이 진짜 성장입니다.",
"힘들 때일수록 내 마음을 다독여 주세요.",
"내일은 오늘보다 더 나은 내가 되길 바랍니다.",
"지금 포기하면 어제의 노력이 아깝지 않을까요?",
"고민이 많을수록 그만큼 성장할 수 있습니다.",
"꿈꾸는 자만이 결국 꿈을 이룰 수 있습니다.",
"오늘의 작은 기쁨을 소중히 여겨보세요.",
"나 자신을 칭찬하는 시간을 가져보세요.",
"넘어져도 괜찮아요. 다시 일어서면 됩니다.",
"포기라는 단어 대신 도전이라는 단어를 써보세요.",
"사소한 친절이 세상을 따뜻하게 만듭니다.",
"노력한 만큼의 결과가 아니더라도 실망하지 마세요.",
"오늘의 한숨이 내일의 미소로 바뀔 수 있습니다.",
"내가 걸어온 길을 돌아보면 분명 성장한 자신을 볼 수 있습니다.",
"마음먹은 대로 살아보는 하루를 만들어보세요.",
"누군가의 조언이 때로는 인생을 바꿉니다.",
"마음속 꿈을 끝까지 간직해보세요.",
"실패에 좌절하지 말고, 다시 한 번 도전해보세요.",
"자신에게 관대해지는 것도 중요한 용기입니다.",
"불확실한 미래보다 지금의 순간을 소중히 여겨보세요.",
"천천히 가더라도 포기하지 않고 앞으로 나아가세요.",
"자신의 속도로 한 걸음씩 걸어가는 것도 멋진 일입니다.",
"긍정적인 생각이 좋은 결과를 만들어냅니다.",
"모든 시작은 설레임과 두려움이 공존합니다.",
"포기하지 않는 그 순간, 기적은 시작됩니다.",
"누구보다 자신을 먼저 사랑해보세요.",
"가장 힘들 때 웃을 수 있는 사람이 진정한 강자입니다.",
"작은 실수는 곧 큰 배움이 될 수 있습니다.",
"길이 보이지 않을 때는 잠시 쉬어가도 괜찮아요.",
"행복은 멀리 있는 것이 아니라 지금 내 곁에 있습니다.",
"어려움은 나를 더 강하게 만들어줍니다.",
"용기를 내 한 걸음 내딛어보세요.",
"매일 반복되는 일상 속에도 작은 기쁨이 있습니다.",
"누군가에게 힘이 되어주는 하루가 되길 바랍니다.",
"성공을 향한 길에는 항상 어려움이 함께합니다.",
"나의 가치를 믿는 것에서 모든 것이 시작됩니다.",
"걱정하지 마세요. 잘하고 있습니다.",
"도전의 끝에는 반드시 성장이라는 선물이 있습니다.",
"성장은 하루아침에 이루어지지 않습니다. 인내하세요.",
"누구에게나 힘든 시기는 반드시 지나갑니다.",
"내가 바라는 삶을 위해 오늘도 최선을 다해보세요.",
"스스로를 격려하는 말을 자주 해보세요.",
"새로운 시작을 두려워하지 마세요.",
"작은 변화가 큰 변화를 이끌기도 합니다.",
"오늘의 노력이 내일의 자신감을 만들어줍니다.",
"실패는 성공을 위한 가장 좋은 경험입니다.",
"나만의 속도로 천천히 가도 괜찮아요.",
"작은 용기가 큰 변화를 만듭니다.",
"내일은 오늘보다 더 빛나는 하루가 될 거예요.",
"어떤 어려움도 결국 지나간다는 사실을 잊지 마세요.",
"지금 힘든 만큼 더 단단해질 수 있습니다.",
"자신의 장점을 먼저 인정해보세요.",
"스스로를 믿는 순간 모든 것이 가능해집니다.",
"모두가 멈췄을 때 한 걸음 더 내딛어보세요.",
"도전은 두렵지만, 후회보다는 성장의 기회입니다.",
"매일의 성실함이 결국 인생을 바꿉니다.",
"실패를 두려워하지 않는 용기를 가져보세요.",
"꿈을 꾸는 순간부터 이미 변화는 시작됩니다.",
"마음의 소리에 귀 기울여 보세요.",
"누군가의 미소가 오늘을 행복하게 만듭니다.",
"항상 긍정적인 생각을 유지하려고 노력해보세요.",
"실패보다 포기가 더 큰 적이라는 걸 기억하세요.",
"천천히 가더라도 계속 나아가야 합니다.",
"작은 성공도 기쁘게 받아들이세요.",
"매일 아침 새로운 마음으로 시작하세요.",
"당신의 노력은 분명 빛을 발할 날이 올 거예요.",
"힘들 때일수록 잠깐 멈춰서 자신을 돌아보세요.",
"자신감은 계속 시도하는 과정에서 만들어집니다.",
"더 나은 내일을 위해 오늘을 소중히 여겨보세요.",
"남들과 비교하지 말고 어제의 나와 경쟁해보세요.",
"끝까지 해내는 의지가 진정한 실력입니다.",
"실패는 과정일 뿐, 결코 끝이 아닙니다.",
"자신을 사랑하는 마음이 세상을 밝힙니다.",
"작은 친절이 큰 기적을 만들 수도 있습니다.",
"오늘 할 수 있는 일을 내일로 미루지 마세요.",
"모든 도전에는 배움이 함께합니다.",
"누구에게나 힘든 날은 있기 마련입니다.",
"희망을 잃지 않는 사람이 결국 승리합니다.",
"성공은 끊임없는 시도와 인내에서 비롯됩니다.",
"어려운 순간에도 웃을 수 있는 용기를 내보세요.",
"내가 걷는 길이 남들과 달라도 괜찮아요.",
"실패도 인생의 소중한 경험이 됩니다.",
"오늘의 선택이 내일의 나를 만듭니다.",
"새로운 도전을 두려워하지 마세요.",
"불가능해 보여도 시도해보면 가능합니다.",
"작은 실천이 큰 결과를 만들어냅니다.",
"포기하지 않는 마음이 결국 이깁니다.",
"지금 당장 시작해도 늦지 않았습니다.",
"내일은 오늘보다 더 멋진 내가 될 수 있습니다.",
"스스로를 칭찬하는 습관을 길러보세요.",
"노력은 결과를 배신하지 않습니다.",
"항상 감사하는 마음을 잃지 마세요.",
"지금의 어려움은 곧 지나갑니다.",
"성공은 멀리 있지 않습니다. 당신 안에 있습니다.",
"계속 시도하다 보면 어느새 이루고 있을 거예요.",
"모든 순간이 소중하니 현재에 집중해보세요.",
"작은 변화부터 시작해보는 용기를 내세요.",
"누군가의 응원이 큰 힘이 될 수 있습니다.",
"오늘의 작은 성공이 내일의 큰 도약이 됩니다.",
"실패를 통해 배우는 것이 많으니 두려워하지 마세요.",
"내가 좋아하는 일을 하며 살아가는 것이 진정한 행복입니다.",
"자신을 믿고 앞으로 나아가는 용기를 가져보세요.",
"힘든 시기에도 웃을 수 있는 자신을 응원합니다.",
"마음이 지칠 땐 잠시 쉬어가는 것도 괜찮아요.",
"노력하는 만큼 결과는 반드시 따라온다는 걸 믿으세요.",
"미래는 오늘의 노력이 쌓여 만들어집니다.",
"포기하지 않는 끈기가 결국 꿈을 이루게 합니다.",
"실패도 성장의 발판이 될 수 있습니다.",
"작은 변화가 모여 큰 성장을 이룹니다.",
"내일은 더 나은 내가 될 거라는 믿음을 가지세요.",
"주어진 시간에 최선을 다하는 것이 중요합니다.",
"누군가의 한마디 칭찬이 큰 힘이 될 수 있습니다.",
"시작이 어렵지만, 한 번 시작하면 쉬워집니다.",
"내 마음의 소리에 귀 기울이는 연습을 해보세요.",
"사소한 일에도 감사하는 마음을 잊지 마세요.",
"오늘의 고민이 내일의 웃음이 될 수도 있습니다.",
"기적은 포기하지 않는 사람에게 찾아옵니다.",
"진정한 용기는 두려움 속에서도 한 걸음 내딛는 것입니다.",
"작은 목표부터 하나씩 이루어가는 기쁨을 느껴보세요.",
"누구나 실수는 할 수 있습니다. 중요한 것은 다시 일어서는 힘입니다.",
"지금 당장 변화하고 싶다면, 작은 것부터 시작하세요.",
"성공은 빠른 것이 아니라 멈추지 않는 데에 있습니다.",
"나만의 속도로 한 걸음씩 전진하세요.",
"힘든 시간도 결국엔 지나간다는 것을 기억하세요.",
"실패해도 괜찮아요. 포기만 하지 마세요.",
"작은 습관이 인생을 바꿀 수 있습니다.",
"매일 조금씩이라도 발전하는 내가 되길 바랍니다.",
"과거에 얽매이지 말고, 미래를 향해 나아가세요.",
"스스로를 믿는 것이 가장 큰 힘이 됩니다.",
"노력하는 과정 자체가 이미 값진 경험입니다.",
"오늘의 한 걸음이 내일의 큰 발전이 됩니다.",
"긍정적인 마음가짐이 삶을 더 행복하게 만듭니다.",
"무엇이든 시작하는 용기가 중요합니다.",
"완벽하지 않아도 괜찮아요. 시도하는 것이 중요합니다.",
"나만의 길을 가는 자신감을 가지세요.",
"누구보다도 내 자신을 믿어주세요.",
"불안함도 성장의 과정임을 잊지 마세요.",
"꿈을 꾸는 한, 희망은 있습니다.",
"힘든 순간일수록 자신의 가능성을 믿으세요.",
"오늘은 어제의 내가 꿈꾸던 내일입니다.",
"실수는 더 나은 나로 성장하는 밑거름입니다.",
"누구나 자기만의 속도가 있다는 걸 기억하세요.",
"지금의 노력은 반드시 내일의 나를 빛나게 할 겁니다.",
"포기하지 않는 한, 실패는 없습니다.",
"지금 이 순간도 소중히 여기며 살아가세요.",
"자신을 응원하는 마음이 가장 큰 힘이 됩니다.",
"성공은 가까운 곳에 있을지도 모릅니다. 계속 도전하세요.",
];
const ENGLISH = [
"Success is not final, failure is not fatal: it is the courage to continue that counts.",
"Every accomplishment starts with the decision to try.",
"Believe in yourself and all that you are.",
"Dream big and dare to fail, for failure is only the path to growth.",
"Small daily improvements are the key to staggering long-term results.",
"Your only limit is your mind. Challenge yourself every day.",
"The only way to achieve the impossible is to believe it is possible.",
"Happiness is not by chance, but by choice.",
"Great things never come from comfort zones.",
"The journey of a thousand miles begins with a single step.",
"Don’t watch the clock; do what it does. Keep going.",
"Courage is not the absence of fear, but the triumph over it.",
"The best way to predict the future is to create it.",
"Don’t be afraid to give up the good to go for the great.",
"Your life does not get better by chance, it gets better by change.",
"Failure is simply the opportunity to begin again, this time more wisely.",
"It does not matter how slowly you go as long as you do not stop.",
"One day or day one. You decide.",
"You are capable of more than you know.",
"The harder you work for something, the greater you’ll feel when you achieve it.",
"Do not wait to strike till the iron is hot, but make it hot by striking.",
"Dreams don’t work unless you do.",
"Don’t limit your challenges. Challenge your limits.",
"Push yourself, because no one else is going to do it for you.",
"The secret of getting ahead is getting started.",
"Sometimes we’re tested not to show our weaknesses, but to discover our strengths.",
"Success doesn’t come from what you do occasionally, but what you do consistently.",
"Your attitude, not your aptitude, will determine your altitude.",
"Opportunities don’t happen. You create them.",
"Don’t be pushed around by the fears in your mind.",
"Believe you can and you’re halfway there.",
"The difference between ordinary and extraordinary is that little extra.",
"Start where you are. Use what you have. Do what you can.",
"You miss 100% of the shots you don’t take.",
"Be the change that you wish to see in the world.",
"It always seems impossible until it’s done.",
"The future belongs to those who believe in the beauty of their dreams.",
"Failure is not falling down but refusing to get up.",
"The best preparation for tomorrow is doing your best today.",
"Act as if what you do makes a difference. It does.",
"Don’t count the days, make the days count.",
"Nothing will work unless you do.",
"Don’t let yesterday take up too much of today.",
"Life is 10% what happens to us and 90% how we react to it.",
"Keep your face always toward the sunshine—and shadows will fall behind you.",
"You are never too old to set another goal or to dream a new dream.",
"All our dreams can come true, if we have the courage to pursue them.",
"Great minds discuss ideas; average minds discuss events; small minds discuss people.",
"Don’t be afraid to fail. Be afraid not to try.",
"Every day is a new beginning. Take a deep breath and start again.",
"Success is not how high you have climbed, but how you make a positive difference.",
"Start each day with a positive thought and a grateful heart.",
"Don’t quit. Suffer now and live the rest of your life as a champion.",
"Everything you can imagine is real.",
"Failure will never overtake me if my determination to succeed is strong enough.",
"Be yourself; everyone else is already taken.",
"The best revenge is massive success.",
"Sometimes later becomes never. Do it now.",
"The only person you are destined to become is the person you decide to be.",
"Keep going. Everything you need will come to you.",
"Perseverance is not a long race; it is many short races one after another.",
"Don’t dream about success. Work for it.",
"It’s never too late to be what you might have been.",
"Action is the foundational key to all success.",
"Every moment is a fresh beginning.",
"You become what you believe.",
"Turn your wounds into wisdom.",
"Energy and persistence conquer all things.",
"Stars can’t shine without darkness.",
"Life is short. Focus on what matters and let go of what doesn’t.",
"Do what you can, with what you have, where you are.",
"Keep your eyes on the stars, and your feet on the ground.",
"The only real mistake is the one from which we learn nothing.",
"Be so good they can’t ignore you.",
"Don’t be afraid to give up the good to go for the best.",
"Your passion is waiting for your courage to catch up.",
"Don’t wish it were easier. Wish you were better.",
"Success is not for the chosen few, but for the few who choose it.",
"Sometimes the smallest step in the right direction ends up being the biggest step of your life.",
"Never regret anything that made you smile.",
"The expert in anything was once a beginner.",
"Your time is limited, don’t waste it living someone else’s life.",
"Be proud of how hard you are trying.",
"Even the greatest was once a beginner. Don’t be afraid to take that first step.",
"Strive for progress, not perfection.",
"Just keep moving forward and don’t give a damn about what anybody thinks.",
"The secret of your future is hidden in your daily routine.",
"Let your faith be bigger than your fear.",
"You get what you work for, not what you wish for.",
"Don’t stop when you’re tired. Stop when you’re done.",
"Be fearless in the pursuit of what sets your soul on fire.",
"If you want to fly, you have to give up the things that weigh you down.",
"Don’t tell people your plans. Show them your results.",
"With the new day comes new strength and new thoughts.",
"Strength does not come from physical capacity. It comes from indomitable will.",
"Be patient. Good things take time.",
"Be the reason someone believes in the goodness of people.",
"Wherever you go, go with all your heart.",
"There are no shortcuts to any place worth going.",
"Live as if you were to die tomorrow. Learn as if you were to live forever.",
"Don’t be discouraged. It’s often the last key in the bunch that opens the lock.",
"Little by little, a little becomes a lot.",
"Keep going. Difficult roads often lead to beautiful destinations.",
"Great things take time. Be patient and keep going.",
"Don’t wait for opportunity. Create it.",
"Rise up and attack the day with enthusiasm.",
"The best view comes after the hardest climb.",
"Wake up with determination. Go to bed with satisfaction.",
"Make today so awesome that yesterday gets jealous.",
"You are stronger than you think.",
"Stay positive, work hard, and make it happen.",
"Small steps every day will lead to big results.",
"Dreams are the seeds of change. Nothing ever grows without a seed.",
"Your dreams don’t have an expiration date.",
"Success is the sum of small efforts repeated day in and day out.",
"The only limit to our realization of tomorrow is our doubts of today.",
"Good things come to those who hustle.",
"The difference between who you are and who you want to be is what you do.",
"If you get tired, learn to rest, not quit.",
"You can’t cross the sea merely by standing and staring at the water.",
"Success doesn’t come to you. You go to it.",
"You are one decision away from a totally different life.",
"Stars can’t shine without darkness.",
"The road to success is always under construction.",
"If you stumble, make it part of the dance.",
"Don’t wish for it. Work for it.",
"Life isn’t about waiting for the storm to pass, but about learning to dance in the rain.",
"Be the type of person you want to meet.",
"Stop doubting yourself. Work hard and make it happen.",
"You are the artist of your own life. Don’t hand the paintbrush to anyone else.",
"Your only limit is you.",
"Everything you’ve ever wanted is on the other side of fear.",
"The secret of change is to focus all your energy not on fighting the old, but on building the new.",
"You don’t have to be perfect to be amazing.",
"Start where you are, use what you have, do what you can.",
"One small positive thought in the morning can change your whole day.",
"It always seems impossible until it’s done.",
"If you never try, you’ll never know what you’re capable of.",
"Be stronger than your strongest excuse.",
"Push yourself, no one else is going to do it for you.",
"Create a life you can’t wait to wake up to.",
"Don’t count the days, make the days count.",
"It’s going to be hard, but hard does not mean impossible.",
"Make your life a masterpiece; imagine no limitations on what you can be.",
"Don’t be busy, be productive.",
"The comeback is always stronger than the setback.",
"Failure is not the opposite of success; it’s part of success.",
"Don’t stop until you’re proud.",
"Success is liking yourself, liking what you do, and liking how you do it.",
"Chase your dreams but always know the road that will lead you home again.",
"Take the risk or lose the chance.",
"Sometimes you win, sometimes you learn.",
"Stay humble, work hard, be kind.",
"Nothing worth having comes easy.",
"Turn your can’ts into cans and your dreams into plans.",
"Progress, not perfection.",
"Every day may not be good, but there is something good in every day.",
"Success is not for the lazy.",
"Stop being afraid of what could go wrong and start being excited about what could go right.",
"Don’t let what you cannot do interfere with what you can do.",
"Believe in the power of yet.",
"The only place where success comes before work is in the dictionary.",
"Don’t let small minds convince you that your dreams are too big.",
"Every morning brings a new opportunity.",
"One day you’ll thank yourself for not giving up.",
"Create your own sunshine.",
"Discipline is choosing between what you want now and what you want most.",
"It’s never crowded along the extra mile.",
"The dream is free, but the hustle is sold separately.",
"Work hard in silence, let success make the noise.",
"Impossible is just an opinion.",
"Push harder than yesterday if you want a different tomorrow.",
"Never let the fear of striking out keep you from playing the game.",
"The key to success is to start before you are ready.",
"Don’t wish it were easier, wish you were better.",
"Great things never came from comfort zones.",
"Invest in yourself. It pays the best interest.",
"Every setback is a setup for a comeback.",
"If opportunity doesn’t knock, build a door.",
"It’s not whether you get knocked down, it’s whether you get up.",
"Success is walking from failure to failure with no loss of enthusiasm.",
"You only fail when you stop trying.",
"Don’t limit your challenges. Challenge your limits.",
"You become what you believe.",
"Stay positive. Work hard. Make it happen.",
"The only way to do great work is to love what you do.",
"Make it happen. Shock everyone.",
"Don’t let anyone dull your sparkle.",
"Never stop learning, because life never stops teaching.",
"The secret to getting ahead is getting started.",
"Go the extra mile. It’s never crowded.",
"You are the author of your own story.",
"Don’t be afraid to start over. It’s a chance to build something better.",
"One kind word can change someone’s entire day.",
"Be somebody who makes everybody feel like a somebody.",
"Make today count, you’ll never get it back.",
"Don’t let yesterday use up too much of today.",
"Choose people who choose you.",
"Never stop chasing your dreams.",
"Start today, not tomorrow.",
];

let rankData = { ko: {}, en: {} };
const ACTIVE = {}; // { userId: { answer, lang, startTime, timeout, finished } }

// 랭킹 파일 불러오기/저장
function loadRank() {
  if (fs.existsSync(DATA_PATH)) {
    rankData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  }
}
function saveRank() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(rankData, null, 2), 'utf8');
}

function getRankArray(lang) {
  const arr = Object.entries(rankData[lang] || {}).map(([id, record]) => ({
    userId: id,
    username: record.username,
    time: record.time,
    cpm: record.cpm,
    wpm: record.wpm,
    acc: record.acc
  }));
  return arr.sort((a, b) => a.time - b.time).slice(0, 20);
}
function getUserRank(lang, userId) {
  const arr = Object.entries(rankData[lang] || {}).map(([id, record]) => ({
    userId: id,
    time: record.time
  })).sort((a, b) => a.time - b.time);
  const idx = arr.findIndex(e => e.userId === userId);
  return idx === -1 ? null : idx + 1;
}

function calcCPM(input, ms) {
  return Math.round((input.length / ms) * 60000);
}
function calcWPM(input, ms, lang) {
  if (lang === 'ko') {
    // 한글은 2자 = 1단어
    const words = Math.max(1, Math.round(input.length / 2));
    return Math.round((words / ms) * 60000);
  } else {
    // 영어는 띄어쓰기 단위
    const words = Math.max(1, input.trim().split(/\s+/).length);
    return Math.round((words / ms) * 60000);
  }
}
function calcACC(target, input) {
  let correct = 0;
  for (let i = 0; i < Math.min(target.length, input.length); i++) {
    if (target[i] === input[i]) correct++;
  }
  return ((correct / target.length) * 100).toFixed(1);
}
function firstDiff(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return -1;
}

// 오타난 부분만 추출
function getMistypedSegment(answer, input) {
  const diffIdx = firstDiff(answer, input);
  if (diffIdx === -1) return '길이가 다릅니다.';
  // 오타 지점부터 최대 5글자만
  const correctSeg = answer.slice(diffIdx, diffIdx + 5);
  const inputSeg = input.slice(diffIdx, diffIdx + 5);
  return `정답: "${correctSeg}", 입력: "${inputSeg}"`;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    if (message.channel.id !== ALLOWED_CHANNEL) return;

    loadRank();

    // !도움말 처리
    if (message.content === '!도움말') {
      const embed = new EmbedBuilder()
        .setTitle('타자 연습 안내 및 명령어')
        .setColor(0x00c3ff)
        .setDescription(
          [
            '**타자 연습 명령어 목록**',
            '```',
            '!한타         : 한글 타자 연습 시작',
            '!영타         : 영어 타자 연습 시작',
            '!한타 순위    : 한글 타자 랭킹',
            '!영타 순위    : 영어 타자 랭킹',
            '!종료         : 진행중인 내 타자 연습 5초 뒤 강제 종료',
            '!도움말       : 이 도움말 출력',
            '```',
            '',
            '**타자 연습 안내**',
            '- 랜덤 문장이 출제되며, 똑같이 입력하면 됩니다.',
            '- 각 게임은 90초 제한, 여러 명이 동시에 진행 가능',
            '- [CPM/WPM/정확도]가 자동 계산되어 랭킹에 반영됨',
            '- 오타 시 오타 부분만 따로 안내해줍니다.',
            '- `!종료`로 직접 연습 세션 종료 가능',
          ].join('\n')
        )
        .setFooter({ text: '갓봇과 함께 즐거운 시간 되세요!' });
      return message.reply({ embeds: [embed] });
    }

    // 타자 시작
if (message.content === '!한타' || message.content === '!영타') {
  if (ACTIVE[message.author.id] && !ACTIVE[message.author.id].finished) {
    return message.reply('이미 진행 중인 타자 게임이 있습니다! 먼저 완료하거나 90초 기다려주세요.');
  }
  const isKo = message.content === '!한타';
  const arr = isKo ? HANGUL : ENGLISH;
  const answer = arr[Math.floor(Math.random() * arr.length)];
  const startTime = Date.now();
  const timeout = setTimeout(() => {
    if (ACTIVE[message.author.id] && !ACTIVE[message.author.id].finished) {
      message.reply(`⏰ 90초가 지났습니다! 타자 게임이 종료됩니다.`);
      ACTIVE[message.author.id].finished = true;
      delete ACTIVE[message.author.id];
    }
  }, 90 * 1000);
  ACTIVE[message.author.id] = {
    answer,
    lang: isKo ? 'ko' : 'en',
    startTime,
    timeout,
    finished: false
  };
  // 이미지로 출제!
  const image = renderTextToImage(answer);
  return message.reply({
    content: '아래 문장을 **똑같이** 입력하세요. (90초)',
    files: [image]
  });
}


    // 종료 명령어: 5초 뒤 닫힘
    if (message.content === '!종료') {
      const game = ACTIVE[message.author.id];
      if (!game || game.finished) return message.reply('진행 중인 타자 게임이 없습니다.');
      game.finished = true;
      clearTimeout(game.timeout);
      message.reply('5초 뒤에 타자 연습 세션이 종료됩니다...');
      setTimeout(() => {
        if (ACTIVE[message.author.id]) {
          message.channel.send('타자 연습이 종료되었습니다.');
          delete ACTIVE[message.author.id];
        }
      }, 5000);
      return;
    }

    // 랭킹 출력 (한글/영문)
    if (message.content === '!한타 순위' || message.content === '!영타 순위') {
      const lang = message.content === '!한타 순위' ? 'ko' : 'en';
      const top = getRankArray(lang);
      const myRank = getUserRank(lang, message.author.id);
      const myRec = rankData[lang][message.author.id];

      const embed = new EmbedBuilder()
        .setTitle(`타자 랭킹 TOP20 (${lang === 'ko' ? '한글' : '영문'})`)
        .setColor(0x7a4ef7)
        .setDescription(
          top.length
            ? top.map((e, i) =>
                `${i + 1}. <@${e.userId}> - \`${e.time}s\` | CPM: \`${e.cpm}\` | WPM: \`${e.wpm}\` | ACC: \`${e.acc}%\``
              ).join('\n')
            : '아직 기록이 없습니다!'
        )
        .setFooter({ text: myRank && myRec
          ? `내 순위: ${myRank}위 | 기록: ${myRec.time}s, CPM: ${myRec.cpm}, WPM: ${myRec.wpm}, ACC: ${myRec.acc}%`
          : '아직 기록이 없습니다. 먼저 타자 게임을 완료해보세요!' });

      return message.reply({ embeds: [embed] });
    }

    // 타자 정답 처리
const game = ACTIVE[message.author.id];
if (game && !game.finished) {
  if (message.content.startsWith('!')) return;
  const now = Date.now();
  const ms = now - game.startTime;
  if (now - game.startTime > 90 * 1000) {
    clearTimeout(game.timeout);
    game.finished = true;
    delete ACTIVE[message.author.id];
    return;
  }
  if (message.content === game.answer) {
    clearTimeout(game.timeout);
    const time = (ms / 1000).toFixed(2);
    const cpm = calcCPM(game.answer, ms);
    const wpm = calcWPM(game.answer, ms, game.lang);
    const acc = calcACC(game.answer, message.content);

    // 복붙 방지(3초 이내 정답은 랭킹 미등록)
    if (ms < 3000) {
      message.reply(`❌ 3초 이내 입력은 복사/붙여넣기 의심으로 랭킹에 기록되지 않습니다!\n(타자 연습은 이미지를 보고 입력해야 합니다.)`);
    } else {
      // 기록 갱신: 기존 기록 없거나 더 빠를 때만 저장
      const lang = game.lang;
      const old = rankData[lang][message.author.id];
      if (!old || Number(time) < old.time) {
        rankData[lang][message.author.id] = {
          username: message.author.username,
          time: Number(time),
          cpm,
          wpm,
          acc
        };
        saveRank();
        message.reply(`정답! ⏱️ ${time}초 | CPM: ${cpm} | WPM: ${wpm} | ACC: ${acc}%\n최고 기록이 갱신되었습니다!`);
      } else {
        message.reply(`정답! ⏱️ ${time}초 | CPM: ${cpm} | WPM: ${wpm} | ACC: ${acc}%\n(기존 최고 기록: ${old.time}s)`);
      }
    }
    game.finished = true;
    delete ACTIVE[message.author.id];
  } else {
    // 오타 안내 기존대로
    const hint = getMistypedSegment(game.answer, message.content);
    message.reply(`-# 오타! : [${hint}] 다시 시도하세요!`);
    }
   }
  }
};
