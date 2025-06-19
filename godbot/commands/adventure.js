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
const ADVENTURE_SCENE_URL = "https://media.discordapp.net/attachments/1385176420132720640/1385176710126895257/00dba14c69f9c02a.png?format=webp&quality=lossless";

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
  let sceneUrl = ADVENTURE_SCENE_URL;
  let monsterUrl = MONSTER_IMAGES[monster] || ADVENTURE_SCENE_URL;
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
function loadAdventureBest() {
  if (!fs.existsSync(adventureBestPath)) fs.writeFileSync(adventureBestPath, "{}");
  return JSON.parse(fs.readFileSync(adventureBestPath, "utf8"));
}
function saveAdventureBest(data) {
  fs.writeFileSync(adventureBestPath, JSON.stringify(data, null, 2));
}
function updateBestRecord(userId, curStage, curClear) {
  const best = loadAdventureBest();
  if (!best[userId]) best[userId] = { bestStage: 0, totalClear: 0 };
  if (curStage - 1 > best[userId].bestStage) best[userId].bestStage = curStage - 1;
  if (curClear > best[userId].totalClear) best[userId].totalClear = curClear;
  saveAdventureBest(best);
}
function resetUserAdventure(userId, advObj) {
  if (advObj && advObj[userId]) {
    updateBestRecord(userId, advObj[userId].stage, advObj[userId].clear);
  }
  const adv = loadAdventure();
  delete adv[userId];
  saveAdventure(adv);
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
function makeStageReward(stage) {
  return Math.floor(25 + stage * 0.7);
}
async function checkUserChampionDeleted(userId) {
  const userChamp = loadUserChampion(userId);
  if (!userChamp || !userChamp.name) {
    const adv = loadAdventure();
    resetUserAdventure(userId, adv);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("모험")
    .setDescription("무한 스테이지 몬스터를 상대하며 끝없이 도전!"),
  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      await checkUserChampionDeleted(userId);

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
        resetUserAdventure(userId, adv);
        return interaction.reply({ content: "❌ 챔피언이 없습니다! `/챔피언획득`으로 먼저 획득해줘!", ephemeral: true });
      }
      const championBase = championList.find(c => c.name === champ.name);
      champ.stats = champ.stats || { ...championBase.stats };

      // --- 몬스터 생성 및 안전 체크 ---
      if (!userAdv.monster || userAdv.monsterReset || !userAdv.monster.name || typeof userAdv.monster.hp !== "number") {
        const monsterName = getMonsterByStage(userAdv.stage);
        const monsterStat = getMonsterStats(userAdv.stage, monsterName);
        userAdv.monster = { name: monsterName, hp: monsterStat.hp };
        userAdv.monsterReset = false;
      }
      const monsterName = userAdv.monster.name;
      const monsterStats = getMonsterStats(userAdv.stage, monsterName);

      userAdv.hp = userAdv.hp === null ? champ.stats.hp : userAdv.hp;

      const [monsterImg, sceneImg] = getMonsterImage(monsterName, userAdv.stage);
      const isNamed = dragonList.includes(monsterName) || [boss50, boss100].includes(monsterName);
      let monsterMsg = "";
      if (monsterName === boss50) monsterMsg = "나의 고통을 느껴라...!";
      if (monsterName === boss100) monsterMsg = "나를 쓰러뜨릴 수 있나?";
      if (dragonList.includes(monsterName)) monsterMsg = `${monsterName}이(가) 강림했다!`;

      let row;
      if (!userAdv.inBattle) {
        row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("adventure-start").setLabel("맞서 싸운다!").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("adventure-escape").setLabel("탈주").setStyle(ButtonStyle.Secondary)
        );
      } else {
        row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("adventure-attack").setLabel("공격!").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("adventure-dodge").setLabel("점멸(회피)").setStyle(ButtonStyle.Secondary)
        );
      }

      const descValue = isNamed ? `**${monsterMsg}**` : undefined;
      const embed = new EmbedBuilder()
        .setTitle(`🌌 [스테이지 ${userAdv.stage}] ${monsterName} 출현`)
        .setFields(
          { name: "내 챔피언", value: champ.name, inline: true },
          { name: "챔피언 HP", value: `${userAdv.hp} / ${champ.stats.hp}`, inline: true },
          { name: "몬스터 HP", value: `${userAdv.monster && userAdv.monster.hp !== undefined ? userAdv.monster.hp : monsterStats.hp} / ${monsterStats.hp}`, inline: true }
        )
        .setColor(isNamed ? 0xe67e22 : 0x2986cc)
        .setFooter({ text: `공격은 가끔 크리티컬! 점멸은 매우 낮은 확률로 회피 (운빨)` });

      if (monsterImg) embed.setThumbnail(monsterImg);
      if (sceneImg) embed.setImage(sceneImg);
      if (descValue) embed.setDescription(descValue);

      const replyFunc = interaction.replied || interaction.deferred ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction);
      await replyFunc({ embeds: [embed], components: [row], ephemeral: true });

      const filter = i => i.user.id === userId &&
        ["adventure-start", "adventure-escape", "adventure-attack", "adventure-dodge", "adventure-next-stage"].includes(i.customId);

      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

      collector.on("collect", async i => {
        let advLock;
        try {
          advLock = await lockfile.lock(adventurePath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
          adv = loadAdventure();
          userAdv = adv[userId];

          // 안전하게 몬스터 객체 체크
          if (!userAdv.monster || !userAdv.monster.name || typeof userAdv.monster.hp !== "number") {
            const monsterName = getMonsterByStage(userAdv.stage);
            const monsterStat = getMonsterStats(userAdv.stage, monsterName);
            userAdv.monster = { name: monsterName, hp: monsterStat.hp };
            userAdv.monsterReset = false;
          }
          const monsterName = userAdv.monster.name;
          const monsterStats = getMonsterStats(userAdv.stage, monsterName);

          if (i.customId === "adventure-escape") {
            resetUserAdventure(userId, adv);
            return await i.update({
              content: "🏃‍♂️ 모험에서 도망쳤다! 다음에 다시 도전해줘.",
              embeds: [],
              components: [],
              ephemeral: true
            });
          }

          if (i.customId === "adventure-start") {
            userAdv.inBattle = true;
            adv[userId] = userAdv; saveAdventure(adv);
            await module.exports.execute(i);
            return;
          }

          if (i.customId === "adventure-next-stage") {
            userAdv.stage += 1;
            userAdv.inBattle = false;
            userAdv.hp = champ.stats.hp;
            userAdv.monster = null;
            userAdv.monsterReset = true;
            adv[userId] = userAdv; saveAdventure(adv);
            await module.exports.execute(i);
            return;
          }

          if (!userAdv.inBattle) return;

          let crit = false;
          let dodge = false;

          if (i.customId === "adventure-attack") {
            crit = Math.random() < 0.25;
            let dmg = calcDamage(
              champ.stats.attack >= champ.stats.ap ? champ.stats.attack : champ.stats.ap,
              champ.stats.penetration, monsterStats.defense, userAdv.monster.hp
            );
            dmg = calcCritDamage(dmg, crit);
            userAdv.monster.hp -= dmg;
            if (userAdv.monster.hp > 0) {
              let mCrit = Math.random() < monsterStats.crit;
              let mdmg = calcCritDamage(
                calcDamage(monsterStats.attack, monsterStats.penetration, champ.stats.defense, userAdv.hp),
                mCrit
              );
              userAdv.hp -= mdmg;
            } else {
              userAdv.monster.hp = 0;
            }

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
              const nextRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("adventure-next-stage").setLabel("다음 스테이지 계속하기").setStyle(ButtonStyle.Success)
              );
              return await i.update({
                content: `🎉 ${monsterName} 처치!`,
                embeds: [
                  new EmbedBuilder().setDescription([
                    reward > 0 ? `파랑정수 +${formatNumber(reward)} 지급!` : "",
                    `스테이지 ${userAdv.stage + 1}로 진행 가능!`
                  ].filter(Boolean).join('\n'))
                ],
                components: [nextRow],
                ephemeral: true
              });
            }

            if (userAdv.hp <= 0) {
              userAdv.hp = 0;
              userAdv.inBattle = false;
              if (champ.level > 0) champ.level -= 1;
              resetUserAdventure(userId, adv);
              if (fs.existsSync(dataPath)) {
                let cd = JSON.parse(fs.readFileSync(dataPath, "utf8"));
                cd[userId].level = champ.level;
                fs.writeFileSync(dataPath, JSON.stringify(cd, null, 2));
              }
              return await i.update({
                content: `😵 패배!`,
                embeds: [
                  new EmbedBuilder().setDescription(`강화 단계가 1 하락했습니다. (현재 ${champ.level}강)`)
                ],
                components: [],
                ephemeral: true
              });
            }
            adv[userId] = userAdv; saveAdventure(adv);
            await module.exports.execute(i);
          }

          if (i.customId === "adventure-dodge") {
            dodge = Math.random() < 0.10;
            if (!dodge) {
              let mCrit = Math.random() < monsterStats.crit;
              let mdmg = calcCritDamage(
                calcDamage(monsterStats.attack, monsterStats.penetration, champ.stats.defense, userAdv.hp),
                mCrit
              );
              userAdv.hp -= mdmg;
            }
            if (userAdv.hp <= 0) {
              userAdv.hp = 0;
              userAdv.inBattle = false;
              if (champ.level > 0) champ.level -= 1;
              resetUserAdventure(userId, adv);
              if (fs.existsSync(dataPath)) {
                let cd = JSON.parse(fs.readFileSync(dataPath, "utf8"));
                cd[userId].level = champ.level;
                fs.writeFileSync(dataPath, JSON.stringify(cd, null, 2));
              }
              return await i.update({
                content: `😵 패배!`,
                embeds: [
                  new EmbedBuilder().setDescription(`강화 단계가 1 하락했습니다. (현재 ${champ.level}강)`)
                ],
                components: [],
                ephemeral: true
              });
            }
            adv[userId] = userAdv; saveAdventure(adv);
            await module.exports.execute(i);
          }
        } finally {
          if (advLock) try { await advLock(); } catch {}
        }
      });
      collector.on("end", async collected => {});
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
