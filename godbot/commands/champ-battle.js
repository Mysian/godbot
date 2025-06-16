const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const battleEngine = require('../battle-system/battle-engine');
const { battleEmbed } = require('../embeds/battle-embed');
const fs = require('fs').promises;
const path = require('path');
const { getChampionIcon } = require('../utils/champion-utils');
const passives = require('../utils/passive-skills');

const USER_FILE = path.join(__dirname, '../data/champion-users.json');
const RECORD_FILE = path.join(__dirname, '../data/champion-records.json');

const battles = new Map();
const battleRequests = new Map();
const battleTimers = new Map();
const openBattleTimers = new Map();

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
async function loadChampionUser(userId, interaction) {
  const users = await readJson(USER_FILE);
  if (!users[userId]) return null;
  const champ = { ...users[userId] };
  champ.hp = champ.hp ?? champ.stats.hp;
  champ.id = userId;
  if (interaction && interaction.guild) {
    try {
      const member = await interaction.guild.members.fetch(userId);
      champ.nickname = member.nickname || member.user.username;
    } catch {
      champ.nickname = champ.nickname ?? champ.name;
    }
  } else {
    champ.nickname = champ.nickname ?? champ.name;
  }
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

const LOG_LIMIT = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('챔피언배틀')
    .setDescription('상대와 롤 챔피언 턴제 배틀을 시작합니다.')
    .addUserOption(option => option.setName('상대').setDescription('대결 상대').setRequired(false)),
  battles,
  battleRequests,

  async execute(interaction) {
    const user = interaction.user;
    const enemyUser = interaction.options.getUser('상대');

    // 1) 오픈매칭
    if (!enemyUser) {
      if (battles.has(user.id) || battleRequests.has(user.id))
        return interaction.reply({ content: '이미 배틀 중이거나 대기중입니다.', ephemeral: true });

      // ⬇️ 내 챔피언 정보 + 능력치 미리 표시
      const userChamp = await loadChampionUser(user.id, interaction);
      const userIcon = await getChampionIcon(userChamp.name);
      const userPassive = passives[userChamp.name]?.description || '정보 없음';
      const embed = new EmbedBuilder()
        .setTitle('오픈 배틀 요청 (아무나 수락 가능)')
        .setDescription(
          `\`${userChamp.nickname}\` 님이 오픈 배틀을 신청했습니다.\n` +
          `수락 시, 아래 챔피언과 대결하게 됩니다.\n\n` +
          `⏰ **120초 이내 수락 없으면 자동 종료됩니다.**`
        )
        .setThumbnail(userIcon)
        .addFields(
          { name: `🧙 챔피언`, value: userChamp.name, inline: true },
          { name: `🕹️ 소환사`, value: userChamp.nickname, inline: true },
          { name: `🔨 강화`, value: String(userChamp.level ?? 0), inline: true },
          { name: `⚔️ 공격력`, value: String(userChamp.stats.attack), inline: true },
          { name: `🔮 주문력`, value: String(userChamp.stats.ap), inline: true },
          { name: `♥️ 체력`, value: String(userChamp.stats.hp), inline: true },
          { name: `🛡️ 방어력`, value: String(userChamp.stats.defense), inline: true },
          { name: `💣 관통력`, value: String(userChamp.stats.penetration), inline: true },
          { name: `🧬 패시브`, value: userPassive, inline: false }
        )
        .setColor('#f6ad55');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_battle_open_${user.id}`)
          .setLabel('수락')
          .setStyle(ButtonStyle.Success)
      );
      battleRequests.set(user.id, { userId: user.id, enemyId: null, channelId: interaction.channel.id, open: true });

      // 120초 뒤 아무도 수락 안 하면 자동종료
      if (openBattleTimers.has(user.id)) clearTimeout(openBattleTimers.get(user.id));
      openBattleTimers.set(user.id, setTimeout(async () => {
        battleRequests.delete(user.id);
        try {
          await interaction.followUp({
            content: `⏰ 2분(120초) 동안 아무도 수락하지 않아 오픈 배틀 요청이 자동 종료되었습니다.`,
            ephemeral: false
          });
        } catch (e) {}
      }, 120000));

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    // 2) 기존 상대 지정
    if (user.id === enemyUser.id)
      return interaction.reply({ content: '본인과는 배틀할 수 없습니다!', ephemeral: true });
    if (battles.has(user.id) || battles.has(enemyUser.id) || battleRequests.has(user.id) || battleRequests.has(enemyUser.id))
      return interaction.reply({ content: '이미 배틀 중이거나 대기중인 유저가 있습니다.', ephemeral: true });

    // ⬇️ 서로의 능력치+닉네임+패시브 표시
    const userChamp = await loadChampionUser(user.id, interaction);
    const enemyChamp = await loadChampionUser(enemyUser.id, interaction);
    const userIcon = await getChampionIcon(userChamp.name);
    const enemyIcon = await getChampionIcon(enemyChamp.name);
    const userPassive = passives[userChamp.name]?.description || '정보 없음';
    const enemyPassive = passives[enemyChamp.name]?.description || '정보 없음';

    const embed = new EmbedBuilder()
      .setTitle('챔피언 배틀 요청 (상대 지정)')
      .setDescription(
        `${enemyUser} 님, 아래 챔피언/능력치로 대결을 수락하시겠습니까?\n\n` +
        `🟦 신청자: ${userChamp.nickname}\n` +
        `🟥 상대: ${enemyChamp.nickname}\n`
      )
      .addFields(
        { name: `🟦 ${userChamp.name} (${userChamp.nickname})`, value:
            `🔨 강화: ${userChamp.level ?? 0}\n` +
            `공격력: ${userChamp.stats.attack}\n` +
            `주문력: ${userChamp.stats.ap}\n` +
            `체력: ${userChamp.stats.hp}\n` +
            `방어력: ${userChamp.stats.defense}\n` +
            `관통력: ${userChamp.stats.penetration}\n` +
            `🧬 패시브: ${userPassive}\n`
        },
        { name: `🟥 ${enemyChamp.name} (${enemyChamp.nickname})`, value:
            `🔨 강화: ${enemyChamp.level ?? 0}\n` +
            `공격력: ${enemyChamp.stats.attack}\n` +
            `주문력: ${enemyChamp.stats.ap}\n` +
            `체력: ${enemyChamp.stats.hp}\n` +
            `방어력: ${enemyChamp.stats.defense}\n` +
            `관통력: ${enemyChamp.stats.penetration}\n` +
            `🧬 패시브: ${enemyPassive}\n`
        }
      )
      .setThumbnail(userIcon)
      .setImage(enemyIcon)
      .setColor('#f6ad55');

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
    battleRequests.set(user.id, { userId: user.id, enemyId: enemyUser.id, channelId: interaction.channel.id, open: false });
    battleRequests.set(enemyUser.id, { userId: user.id, enemyId: enemyUser.id, channelId: interaction.channel.id, open: false });

    return interaction.reply({ embeds: [embed], components: [row] });
  },

  async handleButton(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    // 1) 오픈매칭 수락만 허용
    if (customId.startsWith('accept_battle_open_')) {
      const challengerId = customId.replace(/^.*_/, '');
      const request = battleRequests.get(challengerId);
      if (!request || !request.open)
        return interaction.reply({ content: '해당 오픈매칭이 존재하지 않습니다.', ephemeral: true });
      if (challengerId === userId)
        return interaction.reply({ content: '자기 자신은 수락할 수 없습니다!', ephemeral: true });
      if (battles.has(userId) || battleRequests.has(userId))
        return interaction.reply({ content: '이미 배틀 중이거나 대기중입니다.', ephemeral: true });

      // 타이머 해제(모집 창 종료)
      if (openBattleTimers.has(challengerId)) {
        clearTimeout(openBattleTimers.get(challengerId));
        openBattleTimers.delete(challengerId);
      }
      battleRequests.delete(challengerId);

      // 배틀 시작 (challenger vs 수락자)
      const userChamp = await loadChampionUser(challengerId, interaction);
      const enemyChamp = await loadChampionUser(userId, interaction);
      if (!userChamp || !enemyChamp) {
        return interaction.update({ content: '챔피언 정보를 불러올 수 없습니다.', embeds: [], components: [] });
      }
      const battleState = {
        turn: 1,
        user: userChamp,
        enemy: enemyChamp,
        logs: [`🎲 ${userChamp.nickname} 턴!`],
        isUserTurn: true,
        finished: false,
        effects: {},
      };
      battles.set(challengerId, battleState);
      battles.set(userId, battleState);

      const view = await battleEmbed({
        user: battleState.user,
        enemy: battleState.enemy,
        turn: battleState.turn,
        logs: battleState.logs,
        isUserTurn: battleState.isUserTurn,
        activeUserId: battleState.user.id
      });
      await interaction.update({ content: '배틀이 시작됩니다!', embeds: view.embeds, components: view.components });

      // 타이머
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

    // 2) 기존 배틀 수락/거절
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
      const userChamp = await loadChampionUser(request.userId, interaction);
      const enemyChamp = await loadChampionUser(request.enemyId, interaction);
      if (!userChamp || !enemyChamp) {
        battleRequests.delete(request.userId);
        battleRequests.delete(request.enemyId);
        return interaction.update({ content: '챔피언 정보를 불러올 수 없습니다.', embeds: [], components: [] });
      }
      const battleState = {
        turn: 1,
        user: userChamp,
        enemy: enemyChamp,
        logs: [`🎲 ${userChamp.nickname} 턴!`],
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

      // 타이머
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

    // 3) 배틀 진행 버튼
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
    
    // 아이템/스킬: 턴 유지
    if (action === 'item') {
      // 예: 아이템명은 실제 버튼 데이터/유저 선택 등으로 받도록 확장
      const itemName = '회복포션';
      logs.push(...battleEngine.useItem(user, itemName, context));
      logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onItem'));
      battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
      await updateBattleView(interaction, battle, userId);
      return;
    }
    if (action === 'skill') {
      const skillName = '섬광';
      logs.push(...battleEngine.useSkill(user, enemy, skillName, context));
      logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onSkill'));
      battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
      await updateBattleView(interaction, battle, userId);
      return;
    }

    // 주 액션: 공격/방어/점멸/도망 - 턴 넘김
    user.isDefending = false;
    user.isDodging = false;

    if (action === 'defend') {
      logs.push(battleEngine.defend(user, context));
      logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onDefend'));
    }
    if (action === 'dodge') {
      logs.push(battleEngine.dodge(user, context));
      logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onDodge'));
    }
    if (action === 'attack') {
      battleEngine.attack(user, enemy, context);

      // 점멸(회피)
      if (enemy.isDodging) {
        if (Math.random() < 0.2) {
          context.damage = 0;
          logs.push(`⚡ ${enemy.nickname} 점멸 성공!`);
        } else {
          logs.push(`🌧️ ${enemy.nickname} 점멸 실패!`);
        }
        enemy.isDodging = false;
      }
      // 방어
      if (enemy.isDefending && context.damage > 0) {
        context.damage = Math.floor(context.damage * 0.5);
        logs.push(`${enemy.nickname}의 방어! 피해 50% 감소.`);
        enemy.isDefending = false;
      }
      logs.push(`⚔️ ${user.nickname}의 평타! (${context.damage} 데미지)`);
      logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onAttack'));
      logs.push(...battleEngine.applyEffects(enemy, user, context));
      enemy.hp = Math.max(0, enemy.hp - context.damage);
    }
    if (action === 'defend' || action === 'dodge' || action === 'attack') {
      battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);

      let winner = null;
      if (user.hp <= 0 || enemy.hp <= 0 || battle.turn >= 99) {
        battle.finished = true;
        if (user.hp > 0) winner = user;
        else if (enemy.hp > 0) winner = enemy;

        let resultEmbed;
        if (winner) {
          const loser = winner.id === user.id ? enemy : user;
          const champIcon = await getChampionIcon(winner.name);
          resultEmbed = new EmbedBuilder()
            .setTitle('🎉 전투 결과! 승리!')
            .setDescription(
              `**${winner.nickname}** (${winner.name})\n` +
              `> <@${winner.id}>\n\n` +
              `상대: ${loser.nickname} (${loser.name})\n> <@${loser.id}>`
            )
            .setThumbnail(champIcon)
            .setColor('#ffe45c');
        } else {
          resultEmbed = new EmbedBuilder()
            .setTitle('⚖️ 무승부')
            .setDescription('둘 다 쓰러졌습니다!')
            .setColor('#bdbdbd');
        }
        battles.delete(battle.user.id);
        battles.delete(battle.enemy.id);
        if (battleTimers.has(`${battle.user.id}:${battle.enemy.id}`)) {
          clearTimeout(battleTimers.get(`${battle.user.id}:${battle.enemy.id}`));
          battleTimers.delete(`${battle.user.id}:${battle.enemy.id}`);
        }
        return interaction.update({
          content: null,
          embeds: [resultEmbed],
          components: [],
        });
      }

      battle.turn += 1;
      battle.isUserTurn = !battle.isUserTurn;
      const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
      battle.logs.push(`🎲 ${nextTurnUser.nickname} 턴!`);
      battle.logs = battle.logs.slice(-LOG_LIMIT);
      const nextTurnUserId = battle.isUserTurn ? battle.user.id : battle.enemy.id;
      await updateBattleView(interaction, battle, nextTurnUserId);
      return;
    }

    if (action === 'escape') {
      if (battle.turn >= 10 && battle.turn <= 30) {
        if (Math.random() < 0.5) {
          const champIcon = await getChampionIcon(enemy.name);
          const resultEmbed = new EmbedBuilder()
            .setTitle('🏃‍♂️ 도망 성공! 전투 종료')
            .setDescription(
              `**${enemy.nickname}** (${enemy.name})\n> <@${enemy.id}>\n\n` +
              `상대: ${user.nickname} (${user.name})\n> <@${user.id}> (도망)`
            )
            .setThumbnail(champIcon)
            .setColor('#c4eaa4');

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
            content: null,
            embeds: [resultEmbed],
            components: [],
          });
        } else {
          logs.push(`${user.nickname} 도망 실패... 턴만 날립니다.`);
          battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
          battle.turn += 1;
          battle.isUserTurn = !battle.isUserTurn;
          const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
          battle.logs.push(`🎲 ${nextTurnUser.nickname} 턴!`);
          battle.logs = battle.logs.slice(-LOG_LIMIT);
          const nextTurnUserId = battle.isUserTurn ? battle.user.id : battle.enemy.id;
          await updateBattleView(interaction, battle, nextTurnUserId);
          return;
        }
      } else {
        logs.push('지금은 도망칠 수 없습니다! (10~30턴만)');
        battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
        await updateBattleView(interaction, battle, userId);
        return;
      }
    }

    logs.push('지원하지 않는 행동입니다.');
    battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
    await updateBattleView(interaction, battle, userId);
  }
};
