// commands/champ-battle.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const battleEngine = require('../utils/battle-engine');
const { getChampionIcon } = require('../utils/champion-utils');
const passives = require('../utils/passive-skills');
const fs = require('fs').promises;
const path = require('path');

const USER_FILE = path.join(__dirname, '../data/champion-users.json');
const RECORD_FILE = path.join(__dirname, '../data/champion-records.json');

const battles = new Map();        // 실제 진행 중인 배틀
const battleRequests = new Map(); // 수락 대기중인 요청
const battleTimers = new Map();   // 120초 타이머

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

// 체력 바 함수
function createHpBar(current, max, length = 20) {
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  const bar = '🟩'.repeat(filled) + '⬛'.repeat(empty);
  return bar;
}

// 임베드+버튼 통합 함수 (패시브 표시 포함)
async function battleEmbed({
  user,
  enemy,
  turn,
  logs,
  isUserTurn,
  activeUserId // interaction.user.id를 무조건 넘길 것!
}) {
  const userIcon = await getChampionIcon(user.name);
  const enemyIcon = await getChampionIcon(enemy.name);

  // HP, 체력바
  const userHpPct = Math.max(0, Math.floor((user.hp / user.stats.hp) * 100));
  const enemyHpPct = Math.max(0, Math.floor((enemy.hp / enemy.stats.hp) * 100));
  const userHpBar = createHpBar(user.hp, user.stats.hp);
  const enemyHpBar = createHpBar(enemy.hp, enemy.stats.hp);

  // 상태
  const userState = [];
  if (user.stunned) userState.push('⚡기절');
  if (user.undying) userState.push('💀언데드');
  if (user.debuffImmune) userState.push('🟣디버프 면역');
  if (user._itemUsedCount >= 3) userState.push('🔒아이템 제한');
  const enemyState = [];
  if (enemy.stunned) enemyState.push('⚡기절');
  if (enemy.undying) enemyState.push('💀언데드');
  if (enemy.debuffImmune) enemyState.push('🟣디버프 면역');
  if (enemy._itemUsedCount >= 3) enemyState.push('🔒아이템 제한');

  // 본인 턴 챔피언 이미지를 setImage로 (맨 하단에 크게)
  const mainChampionIcon = isUserTurn ? userIcon : enemyIcon;

  // 공격/주문/방어/관통 이모지
  const atkEmoji = "⚔️";
  const apEmoji = "✨";
  const defEmoji = "🛡️";
  const penEmoji = "🗡️";

  // 현재 턴 유저ID, 닉네임, 멘션
  const currentTurnUserId = isUserTurn ? user.id : enemy.id;
  const currentTurnNickname = isUserTurn ? user.nickname : enemy.nickname;

  // 패시브 설명
  const userPassive = passives[user.name]?.description || '정보 없음';
  const enemyPassive = passives[enemy.name]?.description || '정보 없음';

  const embed = new EmbedBuilder()
    .setColor(isUserTurn ? '#e44d26' : '#1769e0')
    .setTitle(`⚔️ ${user.nickname} vs ${enemy.nickname} | ${turn}턴`)
    .setAuthor({
      name: isUserTurn
        ? `${enemy.nickname} (${enemy.name})`
        : `${user.nickname} (${user.name})`,
      iconURL: isUserTurn ? enemyIcon : userIcon
    })
    .setImage(mainChampionIcon)
    .addFields(
      {
        name: `🟦 ${user.nickname} (${user.name})`,
        value:
          `HP: **${user.hp}/${user.stats.hp}** (${userHpPct}%)\n` +
          `${userHpBar}\n` +
          `상태: ${userState.length ? userState.join(', ') : '정상'}\n` +
          `${atkEmoji} 공격력: ${user.stats.attack}  ` +
          `${apEmoji} 주문력: ${user.stats.ap}  ` +
          `${defEmoji} 방어력: ${user.stats.defense}  ` +
          `${penEmoji} 관통력: ${user.stats.penetration}`,
        inline: false
      },
      {
        name: `🟥 ${enemy.nickname} (${enemy.name})`,
        value:
          `HP: **${enemy.hp}/${enemy.stats.hp}** (${enemyHpPct}%)\n` +
          `${enemyHpBar}\n` +
          `상태: ${enemyState.length ? enemyState.join(', ') : '정상'}\n` +
          `${atkEmoji} 공격력: ${enemy.stats.attack}  ` +
          `${apEmoji} 주문력: ${enemy.stats.ap}  ` +
          `${defEmoji} 방어력: ${enemy.stats.defense}  ` +
          `${penEmoji} 관통력: ${enemy.stats.penetration}`,
        inline: false
      },
      {
        name: `🟦 ${user.name} 패시브`,
        value: userPassive,
        inline: false
      },
      {
        name: `🟥 ${enemy.name} 패시브`,
        value: enemyPassive,
        inline: false
      }
    )
    .setFooter({
      text: isUserTurn
        ? `🎮 ${currentTurnNickname} (<@${currentTurnUserId}>)의 턴! 행동을 선택하세요.`
        : `⏳ ${currentTurnNickname} (<@${currentTurnUserId}>)의 턴을 기다리는 중...`
    });

  // 로그
  const LOG_LIMIT = 7;
  const viewLogs = (logs || []).slice(-LOG_LIMIT).map(log => `• ${log}`).reverse();
  embed.addFields({
    name: '전투 로그',
    value: viewLogs.length ? viewLogs.join('\n') : '전투 로그가 없습니다.',
  });

  // 버튼: 현재 턴이고 본인만 클릭 가능해야 활성화!
  const enable = !!activeUserId && currentTurnUserId === activeUserId && isUserTurn && !user.stunned;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('attack')
      .setLabel('⚔️ 평타')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!enable),
    new ButtonBuilder()
      .setCustomId('defend')
      .setLabel('🛡️ 방어')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!enable),
    new ButtonBuilder()
      .setCustomId('dodge')
      .setLabel('💨 점멸(회피)')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!enable),
    new ButtonBuilder()
      .setCustomId('item')
      .setLabel('🧪 아이템')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!enable || user._itemUsedCount >= 3),
    new ButtonBuilder()
      .setCustomId('skill')
      .setLabel('✨ 스킬')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!enable)
  );
  let canEscape = turn >= 10 && turn <= 30 && enable;
  const escapeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('escape')
      .setLabel('🏃‍♂️ 도망 (50%)')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canEscape)
  );

  return {
    embeds: [embed],
    components: [row, escapeRow],
  };
}

// 타이머 포함 임베드 업데이트 함수
async function updateBattleView(interaction, battle, activeUserId) {
  // 타이머 리셋
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
    } catch (e) { }
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

    // 수락 임베드+버튼
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

    await interaction.reply({ content: `${enemyUser}`, embeds: [embed], components: [row] });
  },

  async handleButton(interaction) {
    const customId = interaction.customId;

    // 1) 배틀 요청 수락/거절
    if (customId.startsWith('accept_battle_') || customId.startsWith('decline_battle_')) {
      const [action, , challengerId] = customId.split('_');
      const request = battleRequests.get(interaction.user.id);
      if (!request || request.enemyId !== interaction.user.id) {
        return interaction.reply({ content: '이 요청을 처리할 권한이 없습니다.', ephemeral: true });
      }
      if (action === 'decline') {
        // 요청 거절
        battleRequests.delete(request.userId);
        battleRequests.delete(request.enemyId);
        return interaction.update({ content: '배틀 요청이 거절되었습니다.', embeds: [], components: [] });
      }
      // 요청 수락 → 실제 배틀 시작
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

      // 첫 턴 유저만 버튼 활성화!
      const view = await battleEmbed({
        user: battleState.user,
        enemy: battleState.enemy,
        turn: battleState.turn,
        logs: battleState.logs,
        isUserTurn: battleState.isUserTurn,
        activeUserId: interaction.user.id
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
        } catch (e) { }
      }, 120000));
      return;
    }

    // 2) 배틀 진행 버튼
    const userId = interaction.user.id;
    if (!battles.has(userId))
      return interaction.reply({ content: '진행 중인 배틀이 없습니다.', ephemeral: true });
    const battle = battles.get(userId);
    if (battle.finished)
      return interaction.reply({ content: '이미 종료된 배틀입니다.', ephemeral: true });

    const user = battle.isUserTurn ? battle.user : battle.enemy;
    const enemy = battle.isUserTurn ? battle.enemy : battle.user;
    if (!battle.isUserTurn || user.id !== userId || user.stunned)
      return interaction.reply({ content: '행동 불가 상태입니다. (기절/비활성/상대턴)', ephemeral: true });

    const action = interaction.customId;
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
    } else if (action === 'defend') {
      logs.push(`${user.nickname} 방어!`);
    } else if (action === 'dodge') {
      if (Math.random() < 0.2) {
        logs.push(`${user.nickname} 점멸로 적의 공격을 완전히 피했다!`);
      } else {
        logs.push(`${user.nickname}의 점멸 실패!`);
      }
    } else if (action === 'item') {
      const itemName = '회복포션';
      logs.push(...battleEngine.resolveItem(user, itemName, context));
    } else if (action === 'skill') {
      const skillName = '섬광';
      logs.push(...battleEngine.resolveActiveSkill(user, enemy, skillName, context));
    } else if (action === 'escape') {
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
            embeds: [],
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

    await updateBattleView(interaction, battle, enemy.id);
  }
};
