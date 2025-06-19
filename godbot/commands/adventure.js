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
  if (dragonList.includes(monster) || [boss50, boss100].includes(monster)) {
    return [`adventure-png/${monster}.png`, `adventure-png/${monster} 등장.png`];
  }
  return [`adventure-png/${monster}.png`, "adventure-png/소환사의 협곡.png"];
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
// 최고기록 갱신: stage, clear
function updateBestRecord(userId, curStage, curClear) {
  const best = loadAdventureBest();
  if (!best[userId]) best[userId] = { bestStage: 0, totalClear: 0 };
  if (curStage - 1 > best[userId].bestStage) best[userId].bestStage = curStage - 1;
  if (curClear > best[userId].totalClear) best[userId].totalClear = curClear;
  saveAdventureBest(best);
}
function resetUserAdventure(userId, advObj) {
  if (advObj && advObj[userId]) {
    // adventure-best에 최고기록 업데이트
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
    const userId = interaction.user.id;
    await checkUserChampionDeleted(userId);

    let adv = loadAdventure();
    let userAdv = adv[userId] || { stage: 1, hp: null, reward: 0, clear: 0 };

    const champ = loadUserChampion(userId);
    if (!champ || !champ.name) {
      // adventure-best에 기록 갱신 (혹시나 여기서도)
      resetUserAdventure(userId, adv);
      return interaction.reply({ content: "❌ 챔피언이 없습니다! `/챔피언획득`으로 먼저 획득해줘!", ephemeral: true });
    }
    const championBase = championList.find(c => c.name === champ.name);
    champ.stats = champ.stats || { ...championBase.stats };
    const passive = passiveSkills[champ.name];

    const stage = userAdv.stage;
    const monsterName = getMonsterByStage(stage);
    const monsterStats = getMonsterStats(stage, monsterName);
    userAdv.hp = userAdv.hp === null ? champ.stats.hp : userAdv.hp;

    const [monsterImg, sceneImg] = getMonsterImage(monsterName, stage);
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

    const embed = new EmbedBuilder()
      .setTitle(`🌌 [스테이지 ${stage}] ${monsterName} 출현`)
      .setDescription(isNamed ? `**${monsterMsg}**` : "")
      .setFields(
        { name: "내 챔피언", value: champ.name, inline: true },
        { name: "챔피언 HP", value: `${userAdv.hp} / ${champ.stats.hp}`, inline: true },
        { name: "몬스터 HP", value: `${monsterStats.hp}`, inline: true }
      )
      .setThumbnail(monsterImg)
      .setImage(sceneImg)
      .setColor(isNamed ? 0xe67e22 : 0x2986cc)
      .setFooter({ text: `공격은 가끔 크리티컬! 점멸은 매우 낮은 확률로 회피 (운빨)` });

    if (userAdv.inBattle && isNamed) embed.setDescription(`**${monsterMsg}**\n` + (embed.data.description || ""));

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    const filter = i => i.user.id === userId &&
      ["adventure-start", "adventure-escape", "adventure-attack", "adventure-dodge"].includes(i.customId);

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

    collector.on("collect", async i => {
      let advLock;
      try {
        advLock = await lockfile.lock(adventurePath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
        adv = loadAdventure();
        userAdv = adv[userId] || { stage: 1, hp: champ.stats.hp, reward: 0, clear: 0 };

        if (i.customId === "adventure-escape") {
          // adventure-best에 기록
          resetUserAdventure(userId, adv);
          return await i.update({ content: "🏃‍♂️ 모험에서 도망쳤다! 다음에 다시 도전해줘.", embeds: [], components: [], ephemeral: true });
        }
        if (i.customId === "adventure-start") {
          userAdv.inBattle = true;
          adv[userId] = userAdv; saveAdventure(adv);
          await module.exports.execute(i);
          return;
        }
        if (!userAdv.inBattle) return;

        let crit = false;
        let dodge = false;

        if (i.customId === "adventure-attack") {
          crit = Math.random() < 0.25;
          let dmg = calcDamage(champ.stats.attack >= champ.stats.ap ? champ.stats.attack : champ.stats.ap,
            champ.stats.penetration, monsterStats.defense, monsterStats.hp);
          dmg = calcCritDamage(dmg, crit);
          let mhp = monsterStats.hp - dmg;

          if (mhp > 0) {
            let mCrit = Math.random() < monsterStats.crit;
            let mdmg = calcDamage(monsterStats.attack, monsterStats.penetration, champ.stats.defense, userAdv.hp);
            mdmg = calcCritDamage(mdmg, mCrit);
            userAdv.hp -= mdmg;
          } else {
            mhp = 0;
          }
          if (mhp <= 0) {
            userAdv.stage += 1;
            userAdv.inBattle = false;
            userAdv.hp = champ.stats.hp;
            userAdv.clear += 1;

            let reward = (userAdv.stage % 10 === 1) ? makeStageReward(userAdv.stage - 1) : 0;
            userAdv.reward += reward;
            adv[userId] = userAdv; saveAdventure(adv);

            if (reward > 0) {
              await addBE(userId, reward, `[모험] ${userAdv.stage - 1} 스테이지 클리어`);
            }
            return await i.update({ content: `🎉 ${monsterName} 처치!\n${reward > 0 ? `파랑정수 +${formatNumber(reward)} 지급!` : ''}\n스테이지 ${userAdv.stage}로 진행 가능!`, embeds: [], components: [], ephemeral: true });
          }
          if (userAdv.hp <= 0) {
            userAdv.hp = 0;
            userAdv.inBattle = false;
            if (champ.level > 0) champ.level -= 1;
            // adventure-best에 기록
            resetUserAdventure(userId, adv);
            if (fs.existsSync(dataPath)) {
              let cd = JSON.parse(fs.readFileSync(dataPath, "utf8"));
              cd[userId].level = champ.level;
              fs.writeFileSync(dataPath, JSON.stringify(cd, null, 2));
            }
            return await i.update({ content: `😵 패배! 강화 단계가 1 하락했습니다. (현재 ${champ.level}강)`, embeds: [], components: [], ephemeral: true });
          }
          adv[userId] = userAdv; saveAdventure(adv);
          await module.exports.execute(i);
        }

        if (i.customId === "adventure-dodge") {
          dodge = Math.random() < 0.10;
          let log = "";
          if (!dodge) {
            let mCrit = Math.random() < monsterStats.crit;
            let mdmg = calcDamage(monsterStats.attack, monsterStats.penetration, champ.stats.defense, userAdv.hp);
            mdmg = calcCritDamage(mdmg, mCrit);
            userAdv.hp -= mdmg;
          }
          if (userAdv.hp <= 0) {
            userAdv.hp = 0; userAdv.inBattle = false;
            if (champ.level > 0) champ.level -= 1;
            resetUserAdventure(userId, adv);
            if (fs.existsSync(dataPath)) {
              let cd = JSON.parse(fs.readFileSync(dataPath, "utf8"));
              cd[userId].level = champ.level;
              fs.writeFileSync(dataPath, JSON.stringify(cd, null, 2));
            }
            return await i.update({ content: `😵 패배! 강화 단계가 1 하락했습니다. (현재 ${champ.level}강)`, embeds: [], components: [], ephemeral: true });
          }
          adv[userId] = userAdv; saveAdventure(adv);
          await module.exports.execute(i);
        }
      } finally {
        if (advLock) try { await advLock(); } catch {}
      }
    });

    collector.on("end", async collected => {});
  }
};
