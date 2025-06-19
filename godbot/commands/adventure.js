// 📁 adventure.js (체력통+피해량 UI + 기능/버튼명 개선)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const { getBE, addBE } = require("./be-util");

const dataPath = path.join(__dirname, "../data/champion-users.json");
const adventurePath = path.join(__dirname, "../data/adventure.json");
const adventureBestPath = path.join(__dirname, "../data/adventure-best.json");
const championList = require("../utils/champion-data");
const passiveSkills = require("../utils/passive-skills");

const monsterStageList = [
  "전사 미니언", "마법사 미니언", "공성 미니언", "슈퍼 미니언", "칼날부리", "어스름 늑대", "심술 두꺼비",
  "고대 돌거북", "푸른 파수꾼", "붉은 덩굴정령", "협곡의 전령"
];
const dragonList = [
  "바람의 드래곤", "대지의 드래곤", "화염의 드래곤", "바다의 드래곤", "마법공학 드래곤", "화학공학 드래곤", "장로 드래곤"
];
const boss50 = "고통의 아타칸";
const boss100 = "내셔 남작";

// 몬스터 등장 하단 이미지 (요청 이미지 모두 반영)
const MONSTER_SCENE_IMAGES = {
  "전사 미니언": "https://media.discordapp.net/attachments/1385176420132720640/1385259194017386546/r2d7x5mx.png?format=webp&quality=lossless&width=1452&height=817",
  "마법사 미니언": "https://media.discordapp.net/attachments/1385176420132720640/1385259194017386546/r2d7x5mx.png?format=webp&quality=lossless&width=1452&height=817",
  "공성 미니언": "https://media.discordapp.net/attachments/1385176420132720640/1385259194017386546/r2d7x5mx.png?format=webp&quality=lossless&width=1452&height=817",
  "슈퍼 미니언": "https://media.discordapp.net/attachments/1385176420132720640/1385259194017386546/r2d7x5mx.png?format=webp&quality=lossless&width=1452&height=817",
  "칼날부리": "https://media.discordapp.net/attachments/1385176420132720640/1385259198010359848/4luxxlq6.png?format=webp&quality=lossless",
  "어스름 늑대": "https://media.discordapp.net/attachments/1385176420132720640/1385259197440196679/rl2tbwpo.png?format=webp&quality=lossless&width=1452&height=817",
  "심술 두꺼비": "https://media.discordapp.net/attachments/1385176420132720640/1385259197033091112/a8l1ef8e.png?format=webp&quality=lossless",
  "고대 돌거북": "https://media.discordapp.net/attachments/1385176420132720640/1385259196504871072/jk88st8q.png?format=webp&quality=lossless&width=1452&height=817",
  "푸른 파수꾼": "https://media.discordapp.net/attachments/1385176420132720640/1385259195993030767/zri3vgfk.png?format=webp&quality=lossless",
  "붉은 덩굴정령": "https://media.discordapp.net/attachments/1385176420132720640/1385259195548569630/pkfayxaw.png?format=webp&quality=lossless",
  "협곡의 전령": "https://media.discordapp.net/attachments/1385176420132720640/1385259194927681577/fjylch7n.png?format=webp&quality=lossless&width=1451&height=817",
  
  "바람의 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176745316978730/34d295bcd86ade45.png?format=webp&quality=lossless",
  "대지의 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176745006596106/3c5ce8c8b66c6954.png?format=webp&quality=lossless",
  "화염의 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176709577576458/29563bc6fbd6a7f8.png?format=webp&quality=lossless",
  "바다의 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176708445110373/bdc4f796fd5dedfe.png?format=webp&quality=lossless&width=1575&height=788",
  "마법공학 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176538609356860/41f7ff067af56f32.png?format=webp&quality=lossless",
  "화학공학 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176537602719786/6e375cf5879766ac.png?format=webp&quality=lossless&width=1575&height=788",
  
  "장로 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176536440639488/968c59724143fd8a.png?format=webp&quality=lossless",
  
  "고통의 아타칸": "https://media.discordapp.net/attachments/1385176420132720640/1385176535492989048/df5e905d6dfd2336.png?format=webp&quality=lossless",
  "내셔 남작": "https://media.discordapp.net/attachments/1385176420132720640/1385176539473117304/e3a3a8c0b4769b05.png?format=webp&quality=lossless",
};

const MONSTER_IMAGES = {
  "전사 미니언": "https://media.discordapp.net/attachments/1385176420132720640/1385176708080078950/c903a38d06fa65f8.png?format=webp&quality=lossless",
  "마법사 미니언": "https://media.discordapp.net/attachments/1385176420132720640/1385176707815968898/5b8460849fd61cbf.png?format=webp&quality=lossless",
  "공성 미니언": "https://media.discordapp.net/attachments/1385176420132720640/1385176707509780562/5128ae658c32179c.png?format=webp&quality=lossless",
  "슈퍼 미니언": "https://media.discordapp.net/attachments/1385176420132720640/1385176707048411208/82ace8a93659dfe8.png?format=webp&quality=lossless",
  "칼날부리": "https://media.discordapp.net/attachments/1385176420132720640/1385176744721649785/645ddab3cea19e54.png?format=webp&quality=lossless",
  "어스름 늑대": "https://media.discordapp.net/attachments/1385176420132720640/1385176744469729352/dca421188a42c7bd.png?format=webp&quality=lossless",
  "심술 두꺼비": "https://media.discordapp.net/attachments/1385176420132720640/1385176744230912091/2ef8129dc9b588d1.png?format=webp&quality=lossless",
  "고대 돌거북": "https://media.discordapp.net/attachments/1385176420132720640/1385176743903625246/9087881cd299f0fa.png?format=webp&quality=lossless",
  "푸른 파수꾼": "https://media.discordapp.net/attachments/1385176420132720640/1385176743572279296/daddcc27415794b0.png?format=webp&quality=lossless",
  "붉은 덩굴정령": "https://media.discordapp.net/attachments/1385176420132720640/1385176743312359434/380002f988b1d5ea.png?format=webp&quality=lossless",
  "협곡의 전령": "https://media.discordapp.net/attachments/1385176420132720640/1385176743056510986/0bc2ec1f104562bf.png?format=webp&quality=lossless",
  "바람의 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176742657790102/ecf871759ecc50ac.png?format=webp&quality=lossless",
  "대지의 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176709824909353/1d81730bb41b4b07.png?format=webp&quality=lossless",
  "화염의 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176709296554005/55fe09766b0b1fc5.png?format=webp&quality=lossless",
  "바다의 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176708960878632/e766e854b8fd146d.png?format=webp&quality=lossless",
  "마법공학 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176539028652062/aa5f72454cff37ec.png?format=webp&quality=lossless",
  "화학공학 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176538223476776/e10866e9e5cff78c.png?format=webp&quality=lossless",
  "장로 드래곤": "https://media.discordapp.net/attachments/1385176420132720640/1385176536805675068/6d0d13f9c623cb09.png?format=webp&quality=lossless",
  "고통의 아타칸": "https://media.discordapp.net/attachments/1385176420132720640/1385176535908093984/8965fd3ee9998af3.png?format=webp&quality=lossless",
  "내셔 남작": "https://media.discordapp.net/attachments/1385176420132720640/1385176535081680937/aac00404cf0ce8ef.png?format=webp&quality=lossless",
};
// 몬스터별 하단 이미지 적용
function getMonsterImage(monster, stage) {
  let sceneUrl = MONSTER_SCENE_IMAGES[monster];
  let monsterUrl = MONSTER_IMAGES[monster];
  return [monsterUrl, sceneUrl];
}

function getMonsterByStage(stage) {
  if (stage % 100 === 0) return boss100;
  if (stage % 50 === 0) return boss50;
  if (stage % 10 === 0) return dragonList[Math.floor((stage / 10 - 1) % dragonList.length)];
  const idx = Math.floor(Math.random() * monsterStageList.length);
  return monsterStageList[idx];
}

function getMonsterByStage(stage) {
  if (stage % 100 === 0) return boss100;
  if (stage % 50 === 0) return boss50;
  if (stage % 10 === 0) return dragonList[Math.floor((stage / 10 - 1) % dragonList.length)];
  const idx = Math.floor(Math.random() * monsterStageList.length);
  return monsterStageList[idx];
}
function getMonsterStats(stage, monster) {
  let baseAtk = 8 + Math.floor(stage * 1.8);
  let baseHp = 50 + Math.floor(stage * 18);
  let baseDef = 3 + Math.floor(stage * 0.6);
  let basePen = Math.floor(stage / 6);
  let baseCrit = 0.15;
  if (dragonList.includes(monster)) {
    baseAtk *= 3.3; baseHp *= 6.3; baseDef *= 2.1; basePen *= 2.1; baseCrit = 0.27;
    if (monster === "장로 드래곤") { baseAtk *= 1.3; baseHp *= 1.25; }
  }
  if (monster === boss50) { baseAtk *= 10; baseHp *= 18; baseDef *= 7.7; basePen *= 2.5; baseCrit = 0.32; }
  if (monster === boss100) { baseAtk *= 18; baseHp *= 40; baseDef *= 13; basePen *= 3.8; baseCrit = 0.40; }
  return {
    name: monster,
    attack: Math.floor(baseAtk),
    hp: Math.floor(baseHp),
    defense: Math.floor(baseDef),
    penetration: Math.floor(basePen),
    crit: baseCrit
  };
}
function getMonsterImage(monster, stage) {
  let sceneUrl = MONSTER_SCENE_IMAGES;
  let monsterUrl = MONSTER_IMAGES[monster] || MONSTER_SCENE_IMAGES;
  return [monsterUrl, sceneUrl];
}
function loadUserChampion(userId) {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  return data[userId];
}
function loadAdventure() {
  if (!fs.existsSync(adventurePath)) fs.writeFileSync(adventurePath, "{}");
  return JSON.parse(fs.readFileSync(adventurePath, "utf8"));
}
function saveAdventure(data) {
  fs.writeFileSync(adventurePath, JSON.stringify(data, null, 2));
}
function makeStageReward(stage) {
  return Math.floor(25 + stage * 0.7);
}
function formatNumber(num) {
  return num.toLocaleString("ko-KR");
}
function calcCritDamage(base, isCrit) {
  return isCrit ? Math.floor(base * (1.4 + Math.random() * 0.25)) : base;
}
function calcDamage(atk, pen, enemyDef, enemyHp) {
  let eff = 1 + Math.min(Math.max((pen - enemyDef) / (enemyDef + 35), 0), 1) * 1.0;
  let base = Math.floor(atk * eff * 0.92 + Math.random() * 6);
  return base;
}

// 체력바(유니코드 블록) 생성 함수
function makeHPBar(cur, max, len = 15, color = 'green') {
  const rate = Math.max(0, Math.min(1, cur / max));
  const blocks = Math.round(rate * len);
  const bar = (color === 'red' ? "🟥" : "🟩").repeat(blocks) + "⬛".repeat(len - blocks);
  return `\`${bar}\` ${cur} / ${max}`;
}

// embed + row 만들기 함수
function makeAdventureEmbedRow(userAdv, champ, monsterStats, showBattleBtn, isClear) {
  const [monsterImg, sceneImg] = getMonsterImage(userAdv.monster.name, userAdv.stage);
  const isNamed = dragonList.includes(userAdv.monster.name) || [boss50, boss100].includes(userAdv.monster.name);
  let monsterMsg = "";
  if (userAdv.monster.name === boss50) monsterMsg = "나의 고통을 느껴라...!";
  if (userAdv.monster.name === boss100) monsterMsg = "나를 쓰러뜨릴 수 있나?";
  if (dragonList.includes(userAdv.monster.name)) monsterMsg = `${userAdv.monster.name}이(가) 강림했다!`;

  const embed = new EmbedBuilder()
    .setTitle(`🌌 [스테이지 ${userAdv.stage}] ${userAdv.monster.name} 출현`)
    .setFields(
      { name: "내 챔피언", value: champ.name, inline: true },
      { name: "내 체력", value: makeHPBar(userAdv.hp, champ.stats.hp, 15, "green"), inline: false },
      { name: "몬스터 체력", value: makeHPBar(userAdv.monster.hp, monsterStats.hp, 15, "red"), inline: false }
    )
    .setColor(isNamed ? 0xe67e22 : 0x2986cc)
    .setFooter({ text: `토벌 실패 시 강화레벨 감소` });
  if (monsterImg) embed.setThumbnail(monsterImg);
  if (sceneImg) embed.setImage(sceneImg);
  if (monsterMsg) embed.setDescription(`**${monsterMsg}**`);

  let row;
  if (showBattleBtn) {
    row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("adventure-attack").setLabel("공격!").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("adventure-strong").setLabel("강공격 시도").setStyle(ButtonStyle.Danger)
    );
  } else if (isClear) {
    row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("adventure-next-stage").setLabel("다음 스테이지 계속하기").setStyle(ButtonStyle.Success)
    );
  } else {
    row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("adventure-start").setLabel("맞서 싸운다!").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("adventure-escape").setLabel("다음에 상대하기").setStyle(ButtonStyle.Secondary)
    );
  }
  return { embed, row };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("모험")
    .setDescription("무한 스테이지 몬스터를 상대하며 끝없이 도전!"),
  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      let adv = loadAdventure();
      if (!adv[userId]) {
        adv[userId] = {
          stage: 1,
          hp: null,
          reward: 0,
          clear: 0,
          inBattle: false,
          monster: null
        };
      }
      let userAdv = adv[userId];

      const champ = loadUserChampion(userId);
      if (!champ || !champ.name) {
        delete adv[userId]; saveAdventure(adv);
        return interaction.reply({ content: "❌ 챔피언이 없습니다! `/챔피언획득`으로 먼저 획득해줘!", ephemeral: true });
      }
      const championBase = championList.find(c => c.name === champ.name);
      champ.stats = champ.stats || { ...championBase.stats };

      // 몬스터 생성
      if (!userAdv.monster || !userAdv.monster.name || typeof userAdv.monster.hp !== "number") {
        const monsterName = getMonsterByStage(userAdv.stage);
        const monsterStat = getMonsterStats(userAdv.stage, monsterName);
        userAdv.monster = { name: monsterName, hp: monsterStat.hp };
        userAdv.hp = champ.stats.hp;
        userAdv.inBattle = false;
        saveAdventure(adv);
      }

      const monsterStats = getMonsterStats(userAdv.stage, userAdv.monster.name);

      // embed+row 구성
      const { embed, row } = makeAdventureEmbedRow(userAdv, champ, monsterStats, userAdv.inBattle, false);

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

      // 콜렉터
      const filter = i => i.user.id === userId &&
        ["adventure-start", "adventure-escape", "adventure-attack", "adventure-strong", "adventure-next-stage"].includes(i.customId);

      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

      collector.on("collect", async i => {
        let advLock;
        try {
          advLock = await lockfile.lock(adventurePath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
          adv = loadAdventure();
          userAdv = adv[userId];
          const champ = loadUserChampion(userId);
          const monsterStats = getMonsterStats(userAdv.stage, userAdv.monster.name);

          // "임베드 1개"만 계속 갱신: 아래 전부 interaction.update만 사용!!
          if (i.customId === "adventure-escape") {
            // '다음에 상대하기' - HP, 진행상황 유지(삭제X), 단순 안내
            userAdv.inBattle = false;
            adv[userId] = userAdv; saveAdventure(adv);
            return await i.update({
              content: "💤 해당 스테이지는 '다음에' 이어서 계속할 수 있어! 언제든 `/모험` 명령어로 재도전해!",
              embeds: [],
              components: [],
              ephemeral: true
            });
          }

          if (i.customId === "adventure-start") {
            userAdv.inBattle = true;
            userAdv.hp = champ.stats.hp;
            adv[userId] = userAdv; saveAdventure(adv);

            const { embed, row } = makeAdventureEmbedRow(userAdv, champ, monsterStats, true, false);
            return await i.update({ embeds: [embed], components: [row], ephemeral: true });
          }

          if (i.customId === "adventure-next-stage") {
            userAdv.stage += 1;
            const monsterName = getMonsterByStage(userAdv.stage);
            const monsterStat = getMonsterStats(userAdv.stage, monsterName);
            userAdv.monster = { name: monsterName, hp: monsterStat.hp };
            userAdv.hp = champ.stats.hp;
            userAdv.inBattle = false;
            adv[userId] = userAdv; saveAdventure(adv);

            const { embed, row } = makeAdventureEmbedRow(userAdv, champ, monsterStat, false, false);
            return await i.update({ embeds: [embed], components: [row], ephemeral: true });
          }

          if (!userAdv.inBattle) return;

          if (i.customId === "adventure-attack") {
            let crit = Math.random() < 0.25;
            let dmg = calcDamage(
              champ.stats.attack >= champ.stats.ap ? champ.stats.attack : champ.stats.ap,
              champ.stats.penetration, monsterStats.defense, userAdv.monster.hp
            );
            dmg = calcCritDamage(dmg, crit);
            userAdv.monster.hp -= dmg;
            let resultMsg = crit ? `💥 크리티컬! ${dmg} 피해를 입혔어!\n` : `내가 ${dmg} 피해를 입혔어!\n`;

            let mdmg = 0, mCrit = false;
            if (userAdv.monster.hp > 0) {
              mCrit = Math.random() < monsterStats.crit;
              mdmg = calcCritDamage(
                calcDamage(monsterStats.attack, monsterStats.penetration, champ.stats.defense, userAdv.hp),
                mCrit
              );
              userAdv.hp -= mdmg;
              if (mCrit) resultMsg += `몬스터 크리티컬! `;
              resultMsg += `몬스터에게 ${mdmg} 피해를 받았어!`;
            } else {
              userAdv.monster.hp = 0;
            }

            // 패배 체크
            if (userAdv.hp <= 0) {
              userAdv.hp = 0;
              userAdv.inBattle = false;
              delete adv[userId]; saveAdventure(adv);
              if (fs.existsSync(dataPath)) {
                let cd = JSON.parse(fs.readFileSync(dataPath, "utf8"));
                if (cd[userId]) {
                  cd[userId].level = Math.max((cd[userId].level || 1) - 1, 1);
                  fs.writeFileSync(dataPath, JSON.stringify(cd, null, 2));
                }
              }
              return await i.update({
                content: `😵 패배!`,
                embeds: [new EmbedBuilder().setDescription(`강화 단계가 1 하락했습니다.`)],
                components: [],
                ephemeral: true
              });
            }

            // 몬스터 처치
            if (userAdv.monster.hp <= 0) {
              userAdv.inBattle = false;
              userAdv.hp = champ.stats.hp;
              userAdv.clear += 1;

              let reward = (userAdv.stage % 10 === 0) ? makeStageReward(userAdv.stage) : 0;
              userAdv.reward += reward;
              adv[userId] = userAdv; saveAdventure(adv);

              if (reward > 0) {
                await addBE(userId, reward, `[모험] ${userAdv.stage} 스테이지 클리어`);
              }
              // 계속하기 버튼만 보이게!
              const { embed, row } = makeAdventureEmbedRow(userAdv, champ, monsterStats, false, true);
              return await i.update({
                content: `🎉 ${userAdv.monster.name} 처치!`,
                embeds: [embed],
                components: [row],
                ephemeral: true
              });
            }

            adv[userId] = userAdv; saveAdventure(adv);
            const { embed, row } = makeAdventureEmbedRow(userAdv, champ, monsterStats, true, false);
            return await i.update({ content: resultMsg, embeds: [embed], components: [row], ephemeral: true });
          }

          // 강공격 시도 (30% 확률로 내 or 몬스터 강공격)
          if (i.customId === "adventure-strong") {
            let resultMsg = '';
            const rand = Math.random();
            let crit = false, dmg = 0, mdmg = 0, mCrit = false;

            if (rand < 0.3) {
              // 50:50으로 나/몬스터 2배 강공격
              if (Math.random() < 0.5) {
                // 내 강공격
                crit = Math.random() < 0.25;
                dmg = calcDamage(
                  champ.stats.attack >= champ.stats.ap ? champ.stats.attack : champ.stats.ap,
                  champ.stats.penetration, monsterStats.defense, userAdv.monster.hp
                );
                dmg = calcCritDamage(dmg, crit) * 2;
                userAdv.monster.hp -= dmg;
                resultMsg = `🔥 **강공격 성공!** ${dmg} 피해를 입혔어!${crit ? " (크리티컬!)" : ""}\n`;

                if (userAdv.monster.hp > 0) {
                  mCrit = Math.random() < monsterStats.crit;
                  mdmg = calcCritDamage(
                    calcDamage(monsterStats.attack, monsterStats.penetration, champ.stats.defense, userAdv.hp),
                    mCrit
                  );
                  userAdv.hp -= mdmg;
                  if (mCrit) resultMsg += `몬스터 크리티컬! `;
                  resultMsg += `몬스터에게 ${mdmg} 피해를 받았어!`;
                } else {
                  userAdv.monster.hp = 0;
                }
              } else {
                // 몬스터 강공격
                crit = Math.random() < 0.25;
                dmg = calcDamage(
                  champ.stats.attack >= champ.stats.ap ? champ.stats.attack : champ.stats.ap,
                  champ.stats.penetration, monsterStats.defense, userAdv.monster.hp
                );
                userAdv.monster.hp -= dmg;
                resultMsg = `내가 ${dmg} 피해를 입혔어!\n`;

                // 몬스터 2배 강공격
                mCrit = Math.random() < monsterStats.crit;
                mdmg = calcCritDamage(
                  calcDamage(monsterStats.attack, monsterStats.penetration, champ.stats.defense, userAdv.hp),
                  mCrit
                ) * 2;
                userAdv.hp -= mdmg;
                if (mCrit) resultMsg += `몬스터 크리티컬! `;
                resultMsg += `😱 **몬스터 강공격!** ${mdmg} 피해를 받았어!`;
              }
            } else {
              // 일반 공격(평타와 동일)
              crit = Math.random() < 0.25;
              dmg = calcDamage(
                champ.stats.attack >= champ.stats.ap ? champ.stats.attack : champ.stats.ap,
                champ.stats.penetration, monsterStats.defense, userAdv.monster.hp
              );
              dmg = calcCritDamage(dmg, crit);
              userAdv.monster.hp -= dmg;
              resultMsg = crit ? `💥 크리티컬! ${dmg} 피해를 입혔어!\n` : `내가 ${dmg} 피해를 입혔어!\n`;

              if (userAdv.monster.hp > 0) {
                mCrit = Math.random() < monsterStats.crit;
                mdmg = calcCritDamage(
                  calcDamage(monsterStats.attack, monsterStats.penetration, champ.stats.defense, userAdv.hp),
                  mCrit
                );
                userAdv.hp -= mdmg;
                if (mCrit) resultMsg += `몬스터 크리티컬! `;
                resultMsg += `몬스터에게 ${mdmg} 피해를 받았어!`;
              } else {
                userAdv.monster.hp = 0;
              }
            }

            // 패배 체크
            if (userAdv.hp <= 0) {
              userAdv.hp = 0;
              userAdv.inBattle = false;
              delete adv[userId]; saveAdventure(adv);
              if (fs.existsSync(dataPath)) {
                let cd = JSON.parse(fs.readFileSync(dataPath, "utf8"));
                if (cd[userId]) {
                  cd[userId].level = Math.max((cd[userId].level || 1) - 1, 1);
                  fs.writeFileSync(dataPath, JSON.stringify(cd, null, 2));
                }
              }
              return await i.update({
                content: `😵 패배!`,
                embeds: [new EmbedBuilder().setDescription(`강화 단계가 1 하락했습니다.`)],
                components: [],
                ephemeral: true
              });
            }

            // 몬스터 처치
            if (userAdv.monster.hp <= 0) {
              userAdv.inBattle = false;
              userAdv.hp = champ.stats.hp;
              userAdv.clear += 1;

              let reward = (userAdv.stage % 10 === 0) ? makeStageReward(userAdv.stage) : 0;
              userAdv.reward += reward;
              adv[userId] = userAdv; saveAdventure(adv);

              if (reward > 0) {
                await addBE(userId, reward, `[모험] ${userAdv.stage} 스테이지 클리어`);
              }
              // 계속하기 버튼만 보이게!
              const { embed, row } = makeAdventureEmbedRow(userAdv, champ, monsterStats, false, true);
              return await i.update({
                content: `🎉 ${userAdv.monster.name} 처치!`,
                embeds: [embed],
                components: [row],
                ephemeral: true
              });
            }

            adv[userId] = userAdv; saveAdventure(adv);
            const { embed, row } = makeAdventureEmbedRow(userAdv, champ, monsterStats, true, false);
            return await i.update({ content: resultMsg, embeds: [embed], components: [row], ephemeral: true });
          }

        } finally {
          if (advLock) try { await advLock(); } catch {}
        }
      });
    } catch (err) {
      console.error('[모험 명령 실행 오류]', err);
      try {
        await interaction.reply({
          content: '❌ [모험] 실행 중 오류가 발생했습니다.\n' + (err?.message || ''),
          ephemeral: true
        });
      } catch (e) {
        try {
          await interaction.followUp({
            content: '❌ [모험] 실행 중 오류가 발생했습니다.\n' + (err?.message || ''),
            ephemeral: true
          });
        } catch {}
      }
    }
  }
};
