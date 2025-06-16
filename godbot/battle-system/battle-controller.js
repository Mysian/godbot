const battleEngine = require('./battle-engine');
const { loadChampionUser, updateRecord } = require('./battle-storage');
const { battleEmbed } = require('../embeds/battle-embed');
const { getChampionIcon } = require('../utils/champion-utils');
const passives = require('../utils/passive-skills');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const battles = new Map();
const battleRequests = new Map();
const battleTimers = new Map();
const openBattleTimers = new Map();

const LOG_LIMIT = 10;

async function handleBattleCommand(interaction) {
  const userId = interaction.user.id;
  const enemyUser = interaction.options.getUser('상대');
  const isOpenBattle = !enemyUser;

  // 유저 챔피언 정보 로딩
  let userChamp = await loadChampionUser(userId, interaction);
  if (!userChamp)
    return interaction.reply({ content: "보유한 챔피언이 없습니다!", ephemeral: true });

  // 이미 배틀 중이면 차단
  if (battles.has(userId) || battleRequests.has(userId))
    return interaction.reply({ content: "이미 진행중인 배틀이 있습니다!", ephemeral: true });

  // 🟠 오픈배틀 분기 (상대 미지정)
  if (isOpenBattle) {
    // 이미 오픈배틀 모집 중이면 차단
    if (battleRequests.has('open')) {
      return interaction.reply({ content: "이미 모집 중인 오픈배틀이 있습니다!", ephemeral: true });
    }
    battleRequests.set('open', { user: userChamp, interaction, createdAt: Date.now() });

    // ⬇️ 내 챔피언 정보 + 능력치 + 패시브 + 아이콘
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
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_battle_open_${userId}`)
          .setLabel('수락')
          .setStyle(ButtonStyle.Success)
      );

    await interaction.reply({ embeds: [embed], components: [row] });

    // 120초 후 모집 자동 만료
    openBattleTimers.set(userId, setTimeout(() => {
      if (battleRequests.has('open')) {
        battleRequests.delete('open');
        interaction.editReply({ content: "⏰ 오픈배틀 모집이 만료되었습니다!", embeds: [], components: [] }).catch(() => {});
      }
      openBattleTimers.delete(userId);
    }, 120000));
    return;
  }

  // 🟠 지목배틀 (상대 지정)
  const enemyId = enemyUser.id;
  if (userId === enemyId)
    return interaction.reply({ content: "자기 자신과는 배틀할 수 없습니다!", ephemeral: true });

  // 상대 챔피언 정보 로딩
  let enemyChamp = await loadChampionUser(enemyId, interaction);
  if (!enemyChamp)
    return interaction.reply({ content: "상대가 챔피언을 소유하고 있지 않습니다!", ephemeral: true });
  if (battles.has(enemyId) || battleRequests.has(enemyId))
    return interaction.reply({ content: "상대가 이미 다른 배틀에 참여 중입니다!", ephemeral: true });

  battleRequests.set(enemyId, { user: userChamp, enemy: enemyChamp, interaction, createdAt: Date.now() });

  // ⬇️ 상대에게 수락/거절 임베드 보내기 (능력치/패시브 포함)
  const userIcon = await getChampionIcon(userChamp.name);
  const userPassive = passives[userChamp.name]?.description || '정보 없음';
  const enemyIcon = await getChampionIcon(enemyChamp.name);
  const enemyPassive = passives[enemyChamp.name]?.description || '정보 없음';

  const embed = new EmbedBuilder()
    .setTitle("⚔️ 챔피언 배틀 신청")
    .setDescription(`<@${enemyId}>님, <@${userId}>가 배틀을 신청했습니다!`)
    .addFields(
      { name: "신청자 챔피언", value: `${userChamp.name} (${userChamp.nickname})`, inline: true },
      { name: "상대 챔피언", value: `${enemyChamp.name} (${enemyChamp.nickname})`, inline: true },
      { name: "신청자 패시브", value: userPassive, inline: false },
      { name: "상대 패시브", value: enemyPassive, inline: false }
    )
    .setThumbnail(enemyIcon)
    .setColor('#5e6cff');

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_battle_${userId}`)
        .setLabel('수락')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`decline_battle_${userId}`)
        .setLabel('거절')
        .setStyle(ButtonStyle.Danger)
    );

  await interaction.reply({ embeds: [embed], components: [row] });

  // 120초 후 자동 만료
  battleTimers.set(`${userId}:${enemyId}`, setTimeout(() => {
    if (battleRequests.has(enemyId)) {
      battleRequests.delete(enemyId);
      interaction.editReply({ content: "⏰ 챔피언 배틀 신청이 만료되었습니다!", embeds: [], components: [] }).catch(() => {});
    }
    battleTimers.delete(`${userId}:${enemyId}`);
  }, 120000));
}


async function handleBattleButton(interaction) {
  try {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    console.log('버튼 이벤트:', { customId, userId });

    // 오픈배틀 수락
    if (customId.startsWith('accept_battle_open_')) {
      try {
        const challengerId = customId.replace(/^.*_/, '');
        const request = battleRequests.get('open');
        if (!request)
          return await interaction.reply({ content: '오픈배틀이 존재하지 않습니다.', ephemeral: true });
        if (challengerId === userId)
          return await interaction.reply({ content: '자기 자신은 수락할 수 없습니다!', ephemeral: true });
        if (battles.has(userId) || battleRequests.has(userId))
          return await interaction.reply({ content: '이미 배틀 중이거나 대기중입니다.', ephemeral: true });

        let enemyChamp = await loadChampionUser(userId, interaction);
        if (!enemyChamp)
          return await interaction.reply({ content: "챔피언을 소유하고 있지 않습니다!", ephemeral: true });

        const userChamp = request.user;

        battleRequests.delete('open');
        if (openBattleTimers.has(challengerId)) {
          clearTimeout(openBattleTimers.get(challengerId));
          openBattleTimers.delete(challengerId);
        }

        const battle = {
          user: userChamp,
          enemy: enemyChamp,
          turn: 1,
          isUserTurn: true,
          finished: false,
          logs: [],
          effects: {},
        };
        battles.set(userChamp.id, battle);
        battles.set(enemyChamp.id, battle);

        await updateBattleView(interaction, battle, userChamp.id);
        return;
      } catch (e) {
        console.error('오픈배틀 수락 에러:', e);
        try { await interaction.reply({ content: '❌ 오픈배틀 수락 오류!', ephemeral: true }); } catch {}
        return;
      }
    }

    // 기존 배틀 수락/거절
    if (customId.startsWith('accept_battle_') || customId.startsWith('decline_battle_')) {
      try {
        const challengerId = customId.replace(/^.*_/, '');
        const request = battleRequests.get(challengerId);
        if (!request)
          return await interaction.reply({ content: '이미 만료되었거나 존재하지 않는 배틀 요청입니다.', ephemeral: true });

        if (customId.startsWith('decline_battle_')) {
          battleRequests.delete(challengerId);
          if (battleTimers.has(`${challengerId}:${userId}`)) {
            clearTimeout(battleTimers.get(`${challengerId}:${userId}`));
            battleTimers.delete(`${challengerId}:${userId}`);
          }
          return await interaction.update({ content: '배틀 요청을 거절했습니다.', embeds: [], components: [] });
        }

        if (battles.has(userId) || battleRequests.has(userId))
          return await interaction.reply({ content: '이미 배틀 중이거나 대기중입니다.', ephemeral: true });

        let enemyChamp = await loadChampionUser(userId, interaction);
        if (!enemyChamp)
          return await interaction.reply({ content: "챔피언을 소유하고 있지 않습니다!", ephemeral: true });

        const userChamp = request.user;

        battleRequests.delete(challengerId);
        if (battleTimers.has(`${challengerId}:${userId}`)) {
          clearTimeout(battleTimers.get(`${challengerId}:${userId}`));
          battleTimers.delete(`${challengerId}:${userId}`);
        }

        const battle = {
          user: userChamp,
          enemy: enemyChamp,
          turn: 1,
          isUserTurn: true,
          finished: false,
          logs: [],
          effects: {},
        };
        battles.set(userChamp.id, battle);
        battles.set(enemyChamp.id, battle);

        await updateBattleView(interaction, battle, userChamp.id);
        return;
      } catch (e) {
        console.error('지목 배틀 수락/거절 에러:', e);
        try { await interaction.reply({ content: '❌ 배틀 수락/거절 오류!', ephemeral: true }); } catch {}
        return;
      }
    }

    // 배틀 진행(공격/방어/점멸/아이템/스킬/도망 등)
    if (!battles.has(userId))
      return await interaction.reply({ content: '진행 중인 배틀이 없습니다.', ephemeral: true });
    const battle = battles.get(userId);
    if (battle.finished)
      return await interaction.reply({ content: '이미 종료된 배틀입니다.', ephemeral: true });

    const isMyTurn = (battle.isUserTurn && battle.user.id === userId) ||
                     (!battle.isUserTurn && battle.enemy.id === userId);
    const currentPlayer = battle.isUserTurn ? battle.user : battle.enemy;
    if (!isMyTurn || currentPlayer.stunned)
      return await interaction.reply({ content: '행동 불가 상태입니다. (기절/비활성/상대턴)', ephemeral: true });

    const user = battle.isUserTurn ? battle.user : battle.enemy;
    const enemy = battle.isUserTurn ? battle.enemy : battle.user;

    const action = interaction.customId;
    let logs = [];
    let context = {
      lastAction: action,
      effects: battle.effects,
      damage: 0,
    };

    // 아이템
    if (action === 'item') {
      try {
        logs.push(...battleEngine.useItem(user, '회복포션', context));
        logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onItem'));
        battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
        await updateBattleView(interaction, battle, userId);
        return;
      } catch (e) {
        console.error('item 분기 에러:', e);
        try { await interaction.reply({ content: '❌ 아이템 사용 오류!', ephemeral: true }); } catch {}
        return;
      }
    }
    // 스킬
    if (action === 'skill') {
      try {
        logs.push(...battleEngine.useSkill(user, enemy, '섬광', context));
        logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onSkill'));
        battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
        await updateBattleView(interaction, battle, userId);
        return;
      } catch (e) {
        console.error('skill 분기 에러:', e);
        try { await interaction.reply({ content: '❌ 스킬 사용 오류!', ephemeral: true }); } catch {}
        return;
      }
    }
    // 방어
   if (action === 'defend') {
  try {
    logs.push(battleEngine.defend(user, context));
    logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onDefend'));
    battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);

    // ★ 여기서 턴 넘김
    battle.turn += 1;
    battle.isUserTurn = !battle.isUserTurn;
    const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
    battle.logs.push(` ${nextTurnUser.nickname} 턴!`);
    battle.logs = battle.logs.slice(-LOG_LIMIT);
    const nextTurnUserId = battle.isUserTurn ? battle.user.id : battle.enemy.id;

    await updateBattleView(interaction, battle, nextTurnUserId);
    return;
  } catch (e) {
    console.error('defend 분기 에러:', e);
    try { await interaction.reply({ content: '❌ 방어 오류!', ephemeral: true }); } catch {}
    return;
  }
}
 // 점멸
if (action === 'dodge') {
  try {
    logs.push(battleEngine.dodge(user, context));
    logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onDodge'));
    battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);

    // ★ 여기서 턴 넘김
    battle.turn += 1;
    battle.isUserTurn = !battle.isUserTurn;
    const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
    battle.logs.push(` ${nextTurnUser.nickname} 턴!`);
    battle.logs = battle.logs.slice(-LOG_LIMIT);
    const nextTurnUserId = battle.isUserTurn ? battle.user.id : battle.enemy.id;

    await updateBattleView(interaction, battle, nextTurnUserId);
    return;
  } catch (e) {
    console.error('dodge 분기 에러:', e);
    try { await interaction.reply({ content: '❌ 점멸 오류!', ephemeral: true }); } catch {}
    return;
  }
}
    // 공격
    if (action === 'attack') {
      try {
        battleEngine.attack(user, enemy, context);
        if (enemy.isDodging) {
          if (Math.random() < 0.2) {
            context.damage = 0;
            logs.push(`⚡ ${enemy.nickname} 점멸 성공!`);
          } else {
            logs.push(`🌧️ ${enemy.nickname} 점멸 실패!`);
          }
          enemy.isDodging = false;
        }
        if (enemy.isDefending && context.damage > 0) {
          context.damage = Math.floor(context.damage * 0.5);
          logs.push(`${enemy.nickname}의 방어! 피해 50% 감소.`);
          enemy.isDefending = false;
        }
        logs.push(`⚔️ ${user.nickname}의 평타! (${context.damage} 데미지)`);
        logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onAttack'));
        logs.push(...battleEngine.applyEffects(enemy, user, context));
        enemy.hp = Math.max(0, enemy.hp - context.damage);

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
            resultEmbed = {
              content: null,
              embeds: [
                {
                  title: '🎉 전투 결과! 승리!',
                  description:
                    `**${winner.nickname}** (${winner.name})\n` +
                    `> <@${winner.id}>\n\n` +
                    `상대: ${loser.nickname} (${loser.name})\n> <@${loser.id}>`,
                  thumbnail: { url: champIcon },
                  color: 0xffe45c
                }
              ],
              components: []
            };
          } else {
            resultEmbed = {
              content: null,
              embeds: [{ title: '⚖️ 무승부', description: '둘 다 쓰러졌습니다!', color: 0xbdbdbd }],
              components: []
            };
          }
          battles.delete(battle.user.id);
          battles.delete(battle.enemy.id);
          if (battleTimers.has(`${battle.user.id}:${battle.enemy.id}`)) {
            clearTimeout(battleTimers.get(`${battle.user.id}:${battle.enemy.id}`));
            battleTimers.delete(`${battle.user.id}:${battle.enemy.id}`);
          }
          await interaction.update(resultEmbed);
          return;
        }

        battle.turn += 1;
        battle.isUserTurn = !battle.isUserTurn;
        const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
        battle.logs.push(` ${nextTurnUser.nickname} 턴!`);
        battle.logs = battle.logs.slice(-LOG_LIMIT);
        const nextTurnUserId = battle.isUserTurn ? battle.user.id : battle.enemy.id;
        await updateBattleView(interaction, battle, nextTurnUserId);
        return;
      } catch (e) {
        console.error('attack 분기 에러:', e);
        try { await interaction.reply({ content: '❌ 공격 오류!', ephemeral: true }); } catch {}
        return;
      }
    }
    // 도망
    if (action === 'escape') {
      try {
        if (battle.turn >= 10 && battle.turn <= 30) {
          if (Math.random() < 0.5) {
            const champIcon = await getChampionIcon(enemy.name);
            const resultEmbed = {
              content: null,
              embeds: [
                {
                  title: '🏃‍♂️ 도망 성공! 전투 종료',
                  description:
                    `**${enemy.nickname}** (${enemy.name})\n> <@${enemy.id}>\n\n` +
                    `상대: ${user.nickname} (${user.name})\n> <@${user.id}> (도망)`,
                  thumbnail: { url: champIcon },
                  color: 0xc4eaa4
                }
              ],
              components: []
            };
            battle.finished = true;
            await updateRecord(user.id, user.name, 'lose');
            await updateRecord(enemy.id, enemy.name, 'win');
            battles.delete(user.id);
            battles.delete(enemy.id);
            if (battleTimers.has(`${battle.user.id}:${battle.enemy.id}`)) {
              clearTimeout(battleTimers.get(`${battle.user.id}:${battle.enemy.id}`));
              battleTimers.delete(`${battle.user.id}:${battle.enemy.id}`);
            }
            await interaction.update(resultEmbed);
            return;
          } else {
            logs.push(`${user.nickname} 도망 실패... 턴만 날립니다.`);
            battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
            battle.turn += 1;
            battle.isUserTurn = !battle.isUserTurn;
            const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
            battle.logs.push(` ${nextTurnUser.nickname} 턴!`);
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
      } catch (e) {
        console.error('escape 분기 에러:', e);
        try { await interaction.reply({ content: '❌ 도망 오류!', ephemeral: true }); } catch {}
        return;
      }
    }

    logs.push('지원하지 않는 행동입니다.');
    battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
    try {
      await updateBattleView(interaction, battle, userId);
    } catch (e) {
      console.error('지원하지 않는 행동 에러:', e);
      try { await interaction.reply({ content: '❌ 지원하지 않는 행동 오류!', ephemeral: true }); } catch {}
    }
    return;
  } catch (e) {
    console.error('handleBattleButton 전체 에러:', e);
    try { await interaction.reply({ content: '❌ 버튼 실행 중 알 수 없는 오류 발생. (관리자 로그 참고)', ephemeral: true }); } catch {}
    return;
  }
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
    } catch (e) {
      console.error('배틀 자동종료 followUp 에러:', e);
    }
  }, 120000));
  try {
    const view = await battleEmbed({
      user: battle.user,
      enemy: battle.enemy,
      turn: battle.turn,
      logs: battle.logs,
      isUserTurn: battle.isUserTurn,
      activeUserId
    });
    await interaction.update(view);
  } catch (e) {
    console.error('updateBattleView 내부 에러:', e);
    try { await interaction.reply({ content: '❌ 배틀창 갱신 오류!', ephemeral: true }); } catch {}
  }
}

module.exports = {
  battles,
  battleRequests,
  battleTimers,
  openBattleTimers,
  handleBattleCommand,
  handleBattleButton,
  updateBattleView,
};
