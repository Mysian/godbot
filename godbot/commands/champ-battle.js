// commands/champ-battle.js

const { SlashCommandBuilder } = require('discord.js');
const { battleEmbed } = require('../embeds/battle-embed');
const battleEngine = require('../utils/battle-engine');
const fs = require('fs').promises;
const path = require('path');
const USER_FILE = path.join(__dirname, '../data/champion-users.json');
const RECORD_FILE = path.join(__dirname, '../data/champion-records.json');

const battles = new Map();

async function readJson(file) {
  try {
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data || '{}');
  } catch (e) {
    return {};
  }
}
async function writeJson(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2));
}
async function loadChampionUser(userId) {
  const users = await readJson(USER_FILE);
  if (!users[userId]) return null;
  const champ = { ...users[userId] };
  champ.hp = champ.hp ?? champ.stats.hp;
  champ.id = userId;
  champ.nickname = champ.nickname ?? champ.name;
  champ.items = champ.items || {};
  champ.skills = champ.skills || [];
  champ._itemUsedCount = 0;
  return champ;
}
async function loadRecords() {
  return await readJson(RECORD_FILE);
}
async function saveRecords(records) {
  await writeJson(RECORD_FILE, records);
}
async function updateRecord(userId, champName, type) {
  const records = await loadRecords();
  if (!records[userId]) {
    records[userId] = { name: champName, win: 0, draw: 0, lose: 0 };
  }
  if (type === 'win') records[userId].win += 1;
  if (type === 'lose') records[userId].lose += 1;
  if (type === 'draw') records[userId].draw += 1;
  await saveRecords(records);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('챔피언배틀')
    .setDescription('상대와 롤 챔피언 턴제 배틀을 시작합니다.')
    .addUserOption(option => option.setName('상대').setDescription('대결 상대').setRequired(true)),
  battles,

  async execute(interaction) {
    const user = interaction.user;
    const enemyUser = interaction.options.getUser('상대');
    if (user.id === enemyUser.id)
      return interaction.reply({ content: '본인과는 배틀할 수 없습니다!', ephemeral: true });
    if (battles.has(user.id) || battles.has(enemyUser.id))
      return interaction.reply({ content: '이미 배틀 중인 유저가 있습니다.', ephemeral: true });

    const userChamp = await loadChampionUser(user.id);
    const enemyChamp = await loadChampionUser(enemyUser.id);
    if (!userChamp || !enemyChamp)
      return interaction.reply({ content: '챔피언 정보를 불러올 수 없습니다.', ephemeral: true });

    const battleState = {
      turn: 1,
      user: userChamp,
      enemy: enemyChamp,
      logs: [],
      isUserTurn: true,
      finished: false,
      effects: {},
    };
    battles.set(user.id, battleState);
    battles.set(enemyUser.id, battleState);

    const view = await battleEmbed({
      user: battleState.user,
      enemy: battleState.enemy,
      turn: battleState.turn,
      logs: battleState.logs,
      isUserTurn: battleState.isUserTurn,
    });
    await interaction.reply(view);
  },

  async handleButton(interaction) {
    const userId = interaction.user.id;
    if (!battles.has(userId))
      return interaction.reply({ content: '진행 중인 배틀이 없습니다.', ephemeral: true });

    const battle = battles.get(userId);
    if (battle.finished)
      return interaction.reply({ content: '이미 종료된 배틀입니다.', ephemeral: true });

    const user = battle.isUserTurn ? battle.user : battle.enemy;
    const enemy = battle.isUserTurn ? battle.enemy : battle.user;

    const action = interaction.customId;

    if (!battle.isUserTurn || user.stunned)
      return interaction.reply({ content: '행동 불가 상태입니다. (기절 등)', ephemeral: true });

    let logs = [];
    let context = {
      lastAction: action,
      effects: battle.effects,
      damage: 0,
    };

    if (action === 'attack') {
      battleEngine.calcDamage(user, enemy, context);
      logs.push(`${user.nickname}의 평타! (${context.damage} 데미지)`);
      logs.push(...battleEngine.resolvePassive(user, enemy, context));
      logs.push(...battleEngine.applyEffects(enemy, user, context));
      enemy.hp = Math.max(0, enemy.hp - context.damage);
      logs.push(`${enemy.nickname}의 남은 HP: ${enemy.hp}/${enemy.stats.hp}`);
    }
    else if (action === 'defend') {
      logs.push(`${user.nickname} 방어!`);
    }
    else if (action === 'dodge') {
      if (Math.random() < 0.2) {
        logs.push(`${user.nickname} 점멸로 적의 공격을 완전히 피했다!`);
      } else {
        logs.push(`${user.nickname}의 점멸 실패!`);
      }
    }
    else if (action === 'item') {
      const itemName = '회복포션';
      logs.push(...battleEngine.resolveItem(user, itemName, context));
    }
    else if (action === 'skill') {
      const skillName = '섬광';
      logs.push(...battleEngine.resolveActiveSkill(user, enemy, skillName, context));
    }
    else if (action === 'escape') {
      if (battle.turn >= 10 && battle.turn <= 30) {
        if (Math.random() < 0.5) {
          logs.push(`${user.nickname} 도망 성공!`);
          battle.finished = true;
          await updateRecord(user.id, user.name, 'lose');
          await updateRecord(enemy.id, enemy.name, 'win');
          battles.delete(user.id);
          battles.delete(enemy.id);
          return interaction.update({
            content: `🏃‍♂️ ${user.nickname}가 도망쳤습니다! ${enemy.nickname}의 승리!`,
            components: [],
          });
        } else {
          logs.push(`${user.nickname} 도망 실패... 턴을 소모합니다.`);
        }
      } else {
        logs.push('지금은 도망칠 수 없습니다! (10~30턴만)');
      }
    } else {
      logs.push('지원하지 않는 행동입니다.');
    }

    battle.logs = (battle.logs || []).concat(logs).slice(-7);

    let winner = null;
    if (user.hp <= 0 || enemy.hp <= 0 || battle.turn >= 99) {
      battle.finished = true;
      if (user.hp > 0) winner = user;
      else if (enemy.hp > 0) winner = enemy;

      let resultMsg = '';
      if (winner) {
        resultMsg = `🎉 **${winner.nickname} (${winner.name})** 승리!`;
        await updateRecord(winner.id, winner.name, 'win');
        await updateRecord(winner.id === user.id ? enemy.id : user.id, (winner.id === user.id ? enemy.name : user.name), 'lose');
      } else {
        resultMsg = '⚖️ 무승부! 둘 다 쓰러졌다!';
        await updateRecord(user.id, user.name, 'draw');
        await updateRecord(enemy.id, enemy.name, 'draw');
      }
      battles.delete(battle.user.id);
      battles.delete(battle.enemy.id);
      return interaction.update({
        content: resultMsg,
        embeds: [],
        components: [],
      });
    }

    battle.turn += 1;
    battle.isUserTurn = !battle.isUserTurn;

    const view = await battleEmbed({
      user: battle.user,
      enemy: battle.enemy,
      turn: battle.turn,
      logs: battle.logs,
      isUserTurn: battle.isUserTurn,
    });
    await interaction.update(view);
  }
};
