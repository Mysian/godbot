const battleEngine = require('./battle-engine');
const { loadChampionUser, updateRecord } = require('./battle-storage');
const { battleEmbed } = require('../embeds/battle-embed');
const { getChampionIcon } = require('../utils/champion-utils');
const passives = require('../utils/passive-skills');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const updateBattleViewWithLogs = require('./updateBattleViewWithLogs');
const ITEMS = require('../utils/items.js');
const ACTIVE_SKILLS = require('../utils/active-skills.js');
const fs = require('fs');
const path = require('path');

const itemsPath = path.join(__dirname, '../data/items.json');
const skillsPath = path.join(__dirname, '../data/skills.json');

const battles = new Map();
const battleRequests = new Map();
const battleTimers = new Map();
const openBattleTimers = new Map();

const LOG_LIMIT = 10;

function forceDeleteBattle(userId, enemyId) {
  if (userId) battles.delete(userId);
  if (enemyId) battles.delete(enemyId);
}

async function handleBattleCommand(interaction) {
  const userId = interaction.user.id;
  const enemyUser = interaction.options.getUser('상대');
  const isOpenBattle = !enemyUser;

  let userChamp = await loadChampionUser(userId, interaction);
  if (!userChamp)
    return interaction.reply({ content: "보유한 챔피언이 없습니다!", ephemeral: true });

  if (battles.has(userId) || battleRequests.has(userId))
    return interaction.reply({ content: "이미 진행중인 배틀이 있습니다!", ephemeral: true });

  // 오픈배틀
  if (isOpenBattle) {
    if (battleRequests.has('open')) {
      return interaction.reply({ content: "이미 모집 중인 오픈배틀이 있습니다!", ephemeral: true });
    }
    battleRequests.set('open', { user: userChamp, interaction, createdAt: Date.now() });

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

    openBattleTimers.set(userId, setTimeout(() => {
      if (battleRequests.has('open')) {
        battleRequests.delete('open');
        interaction.editReply({ content: "⏰ 오픈배틀 모집이 만료되었습니다!", embeds: [], components: [] }).catch(() => {});
      }
      openBattleTimers.delete(userId);
    }, 120000));
    return;
  }

  // 지목배틀
  const enemyId = enemyUser.id;
  if (userId === enemyId)
    return interaction.reply({ content: "자기 자신과는 배틀할 수 없습니다!", ephemeral: true });

  let enemyChamp = await loadChampionUser(enemyId, interaction);
  if (!enemyChamp)
    return interaction.reply({ content: "상대가 챔피언을 소유하고 있지 않습니다!", ephemeral: true });
  if (battles.has(enemyId) || battleRequests.has(enemyId))
    return interaction.reply({ content: "상대가 이미 다른 배틀에 참여 중입니다!", ephemeral: true });

  battleRequests.set(userId, { user: userChamp, enemy: enemyChamp, interaction, createdAt: Date.now() });

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

  battleTimers.set(`${userId}:${enemyId}`, setTimeout(() => {
    if (battleRequests.has(enemyId)) {
      battleRequests.delete(enemyId);
      interaction.editReply({ content: "⏰ 챔피언 배틀 신청이 만료되었습니다!", embeds: [], components: [] }).catch(() => {});
    }
    battleTimers.delete(`${userId}:${enemyId}`);
  }, 120000));
}

async function handleBattleButton(interaction) {
  let replied = false;
  try {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    // 오픈배틀 수락
    if (customId.startsWith('accept_battle_open_')) {
      try {
        const challengerId = customId.replace(/^.*_/, '');
        const request = battleRequests.get('open');
        if (!request) {
          await interaction.reply({ content: '오픈배틀이 존재하지 않습니다.', ephemeral: true }); replied = true; return;
        }
        if (challengerId === userId) {
          await interaction.reply({ content: '자기 자신은 수락할 수 없습니다!', ephemeral: true }); replied = true; return;
        }
        if (battles.has(userId) || battleRequests.has(userId)) {
          await interaction.reply({ content: '이미 배틀 중이거나 대기중입니다.', ephemeral: true }); replied = true; return;
        }

        let enemyChamp = await loadChampionUser(userId, interaction);
        if (!enemyChamp) {
          await interaction.reply({ content: "챔피언을 소유하고 있지 않습니다!", ephemeral: true }); replied = true; return;
        }

        const userChamp = request.user;

        battleRequests.delete('open');
        if (openBattleTimers.has(challengerId)) {
          clearTimeout(openBattleTimers.get(challengerId));
          openBattleTimers.delete(challengerId);
        }

        forceDeleteBattle(userChamp.id, enemyChamp.id);

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
        replied = true; return;
      } catch (e) {
        console.error('[오픈배틀 수락 오류]', e);
        if (!replied) try { await interaction.reply({ content: '❌ 오픈배틀 수락 오류!', ephemeral: true }); } catch {}
        replied = true; return;
      }
    }

    // 기존 배틀 수락/거절
    if (customId.startsWith('accept_battle_') || customId.startsWith('decline_battle_')) {
      try {
        const challengerId = customId.replace(/^.*_/, '');
        const request = battleRequests.get(challengerId);
        if (!request) {
          await interaction.reply({ content: '이미 만료되었거나 존재하지 않는 배틀 요청입니다.', ephemeral: true }); replied = true; return;
        }

        if (customId.startsWith('decline_battle_')) {
          battleRequests.delete(challengerId);
          if (battleTimers.has(`${challengerId}:${userId}`)) {
            clearTimeout(battleTimers.get(`${challengerId}:${userId}`));
            battleTimers.delete(`${challengerId}:${userId}`);
          }
          forceDeleteBattle(request.user.id, userId);
          await interaction.update({ content: '배틀 요청을 거절했습니다.', embeds: [], components: [] });
          replied = true; return;
        }

        if (battles.has(userId) || battleRequests.has(userId)) {
          await interaction.reply({ content: '이미 배틀 중이거나 대기중입니다.', ephemeral: true }); replied = true; return;
        }

        let enemyChamp = await loadChampionUser(userId, interaction);
        if (!enemyChamp) {
          await interaction.reply({ content: "챔피언을 소유하고 있지 않습니다!", ephemeral: true }); replied = true; return;
        }

        const userChamp = request.user;

        battleRequests.delete(challengerId);
        if (battleTimers.has(`${challengerId}:${userId}`)) {
          clearTimeout(battleTimers.get(`${challengerId}:${userId}`));
          battleTimers.delete(`${challengerId}:${userId}`);
        }

        forceDeleteBattle(userChamp.id, enemyChamp.id);

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
        replied = true; return;
      } catch (e) {
        console.error('[배틀 수락/거절 오류]', e);
        if (!replied) try { await interaction.reply({ content: '❌ 배틀 수락/거절 오류!', ephemeral: true }); } catch {}
        replied = true; return;
      }
    }

    // ↓↓↓ 실제 배틀의 모든 버튼(공격/방어/점멸/아이템/스킬/도망 등) 분기 ↓↓↓
    if (!battles.has(userId)) {
      await interaction.reply({ content: '진행 중인 배틀이 없습니다.', ephemeral: true }); replied = true; return;
    }
    const battle = battles.get(userId);
    if (battle.finished) {
      await interaction.reply({ content: '이미 종료된 배틀입니다.', ephemeral: true }); replied = true; return;
    }

    const isMyTurn = (battle.isUserTurn && battle.user.id === userId) ||
                     (!battle.isUserTurn && battle.enemy.id === userId);
    const currentPlayer = battle.isUserTurn ? battle.user : battle.enemy;
    if (!isMyTurn || currentPlayer.stunned) {
      await interaction.reply({ content: '행동 불가 상태입니다. (기절/비활성/상대턴)', ephemeral: true }); replied = true; return;
    }

    const user = battle.isUserTurn ? battle.user : battle.enemy;
    const enemy = battle.isUserTurn ? battle.enemy : battle.user;

    const action = interaction.customId;
    let logs = [];
    let context = {
      lastAction: action,
      effects: battle.effects,
      damage: 0,
      enemyId: enemy.id,
      enemy,
    };

    // 패시브 onTurnStart
    try {
      logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onTurnStart', battle));
    } catch (e) {
      console.error('[패시브 onTurnStart user]', e);
    }
    try {
      logs.push(...battleEngine.resolvePassive(enemy, user, context, 'onTurnStart', battle));
    } catch (e) {
      console.error('[패시브 onTurnStart enemy]', e);
    }

    // 아이템 버튼 → 소지품 목록 임베드 전환
    if (action === 'item') {
      try {
        const items = fs.existsSync(itemsPath) ? JSON.parse(fs.readFileSync(itemsPath, 'utf8')) : {};
        const myItems = items[user.id] || {};
        const itemList = Object.entries(myItems).filter(([name, v]) => v.count > 0);

        if (itemList.length === 0) {
          await interaction.reply({ content: "소지한 아이템이 없습니다!", ephemeral: true }); replied = true; return;
        }

        const embed = new EmbedBuilder()
          .setTitle('🎒 내 아이템 목록')
          .setDescription(itemList.map(([name, v], idx) => `${idx + 1}. **${name}** x${v.count}\n${v.desc || ''}`).join('\n'))
          .setFooter({ text: '사용할 아이템을 선택하세요!' });

        const row = new ActionRowBuilder();
        itemList.slice(0, 5).forEach(([name, v], idx) => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`useitem_${name}`)
              .setLabel(name)
              .setStyle(ButtonStyle.Primary)
          );
        });

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        replied = true; return;
      } catch (e) {
        console.error('[아이템 목록 임베드 오류]', e);
        if (!replied) try { await interaction.reply({ content: "아이템 임베드 생성 오류!", ephemeral: true }); } catch {}
        replied = true; return;
      }
    }

    // 스킬 버튼 → 소지 스킬 목록 임베드 전환
    if (action === 'skill') {
      try {
        const skills = fs.existsSync(skillsPath) ? JSON.parse(fs.readFileSync(skillsPath, 'utf8')) : {};
        const mySkills = skills[user.id] || {};
        const skillList = Object.keys(mySkills);

        if (skillList.length === 0) {
          await interaction.reply({ content: "소지한 스킬이 없습니다!", ephemeral: true }); replied = true; return;
        }

        const embed = new EmbedBuilder()
          .setTitle('📚 내 스킬 목록')
          .setDescription(skillList.map((name, idx) => `${idx + 1}. **${name}**\n${mySkills[name].desc || ''}`).join('\n'))
          .setFooter({ text: '사용할 스킬을 선택하세요!' });

        const row = new ActionRowBuilder();
        skillList.slice(0, 5).forEach((name, idx) => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`useskill_${name}`)
              .setLabel(name)
              .setStyle(ButtonStyle.Primary)
          );
        });

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        replied = true; return;
      } catch (e) {
        console.error('[스킬 목록 임베드 오류]', e);
        if (!replied) try { await interaction.reply({ content: "스킬 임베드 생성 오류!", ephemeral: true }); } catch {}
        replied = true; return;
      }
    }

    // 실제 아이템 사용
if (action.startsWith('useitem_')) {
  try {
    const itemName = action.replace('useitem_', '');
    const items = fs.existsSync(itemsPath) ? JSON.parse(fs.readFileSync(itemsPath, 'utf8')) : {};
    user.items = items[user.id];

    // 오류 콘솔 로그 체크   
    console.log('effect 실행 전', { user, context, itemName, items: user.items });

    if (!items[user.id] || !items[user.id][itemName] || items[user.id][itemName].count <= 0) {
      await interaction.reply({ content: "해당 아이템이 없습니다!", ephemeral: true }); replied = true; return;
    }
    if (!ITEMS[itemName] || typeof ITEMS[itemName].effect !== 'function') {
      await interaction.reply({ content: `해당 아이템 효과를 찾을 수 없습니다.`, ephemeral: true }); replied = true; return;
    }

    let log;
try {
  log = ITEMS[itemName].effect(user, context);

  // 아이템 효과 즉시 반영!
  const effectLogs = require('./context').applyEffects(user, enemy, context);
  if (effectLogs && effectLogs.length > 0) {
    log += "\n" + effectLogs.join('\n');
  }
} catch (e) {
  console.error('[아이템 효과 실행 중 에러]', e);
      await interaction.reply({ content: `아이템 효과 실행 중 오류!`, ephemeral: true }); replied = true; return;
    }

    items[user.id][itemName].count -= 1;
    fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2));
    battle.logs = (battle.logs || []).concat([log]).slice(-LOG_LIMIT);

    // **[1] 먼저, 버튼 누른 유저에게 안내 (ephemeral reply)**
    await interaction.reply({ 
      content: log || `${itemName} 아이템을 사용했습니다!`, 
      ephemeral: true 
    });
    replied = true;


    return;

  } catch (e) {
    console.error('❌ [디버그] 아이템 사용 처리 에러:', e);
    if (!replied) try { await interaction.reply({ content: '❌ 아이템 사용 중 알 수 없는 오류 발생!', ephemeral: true }); } catch {}
    replied = true; return;
  }
}


    // 실제 스킬 사용
    if (action.startsWith('useskill_')) {
      try {
        const skillName = action.replace('useskill_', '');
        if (!ACTIVE_SKILLS[skillName] || typeof ACTIVE_SKILLS[skillName].effect !== 'function') {
          await interaction.reply({ content: `해당 스킬 효과를 찾을 수 없습니다.`, ephemeral: true }); replied = true; return;
        }
        const skills = fs.existsSync(skillsPath) ? JSON.parse(fs.readFileSync(skillsPath, 'utf8')) : {};
        user.skills = Object.keys(skills[user.id] || {});
        let log;
        try {
          log = ACTIVE_SKILLS[skillName].effect(user, enemy, context, battle);
        } catch (e) {
          console.error('[스킬 효과 실행 에러]', e);
          await interaction.reply({ content: '❌ 스킬 효과 실행 중 오류!', ephemeral: true }); replied = true; return;
        }
        battle.logs = (battle.logs || []).concat([log]).slice(-LOG_LIMIT);

        await updateBattleView(interaction, battle, user.id);
        replied = true; return;
      } catch (e) {
        console.error('❌ [디버그] 스킬 사용 처리 에러:', e);
        if (!replied) try { await interaction.reply({ content: '❌ 스킬 사용 중 알 수 없는 오류 발생!', ephemeral: true }); } catch {}
        replied = true; return;
      }
    }

    // ★ 공격/방어/점멸/턴 진행/피해 처리 (기존 구조)
    battle.logs = prevLogs.concat(newLogs).slice(-LOG_LIMIT);
await updateBattleView(interaction, battle, battle.isUserTurn ? battle.user.id : battle.enemy.id);

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
            forceDeleteBattle(user.id, enemy.id);
            if (battleTimers.has(`${battle.user.id}:${battle.enemy.id}`)) {
              clearTimeout(battleTimers.get(`${battle.user.id}:${battle.enemy.id}`));
              battleTimers.delete(`${battle.user.id}:${battle.enemy.id}`);
            }
            await interaction.update(resultEmbed);
            replied = true; return;
          } else {
            logs.push(`${user.nickname} 도망 실패... 턴만 날립니다.`);
            battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
            battle.turn += 1;
            battle.isUserTurn = !battle.isUserTurn;
            const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
            battle.logs.push(` <@${nextTurnUser.id}> 턴!`);
            battle.logs = battle.logs.slice(-LOG_LIMIT);
            await updateBattleView(interaction, battle, nextTurnUser.id);
            replied = true; return;
          }
        } else {
          logs.push('지금은 도망칠 수 없습니다! (10~30턴만)');
          battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
          await updateBattleView(interaction, battle, user.id);
          replied = true; return;
        }
      } catch (e) {
        console.error('[도망 처리 오류]', e);
        if (!replied) try { await interaction.reply({ content: '❌ 도망 처리 중 오류!', ephemeral: true }); } catch {}
        replied = true; return;
      }
    }

    logs.push('지원하지 않는 행동입니다.');
    battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
    await updateBattleView(interaction, battle, user.id);
    replied = true; return;

  } catch (e) {
    console.error('❌ [디버그] 버튼 클릭시 에러:', e);
    if (!replied) {
      try { await interaction.reply({ content: '❌ 오류 발생! 영갓에게 제보해주세요.', ephemeral: true }); } catch {}
    }
    return;
  }
}

async function updateBattleView(interaction, battle, activeUserId) {
  const key = `${battle.user.id}:${battle.enemy.id}`;
  if (battleTimers.has(key)) clearTimeout(battleTimers.get(key));
  battleTimers.set(key, setTimeout(async () => {
    battle.finished = true;
    forceDeleteBattle(battle.user.id, battle.enemy.id);
    try {
      await interaction.editReply({
        content: '⏰ 2분(120초) 동안 행동이 없어 배틀이 자동 종료되었습니다.',
        embeds: [],
        components: []
      });
    } catch (e) {}
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
