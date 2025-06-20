const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");

const dataPath = path.join(__dirname, "../data/genji-users.json");
const adventurePath = path.join(__dirname, "../data/genji-adventure.json");

const overwatchHeroes = [
  "겐지", "프레야", "헤저드", "주노", "벤처", "마우가", "일리아리", "라이프위버", "라마트라", "키리코", "정커퀸", "소전", "한조", "파라", "트레이서", "토르비욘", "캐서디", "젠야타", "정크렛", "자리야", "윈스턴", "위도우메이커", "시메트라",
  "솔져76", "바스티온", "메이", "메르시", "리퍼", "루시우", "로드호그", "에코", "시그마", "바티스트", "애쉬", "래킹볼", "브리기테", "모이라", "둠피스트", "오리사", "라인하르트", "솜브라", "아나", "디바"
].filter(name => name !== "겐지");

const heroImages = {
"겐지": "https://media.discordapp.net/attachments/1385523931577843842/1385528588354453605/wx4sw4ob.png?ex=6856658d&is=6855140d&hm=5cf7a1a13964e6070c824b2066f9ca9af131eef82266c381f16ccd2bf3f5579a&=&format=webp&quality=lossless",
"프레야": "https://media.discordapp.net/attachments/1385523931577843842/1385528475103920148/tpj8m23v.png?ex=68566572&is=685513f2&hm=1d8e40b584daca18496dca369c666d037806e196a193e41c83c118d5746427c8&=&format=webp&quality=lossless",
"헤저드": "https://media.discordapp.net/attachments/1385523931577843842/1385528475422818345/48qawntw.png?ex=68566572&is=685513f2&hm=9a74f449bb55593bde47fc370da1b7168f5deab99e9556488152084c78bd6ada&=&format=webp&quality=lossless",
"주노": "https://media.discordapp.net/attachments/1385523931577843842/1385528475686801468/i7b0hg2q.png?ex=68566572&is=685513f2&hm=28329dfca363bcd1c92db2e7f9e5ed1a4ea657122d373507fe24ad6cd351c9db&=&format=webp&quality=lossless",
"벤처": "https://media.discordapp.net/attachments/1385523931577843842/1385528476060221441/uegzomvq.png?ex=68566572&is=685513f2&hm=e10edb5a8a62b382346bbc557088d2004bd1b990be06901ca622e13a88e893c0&=&format=webp&quality=lossless",
"마우가": "https://media.discordapp.net/attachments/1385523931577843842/1385528476353953842/btqzxg7c.png?ex=68566572&is=685513f2&hm=123b3b1a0d2a0ace0318b9ff4c8798c5244de8940a919852bcfbba4be4baf625&=&format=webp&quality=lossless",
"일리아리": "https://media.discordapp.net/attachments/1385523931577843842/1385528476601159791/02rvtwno.png?ex=68566572&is=685513f2&hm=d9623b58ba728dec8e8722da038a217f4efae6e1e93ca54479f4c49829270969&=&format=webp&quality=lossless",
"라이프위버": "https://media.discordapp.net/attachments/1385523931577843842/1385528476894756884/ak6q5hk6.png?ex=68566572&is=685513f2&hm=dc557fb01f5f5489f195a56ad3d832c7a081fe6da13e4ee8f795a1b9a454b533&=&format=webp&quality=lossless",
"라마트라": "https://media.discordapp.net/attachments/1385523931577843842/1385528477217853461/d42kpnn8.png?ex=68566572&is=685513f2&hm=7949a850564d8469de52bcd6ff37768184ebdfc024674c8ebbbec5c5775fd196&=&format=webp&quality=lossless",
"키리코": "https://media.discordapp.net/attachments/1385523931577843842/1385528477490352138/zwkfd2fj.png?ex=68566572&is=685513f2&hm=bdba532246b95fe1674aea62630f4d5cc45c280109b531aa971b0747e38960f8&=&format=webp&quality=lossless",
"정커퀸": "https://media.discordapp.net/attachments/1385523931577843842/1385528474764185630/1hrup2mp.png?ex=68566572&is=685513f2&hm=a59ee9d57d31937510b7c69b4c50dcee24e2a3a5aa6fc95914085c527663dbc9&=&format=webp&quality=lossless",
"소전": "https://media.discordapp.net/attachments/1385523931577843842/1385528506087374858/zy7ysg6x.png?ex=68566579&is=685513f9&hm=b1e1e96320314bcdc3f896ac9682fa01f249566bfbfe4a9135ad9e53ea47fe52&=&format=webp&quality=lossless",
"한조": "https://media.discordapp.net/attachments/1385523931577843842/1385528506368135198/88jtzeqf.png?ex=68566579&is=685513f9&hm=ab29c37ea160808880cb685a912efc6371d95400e8727e1f719ef2212b08aab2&=&format=webp&quality=lossless",
"파라": "https://media.discordapp.net/attachments/1385523931577843842/1385528506741686302/0zjxjiqo.png?ex=68566579&is=685513f9&hm=589e58ba891917319fb9875b891808b04bbbbe2040feadc7b0a82671577a94ba&=&format=webp&quality=lossless",
"트레이서": "https://media.discordapp.net/attachments/1385523931577843842/1385528507265712135/nsa5uvqj.png?ex=6856657a&is=685513fa&hm=568c086bfa026a28f25300c4bf76366689d6e55c00520d2093fdff97e56e7e3c&=&format=webp&quality=lossless",
"토르비욘": "https://media.discordapp.net/attachments/1385523931577843842/1385528507546865694/rw7rsku2.png?ex=6856657a&is=685513fa&hm=704117bddaed506f9e63a60fe0371f033ab6d62d4474f2334d95fa0ae6929853&=&format=webp&quality=lossless",
"캐서디": "https://media.discordapp.net/attachments/1385523931577843842/1385528507920027658/azygu03b.png?ex=6856657a&is=685513fa&hm=d9a73ea0633b4b7427b7aa5fd46505ab671066f1a74703750c85f91684f21815&=&format=webp&quality=lossless",
"젠야타": "https://media.discordapp.net/attachments/1385523931577843842/1385528508159361115/fxr1bv1x.png?ex=6856657a&is=685513fa&hm=db3dd28de70f4adf6a6535a78ebd0b43a41779101eb6e750429d1024d19eb514&=&format=webp&quality=lossless",
"정크렛": "https://media.discordapp.net/attachments/1385523931577843842/1385528508553363507/p665i2qf.png?ex=6856657a&is=685513fa&hm=7d6eaf8922ee4a21f5f5102210a678761cb5636fec588e57321e732d4e8c9586&=&format=webp&quality=lossless",
"자리야": "https://media.discordapp.net/attachments/1385523931577843842/1385528508838707260/6h6uxyhw.png?ex=6856657a&is=685513fa&hm=238e7fca5b0ce00caabc2ec544b092c06d1da6106aed7c9a591b905f8c236678&=&format=webp&quality=lossless",
"윈스턴": "https://media.discordapp.net/attachments/1385523931577843842/1385528509102821416/hto702z7.png?ex=6856657a&is=685513fa&hm=342310019606433fbc752e15804623dd63e7b4876552933031d7b4ca412c7762&=&format=webp&quality=lossless",
"위도우메이커": "https://media.discordapp.net/attachments/1385523931577843842/1385528531836076133/2n32xcfs.png?ex=6856657f&is=685513ff&hm=b195ec9796daee2cafc487da4724d770277b55252dcac2babe8747e11a5a2195&=&format=webp&quality=lossless",
"시메트라": "https://media.discordapp.net/attachments/1385523931577843842/1385528532398117004/bhqjnb0r.png?ex=6856657f&is=685513ff&hm=3b9beaed4dedc9a0da10c4608aedfd24b9332c6475fae840c31dd8c652dd13ae&=&format=webp&quality=lossless",
"솔져76": "https://media.discordapp.net/attachments/1385523931577843842/1385528533094367263/ia5jeve8.png?ex=68566580&is=68551400&hm=b27670e6f917125e6c3b89ddd1fdccdf44ba1ac35b75d68faf649b60fcaef3f9&=&format=webp&quality=lossless",
"바스티온": "https://media.discordapp.net/attachments/1385523931577843842/1385528533585235998/6bc8du09.png?ex=68566580&is=68551400&hm=fa6fe39afa4706d8bfb546726cae07384388f8af1361d7a716751c3651b877a7&=&format=webp&quality=lossless",
"메이": "https://media.discordapp.net/attachments/1385523931577843842/1385528534033895505/wedco5kv.png?ex=68566580&is=68551400&hm=4c4812913b583a33fa21821889f7aee4d330606bf39b0523fcb6ef248acfc701&=&format=webp&quality=lossless",
"메르시": "https://media.discordapp.net/attachments/1385523931577843842/1385528534524760074/7z5sfio8.png?ex=68566580&is=68551400&hm=665b6ebcb749ba9ce031fa89c05b840ded35c59a7bb33f7513728590db2b2890&=&format=webp&quality=lossless",
"리퍼": "https://media.discordapp.net/attachments/1385523931577843842/1385528535069884466/o54oytk2.png?ex=68566580&is=68551400&hm=72cb99590960ba465f63f6a2272553bf83f83a3040b66adb0dde6d8a9f45bdfd&=&format=webp&quality=lossless",
"루시우": "https://media.discordapp.net/attachments/1385523931577843842/1385528535602434108/tr0s6x2f.png?ex=68566580&is=68551400&hm=2d012a66fda916b4948097b872251eb938bfbee8a3fb3c89b3ba35d13aafd5b9&=&format=webp&quality=lossless",
"로드호그": "https://media.discordapp.net/attachments/1385523931577843842/1385528535963275315/vb9vclj9.png?ex=68566580&is=68551400&hm=13cbc0bebb0a88d5165d11fc5d0f255e6258bb5b894436335836383c21b9dec2&=&format=webp&quality=lossless",
"에코": "https://media.discordapp.net/attachments/1385523931577843842/1385528531450204160/y2tnlggs.png?ex=6856657f&is=685513ff&hm=ac44c4b19f4910d25c7cfb8df8cb224ba1113e7cb02e38cb7e852e2d4f68ff85&=&format=webp&quality=lossless",
"시그마": "https://media.discordapp.net/attachments/1385523931577843842/1385528570583187498/qh59k12d.png?ex=68566589&is=68551409&hm=f339c367dd815b294902e83f78cef5093f6061a3b95fa33010361b7476003077&=&format=webp&quality=lossless",
"바티스트": "https://media.discordapp.net/attachments/1385523931577843842/1385528570851364977/b4x0850l.png?ex=68566589&is=68551409&hm=6e1d07d0b63c631cba19242f8eb421c769bcfd589373fc00d96dad028cb93fe2&=&format=webp&quality=lossless",
"애쉬": "https://media.discordapp.net/attachments/1385523931577843842/1385528571120058409/3ktm6cdd.png?ex=68566589&is=68551409&hm=b27103298945c44d9fe62f79c5e3ed5e6eee12e3c35e5440d77e13a600e78be6&=&format=webp&quality=lossless",
"래킹볼": "https://media.discordapp.net/attachments/1385523931577843842/1385528563305807983/6lsgcoh2.png?ex=68566587&is=68551407&hm=0ea4f44430780fdbf3c35a593aac6e4f91c06540070c39719036b9a46b4b4e6c&=&format=webp&quality=lossless",
"브리기테": "https://media.discordapp.net/attachments/1385523931577843842/1385528563582898288/yotyf05n.png?ex=68566587&is=68551407&hm=fc0116c21dd2a66a31f43512993ffb7cf2fa8c658aef04ddd1476b0072692ce2&=&format=webp&quality=lossless",
"모이라": "https://media.discordapp.net/attachments/1385523931577843842/1385528563893272626/3ixt5ijg.png?ex=68566587&is=68551407&hm=bba89221898363d8b4b325bffe0bb3276f1e96541a28976636d804039241999d&=&format=webp&quality=lossless",
"둠피스트": "https://media.discordapp.net/attachments/1385523931577843842/1385528564182417438/w7wy7szh.png?ex=68566587&is=68551407&hm=18bd1b7ca23b87713210edde873fdb448225c1fba914ca4b2db4baab5ca99bb6&=&format=webp&quality=lossless",
"오리사": "https://media.discordapp.net/attachments/1385523931577843842/1385528564505382952/uvv4zwz9.png?ex=68566587&is=68551407&hm=0cd94feb4fe9cfde59044558c1376049b55bd96cc3d846801030ee052703768f&=&format=webp&quality=lossless",
"라인하르트": "https://media.discordapp.net/attachments/1385523931577843842/1385528564765556736/o894263c.png?ex=68566587&is=68551407&hm=60db05be152b7be1c7eb3a7edcc646024f330c4891f538cd4794a2f505f5e8d4&=&format=webp&quality=lossless",
"솜브라": "https://media.discordapp.net/attachments/1385523931577843842/1385528565038190632/7u1hgi35.png?ex=68566587&is=68551407&hm=d014248660772cac2587e3aa012a0521a0af1e68404ae26acff7e80217433a2d&=&format=webp&quality=lossless",
"아나": "https://media.discordapp.net/attachments/1385523931577843842/1385528587892818010/bzmhm8kw.png?ex=6856658d&is=6855140d&hm=9e4520421949b477ae8fa662160108712de81135a6fc3917a2a789aeb5abf428&=&format=webp&quality=lossless",
"디바": "https://media.discordapp.net/attachments/1385523931577843842/1385528588119576678/c0vtqqzp.png?ex=6856658d&is=6855140d&hm=a81ff4ed82ecfe200c2b54567b562104bd4c3562a9547858420c67a813f2c3b8&=&format=webp&quality=lossless"
};

const baseStats = {
  hp: 120,
  attack: 35,
  defense: 10,
  crit: 0.20,
};

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}
function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}
function loadAdventure() {
  if (!fs.existsSync(adventurePath)) fs.writeFileSync(adventurePath, "{}");
  return JSON.parse(fs.readFileSync(adventurePath, "utf8"));
}
function saveAdventure(data) {
  fs.writeFileSync(adventurePath, JSON.stringify(data, null, 2));
}

function randomHero(stage) {
  return overwatchHeroes[(stage - 1) % overwatchHeroes.length];
}
function makeStageReward(stage) {
  return Math.floor(30 + stage * 2.2);
}
function makeHPBar(cur, max, len = 18, color = 'green') {
  const rate = Math.max(0, Math.min(1, cur / max));
  const blocks = Math.round(rate * len);
  const bar = (color === 'red' ? "🟥" : "🟩").repeat(blocks) + "⬛".repeat(len - blocks);
  return `\`${bar}\``;
}
function calcCritDamage(base, isCrit) {
  return isCrit ? Math.floor(base * (1.4 + Math.random() * 0.3)) : base;
}
function calcDamage(atk, pen, enemyDef) {
  let eff = 1 + Math.min(Math.max((pen - enemyDef) / (enemyDef + 30), 0), 1.0) * 1.0;
  let base = Math.floor(atk * eff * 0.9 + Math.random() * 8);
  return base;
}

function getHeroStats(stage, hero) {
  let baseAtk = 24 + Math.floor(stage * 3.5);
  let baseHp = 80 + Math.floor(stage * 23);
  let baseDef = 7 + Math.floor(stage * 0.8);
  let baseCrit = 0.17 + Math.random() * 0.10;

  // 보스(10단계마다, 랜덤 영웅)의 경우 능력치 상승
  if (stage % 10 === 0) {
    baseAtk *= 2.5;
    baseHp *= 2.4;
    baseDef *= 2.2;
    baseCrit = 0.3 + Math.random() * 0.17;
  }

  return {
    name: hero,
    attack: Math.floor(baseAtk),
    hp: Math.floor(baseHp),
    defense: Math.floor(baseDef),
    crit: baseCrit,
    image: heroImages[hero] || null,
  };
}

function getUserData(userId) {
  let data = loadData();
  if (!data[userId]) {
    data[userId] = {
      stage: 1,
      hp: baseStats.hp,
      stat: { ...baseStats },
      levelup: 0,
      clear: 0,
      reward: 0,
      inBattle: false,
    };
    saveData(data);
  }
  return data[userId];
}
function saveUserData(userId, userData) {
  let data = loadData();
  data[userId] = userData;
  saveData(data);
}

function makeGenjiEmbedRow(user, enemy, showBattleBtn, isClear, isFirst = false, defeat = false, levelUp = false) {
  let embed = new EmbedBuilder();
  if (isFirst) {
    embed
      .setTitle("🌌 [겐지의 모험 시작!]")
      .setDescription("**겐지의 전설이 시작된다! 스테이지를 올라가며 오버워치 모든 영웅과 대결하자!**")
      .addFields(
        { name: "스테이지", value: `${user.stage}`, inline: true },
        { name: "내 체력", value: `${user.hp} / ${user.stat.hp}`, inline: true },
        { name: "공격력", value: `${user.stat.attack}`, inline: true },
        { name: "방어력", value: `${user.stat.defense}`, inline: true },
        { name: "크리 확률", value: `${(user.stat.crit*100).toFixed(1)}%`, inline: true },
      )
      .setThumbnail(heroImages["겐지"])
      .setColor(0x3ba55d)
      .setFooter({ text: "진입 시 스테이지가 시작됩니다." });
    return {
      embed,
      row: new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("genji-start").setLabel("진입!").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("genji-escape").setLabel("포기").setStyle(ButtonStyle.Secondary)
      )
    };
  }
  if (defeat) {
    embed.setTitle(`😵 패배!`)
      .setDescription(`전투에서 패배하여 **스테이지가 1로 초기화**됩니다.\n다시 도전해 명예를 되찾으세요!`)
      .setColor(0xce2e2e)
      .setFooter({ text: "도전 종료" })
      .setThumbnail(heroImages["겐지"]);
    return { embed, row: null };
  }
  if (levelUp) {
    embed.setTitle("🎉 레벨업! 능력치를 선택하세요!")
      .setDescription("스테이지를 클리어하여 겐지가 더 강해집니다! 원하는 능력치를 선택하세요.")
      .addFields(
        { name: "현재 능력치", value: `체력: ${user.stat.hp} / 공격력: ${user.stat.attack} / 방어력: ${user.stat.defense} / 크리: ${(user.stat.crit*100).toFixed(1)}%` }
      )
      .setThumbnail(heroImages["겐지"])
      .setColor(0xf8c300);
    let row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("stat-hp").setLabel("체력 +15").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("stat-attack").setLabel("공격력 +5").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("stat-defense").setLabel("방어력 +3").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("stat-crit").setLabel("크리티컬 +2%").setStyle(ButtonStyle.Secondary)
    );
    return { embed, row };
  }

  embed
    .setTitle(`⚔️ [스테이지 ${user.stage}] ${enemy.name} 등장!`)
    .addFields(
      { name: "내 체력", value: makeHPBar(user.hp, user.stat.hp, 18, "green"), inline: false },
      { name: "\u200B", value: `**${user.hp} / ${user.stat.hp}**`, inline: false },
      { name: `${enemy.name} 체력`, value: makeHPBar(enemy.hp, enemy.hpmax, 18, "red"), inline: false },
      { name: "\u200B", value: `**${enemy.hp} / ${enemy.hpmax}**`, inline: false },
    )
    .setColor(0x2986cc)
    .setFooter({ text: "선택지에 따라 전황이 바뀔 수 있음!" });
  if (heroImages["겐지"]) embed.setThumbnail(heroImages["겐지"]);
  if (enemy.image) embed.setImage(enemy.image);
  let row;
  if (showBattleBtn) {
    row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("genji-attack").setLabel("공격!").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("genji-shuriken").setLabel("수리검").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("genji-dash").setLabel("질풍참(확률)").setStyle(ButtonStyle.Success)
    );
  } else if (isClear) {
    row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("genji-next-stage").setLabel("다음 스테이지!").setStyle(ButtonStyle.Success)
    );
  } else {
    row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("genji-start").setLabel("맞서 싸운다!").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("genji-escape").setLabel("포기").setStyle(ButtonStyle.Secondary)
    );
  }
  return { embed, row };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("겐지키우기")
    .setDescription("오버워치 모든 영웅과 1:1! 겐지의 모험이 시작된다!"),
  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      let data = loadData();
      let user = getUserData(userId);

      // 새로 시작/중간 진행 여부 체크
      let isFirst = !user.inBattle || !user.enemy;

      // 현재 적 세팅
      if (!user.enemy || user.enemy.stage !== user.stage) {
        const enemyName = randomHero(user.stage);
        const enemyStats = getHeroStats(user.stage, enemyName);
        user.enemy = {
          name: enemyStats.name,
          hp: enemyStats.hp,
          hpmax: enemyStats.hp,
          attack: enemyStats.attack,
          defense: enemyStats.defense,
          crit: enemyStats.crit,
          image: enemyStats.image,
          stage: user.stage,
        };
        user.hp = user.stat.hp;
        user.inBattle = false;
        saveUserData(userId, user);
      }

      let { embed, row } = makeGenjiEmbedRow(user, user.enemy, false, false, true);
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

      const filter = i => i.user.id === userId &&
        ["genji-start", "genji-escape", "genji-attack", "genji-shuriken", "genji-dash", "genji-next-stage", "stat-hp", "stat-attack", "stat-defense", "stat-crit"].includes(i.customId);

      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({ filter, time: 90000 });

      collector.on("collect", async i => {
        collector.resetTimer();
        let lock;
        try {
          lock = await lockfile.lock(dataPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
          data = loadData();
          user = data[userId];
          if (!user) user = getUserData(userId);

          // 포기시
          if (i.customId === "genji-escape") {
            user.inBattle = false;
            user.stage = 1;
            user.hp = baseStats.hp;
            saveUserData(userId, user);
            return await i.update({
              content: "포기...! `/겐지키우기`로 다시 도전해!",
              embeds: [],
              components: [],
              ephemeral: true
            });
          }
          // 진입
          if (i.customId === "genji-start") {
            user.inBattle = true;
            user.hp = user.stat.hp;
            saveUserData(userId, user);
            let { embed, row } = makeGenjiEmbedRow(user, user.enemy, true, false);
            return await i.update({ embeds: [embed], components: [row], ephemeral: true });
          }
          // 전투
          if (["genji-attack", "genji-shuriken", "genji-dash"].includes(i.customId)) {
            let log = "";
            let playerDmg = 0, enemyDmg = 0, playerCrit = false, enemyCrit = false;

            if (i.customId === "genji-attack") {
              playerCrit = Math.random() < user.stat.crit;
              playerDmg = calcCritDamage(
                calcDamage(user.stat.attack, 0, user.enemy.defense),
                playerCrit
              );
              user.enemy.hp -= playerDmg;
              log += playerCrit ? `💥 크리티컬! ${playerDmg} 피해!` : `${playerDmg} 피해를 입혔어!\n`;
            }
            else if (i.customId === "genji-shuriken") {
              // 수리검은 방어 무시, 낮은 피해, 크리 증가
              playerCrit = Math.random() < (user.stat.crit + 0.15);
              playerDmg = calcCritDamage(
                Math.floor(user.stat.attack * 0.6 + Math.random()*6), playerCrit
              );
              user.enemy.hp -= playerDmg;
              log += playerCrit ? `🔪 수리검 크리! ${playerDmg} 피해!` : `수리검 ${playerDmg} 피해!`;
            }
            else if (i.customId === "genji-dash") {
              // 질풍참: 35% 확률 즉사/실패시 피해받음
              if (Math.random() < 0.35) {
                user.enemy.hp = 0;
                log += "⚡️ 질풍참! 적을 한방에 베었다!";
              } else {
                enemyDmg = Math.floor(user.enemy.attack * 1.25 + Math.random()*9);
                user.hp -= enemyDmg;
                log += `❌ 질풍참 실패! 역공으로 ${enemyDmg} 피해를 입었다!`;
              }
            }

            // 적 반격 (적 살아있으면)
            if (user.enemy.hp > 0 && i.customId !== "genji-dash") {
              enemyCrit = Math.random() < user.enemy.crit;
              enemyDmg = calcCritDamage(
                calcDamage(user.enemy.attack, 0, user.stat.defense),
                enemyCrit
              );
              user.hp -= enemyDmg;
              log += "\n" + (enemyCrit ? `적 크리! ${enemyDmg} 피해 입음!` : `적 반격 ${enemyDmg} 피해!`);
            }
            if (user.hp < 0) user.hp = 0;
            if (user.enemy.hp < 0) user.enemy.hp = 0;

            // 패배
            if (user.hp <= 0) {
  user.inBattle = false;
  user.stage = 1;
  user.hp = baseStats.hp;
  user.stat = { ...baseStats };   // 스탯 초기화!
  saveUserData(userId, user);
  let { embed } = makeGenjiEmbedRow(user, user.enemy, false, false, false, true);
  return await i.update({
    content: `😵 겐지 패배!`,
    embeds: [embed],
    components: [],
    ephemeral: true
  });
}

            // === 적 처치 ===
if (user.enemy.hp <= 0) {
  user.inBattle = false;
  user.clear += 1;
  user.reward += makeStageReward(user.stage);
  user.stage += 1;
  user.levelup = true;     
  saveUserData(userId, user);
  let { embed, row } = makeGenjiEmbedRow(user, user.enemy, false, true, false, false, true);
  return await i.update({
    content: `🎉 ${user.enemy.name} 격파!\n${log}`,
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}


            saveUserData(userId, user);
            let { embed, row } = makeGenjiEmbedRow(user, user.enemy, true, false);
            return await i.update({
              content: log,
              embeds: [embed],
              components: [row],
              ephemeral: true
            });
          }
          // 다음 스테이지
          if (i.customId === "genji-next-stage") {
            user.stage += 1;
            user.inBattle = false;
            // 능력치 성장 기회
            let { embed, row } = makeGenjiEmbedRow(user, user.enemy, false, false, false, false, true);
            return await i.update({
              embeds: [embed],
              components: [row],
              ephemeral: true
            });
          }
         // === 능력치 성장 선택 ===
if (["stat-hp", "stat-attack", "stat-defense", "stat-crit"].includes(i.customId)) {
  if (i.customId === "stat-hp") user.stat.hp += 15;
  if (i.customId === "stat-attack") user.stat.attack += 5;
  if (i.customId === "stat-defense") user.stat.defense += 3;
  if (i.customId === "stat-crit") user.stat.crit += 0.02;
  user.inBattle = false;
  user.levelup = false;
  // ***다음 적 생성!***
  const enemyName = randomHero(user.stage);
  const enemyStats = getHeroStats(user.stage, enemyName);
  user.enemy = {
    name: enemyStats.name,
    hp: enemyStats.hp,
    hpmax: enemyStats.hp,
    attack: enemyStats.attack,
    defense: enemyStats.defense,
    crit: enemyStats.crit,
    image: enemyStats.image,
    stage: user.stage,
  };
  user.hp = user.stat.hp;
  user.inBattle = true;
  saveUserData(userId, user);
  let { embed, row } = makeGenjiEmbedRow(user, user.enemy, true, false);
  return await i.update({ embeds: [embed], components: [row], ephemeral: true });
}
        } finally {
          if (lock) try { await lock(); } catch { }
        }
      });

      collector.on("end", async () => {
        try {
          await msg.edit({ components: [] });
        } catch { }
      });
    } catch (err) {
      console.error('[겐지키우기 명령 실행 오류]', err);
      try {
        await interaction.reply({
          content: '❌ [겐지키우기] 실행 중 오류가 발생했습니다.\n' + (err?.message || ''),
          ephemeral: true
        });
      } catch (e) {
        try {
          await interaction.followUp({
            content: '❌ [겐지키우기] 실행 중 오류가 발생했습니다.\n' + (err?.message || ''),
            ephemeral: true
          });
        } catch { }
      }
    }
  }
};
