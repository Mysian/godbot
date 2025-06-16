const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const battleEngine = require('../utils/battle-engine');
const { battleEmbed } = require('../embeds/battle-embed');
const fs = require('fs').promises;
const path = require('path');

const USER_FILE = path.join(__dirname, '../data/champion-users.json');
const RECORD_FILE = path.join(__dirname, '../data/champion-records.json');

const battles = new Map();
const battleRequests = new Map();
const battleTimers = new Map();

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
  champ.isDefending = false;
  champ.isDodging = false;
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

async function updateBattleView(interaction, battle, activeUserId) {
  const key = `${battle.user.id}:${battle.enemy.id}`;
  if (battleTimers.has(key)) clearTimeout(battleTimers.get(key));
  battleTimers.set(key, setTimeout(async () => {
    battle.finished = true;
    battles.delete(battle.user.id);
    battles.delete(battle.enemy.id);
    try {
      await interaction.followUp({
        content: '⏰ 2분(120초) 동안 행동이 없어 배틀이 자동 종료되었습니다.',
        ephemeral: false
      });
    } catch (e) {}
  }, 120000));

  const view = await battleEmbed({
    user: battle.user,
    enemy: battle.enemy,
    turn: battle.turn,
    logs: battle.logs,
    isUserTurn: battle.isUserTurn,
    activeUserId
  });
  await interaction.update(view);
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
    if (battles.has(user.id) || battles.has(enemyUser.id) || battleRequests.has(user.id) || battleRequests.has(enemyUser.id))
      return interaction.reply({ content: '이미 배틀 중이거나 대기중인 유저가 있습니다.', ephemeral: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_battle_${user.id}`)
        .setLabel('수락')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`decline_battle_${user.id}`)
        .setLabel('거절')
        .setStyle(ButtonStyle.Danger)
    );
    const embed = new EmbedBuilder()
      .setTitle('챔피언 배틀 요청')
      .setDescription(`${enemyUser}, ${user}의 배틀 신청을 수락하시겠습니까?`)
      .setColor('#f6ad55');
    battleRequests.set(user.id, { userId: user.id, enemyId: enemyUser.id, channelId: interaction.channel.id });
    battleRequests.set(enemyUser.id, { userId: user.id, enemyId: enemyUser.id, channelId: interaction.channel.id });

    return interaction.reply({ content: `${enemyUser}`, embeds: [embed], components: [row] });
  },

  async handleButton(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    // 1) 배틀 요청 수락/거절
    if (customId.startsWith('accept_battle_') || customId.startsWith('decline_battle_')) {
      const [action, , challengerId] = customId.split('_');
      const request = battleRequests.get(interaction.user.id);
      if (!request || request.enemyId !== interaction.user.id) {
        return interaction.reply({ content: '이 요청을 처리할 권한이 없습니다.', ephemeral: true });
      }
      if (action === 'decline') {
        battleRequests.delete(request.userId);
        battleRequests.delete(request.enemyId);
        return interaction.update({ content: '배틀 요청이 거절되었습니다.', embeds: [], components: [] });
      }
      const userChamp = await loadChampionUser(request.userId);
      const enemyChamp = await loadChampionUser(request.enemyId);
      if (!userChamp || !enemyChamp) {
        battleRequests.delete(request.userId);
        battleRequests.delete(request.enemyId);
        return interaction.update({ content: '챔피언 정보를 불러올 수 없습니다.', embeds: [], components: [] });
      }
      const battleState = {
        turn: 1,
        user: userChamp,
        enemy: enemyChamp,
        logs: [],
        isUserTurn: true,
        finished: false,
        effects: {},
      };
      battles.set(request.userId, battleState);
      battles.set(request.enemyId, battleState);
      battleRequests.delete(request.userId);
      battleRequests.delete(request.enemyId);

      const view = await battleEmbed({
        user: battleState.user,
        enemy: battleState.enemy,
        turn: battleState.turn,
        logs: battleState.logs,
        isUserTurn: battleState.isUserTurn,
        activeUserId: battleState.user.id
      });
      await interaction.update({ content: '배틀이 시작됩니다!', embeds: view.embeds, components: view.components });

      // 120초 타이머 시작
      const key = `${battleState.user.id}:${battleState.enemy.id}`;
      if (battleTimers.has(key)) clearTimeout(battleTimers.get(key));
      battleTimers.set(key, setTimeout(async () => {
        battleState.finished = true;
        battles.delete(battleState.user.id);
        battles.delete(battleState.enemy.id);
        try {
          await interaction.followUp({
            content: '⏰ 2분(120초) 동안 행동이 없어 배틀이 자동 종료되었습니다.',
            ephemeral: false
          });
        } catch (e) {}
      }, 120000));
      return;
    }

    // 2) 배틀 진행 버튼
    if (!battles.has(userId))
      return interaction.reply({ content: '진행 중인 배틀이 없습니다.', ephemeral: true });
    const battle = battles.get(userId);
    if (battle.finished)
      return interaction.reply({ content: '이미 종료된 배틀입니다.', ephemeral: true });

    const isMyTurn = (battle.isUserTurn && battle.user.id === userId) ||
                     (!battle.isUserTurn && battle.enemy.id === userId);
    const currentPlayer = battle.isUserTurn ? battle.user : battle.enemy;
    if (!isMyTurn || currentPlayer.stunned)
      return interaction.reply({ content: '행동 불가 상태입니다. (기절/비활성/상대턴)', ephemeral: true });

    const user = battle.isUserTurn ? battle.user : battle.enemy;
    const enemy = battle.isUserTurn ? battle.enemy : battle.user;

    const action = interaction.customId;
    let logs = [];
    let context = {
      lastAction: action,
      effects: battle.effects,
      damage: 0,
    };

    // -----------------------
    // 🟢 "보조" 액션: 아이템/스킬 - 턴 안넘김
    // -----------------------
    if (action === 'item') {
      const itemName = '회복포션';
      logs.push(...battleEngine.resolveItem(user, itemName, context));
      battle.logs = (battle.logs || []).concat(logs).slice(-7);
      await updateBattleView(interaction, battle, userId); // 내 턴 유지
      return;
    }
    if (action === 'skill') {
      const skillName = '섬광';
      logs.push(...battleEngine.resolveActiveSkill(user, enemy, skillName, context));
      battle.logs = (battle.logs || []).concat(logs).slice(-7);
      await updateBattleView(interaction, battle, userId); // 내 턴 유지
      return;
    }

    // -----------------------
    // 🟢 "주" 액션: 공격/방어/점멸/도망 - 턴 넘김
    // -----------------------
    // 사전 상태 초기화 (내가 방어/회피 했던 것은 턴 종료 후 자동으로 풀림)
    user.isDefending = false;
    user.isDodging = false;

    if (action === 'defend') {
      user.isDefending = true;
      logs.push(`${user.nickname} 방어! 다음 상대 공격/스킬 피해 50%로 감소.`);
    }
    if (action === 'dodge') {
      user.isDodging = true;
      logs.push(`${user.nickname} 점멸! 다음 상대 공격/스킬 20% 확률 완벽 회피.`);
    }
    if (action === 'attack') {
      // 공격 들어가기 전에 상대가 방어/점멸 중이면 반영
      if (enemy.isDodging) {
        if (Math.random() < 0.2) {
          context.damage = 0;
          logs.push(`${enemy.nickname} 점멸 성공! 모든 피해 회피!`);
        } else {
          logs.push(`${enemy.nickname} 점멸 실패! 피해를 입음.`);
        }
        enemy.isDodging = false;
      }
      if (enemy.isDefending && context.damage > 0) {
        context.damage = Math.floor(context.damage * 0.5);
        logs.push(`${enemy.nickname}의 방어! 피해 50% 감소.`);
        enemy.isDefending = false;
      }
      battleEngine.calcDamage(user, enemy, context);
      logs.push(`${user.nickname}의 평타! (${context.damage} 데미지)`);
      logs.push(...battleEngine.resolvePassive(user, enemy, context));
      logs.push(...battleEngine.applyEffects(enemy, user, context));
      enemy.hp = Math.max(0, enemy.hp - context.damage);
      logs.push(`${enemy.nickname}의 남은 HP: ${enemy.hp}/${enemy.stats.hp}`);
    }
    if (action === 'defend' || action === 'dodge' || action === 'attack') {
      // 턴 끝
      battle.logs = (battle.logs || []).concat(logs).slice(-7);

      // 끝판 체크 (승리/패배/무승부)
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
        if (battleTimers.has(`${battle.user.id}:${battle.enemy.id}`)) {
          clearTimeout(battleTimers.get(`${battle.user.id}:${battle.enemy.id}`));
          battleTimers.delete(`${battle.user.id}:${battle.enemy.id}`);
        }
        return interaction.update({
          content: resultMsg,
          embeds: [],
          components: [],
        });
      }

      battle.turn += 1;
      battle.isUserTurn = !battle.isUserTurn;
      const nextTurnUserId = battle.isUserTurn ? battle.user.id : battle.enemy.id;
      await updateBattleView(interaction, battle, nextTurnUserId);
      return;
    }

    if (action === 'escape') {
      if (battle.turn >= 10 && battle.turn <= 30) {
        if (Math.random() < 0.5) {
          logs.push(`${user.nickname} 도망 성공!`);
          battle.finished = true;
          await updateRecord(user.id, user.name, 'lose');
          await updateRecord(enemy.id, enemy.name, 'win');
          battles.delete(user.id);
          battles.delete(enemy.id);
          if (battleTimers.has(`${battle.user.id}:${battle.enemy.id}`)) {
            clearTimeout(battleTimers.get(`${battle.user.id}:${battle.enemy.id}`));
            battleTimers.delete(`${battle.user.id}:${battle.enemy.id}`);
          }
          return interaction.update({
            content: `🏃‍♂️ ${user.nickname}가 도망쳤습니다! ${enemy.nickname}의 승리!`,
            embeds: [],
            components: [],
          });
        } else {
          logs.push(`${user.nickname} 도망 실패... 턴을 소모합니다.`);
          battle.logs = (battle.logs || []).concat(logs).slice(-7);
          battle.turn += 1;
          battle.isUserTurn = !battle.isUserTurn;
          const nextTurnUserId = battle.isUserTurn ? battle.user.id : battle.enemy.id;
          await updateBattleView(interaction, battle, nextTurnUserId);
          return;
        }
      } else {
        logs.push('지금은 도망칠 수 없습니다! (10~30턴만)');
        battle.logs = (battle.logs || []).concat(logs).slice(-7);
        await updateBattleView(interaction, battle, userId);
        return;
      }
    }

    // 지원하지 않는 행동
    logs.push('지원하지 않는 행동입니다.');
    battle.logs = (battle.logs || []).concat(logs).slice(-7);
    await updateBattleView(interaction, battle, userId);
  }
};
