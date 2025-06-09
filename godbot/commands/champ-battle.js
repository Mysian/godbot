// commands/champ-battle.js
// ─────────────────────────────────────────────────────────────

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  initBattleContext,
  processTurnStart,
  calculateDamage
} = require('../utils/battleEngine');
const skills = require('../utils/skills');

const userDataPath = path.join(__dirname, '../data/champion-users.json');
const recordPath   = path.join(__dirname, '../data/champion-records.json');
const battlePath   = path.join(__dirname, '../data/battle-active.json');

function load(p){ if(!fs.existsSync(p)) fs.writeFileSync(p,'{}'); return JSON.parse(fs.readFileSync(p)); }
function save(p,d){ fs.writeFileSync(p, JSON.stringify(d,null,2)); }

function createHpBar(c,m){
  const total=10, filled=Math.round((c/m)*total);
  return '🟥'.repeat(filled)+'⬜'.repeat(total-filled);
}

function getStatusIcons(effects){
  let s='';
  if(effects.stunned) s+='💫';
  if(effects.dot)     s+='☠️';
  return s;
}

function createBattleEmbed(challenger, opponent, battle, userData, turnId, log=''){
  const ch=userData[challenger.id], op=userData[opponent.id];
  const chp=battle.hp[challenger.id], ohp=battle.hp[opponent.id];
  return new EmbedBuilder()
    .setTitle('⚔️ 챔피언 배틀')
    .setDescription(`${challenger.username} vs ${opponent.username}`)
    .addFields(
      {
        name:`👑 ${challenger.username}`,
        value:`${ch.name} ${getStatusIcons(battle.context.effects[challenger.id])}\n💖 ${chp}/${ch.stats.hp}\n${createHpBar(chp,ch.stats.hp)}`,
        inline:true
      },
      {
        name:`🛡️ ${opponent.username}`,
        value:`${op.name} ${getStatusIcons(battle.context.effects[opponent.id])}\n💖 ${ohp}/${op.stats.hp}\n${createHpBar(ohp,op.stats.hp)}`,
        inline:true
      },
      { name:'🎯 현재 턴', value:`<@${turnId}>`, inline:false },
      { name:'📢 행동 결과', value: log||'없음', inline:false }
    )
    .setThumbnail(getChampionIcon(ch.name))
    .setColor(0x3498db);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('챔피언배틀')
    .setDescription('지정한 유저와 챔피언을 배틀합니다.')
    .addUserOption(opt=>opt.setName('상대').setDescription('대전 상대').setRequired(true)),

  async execute(interaction){
    const challenger=interaction.user, opponent=interaction.options.getUser('상대');
    if(challenger.id===opponent.id)
      return interaction.reply({ content:'❌ 자신과 대전할 수 없습니다.', ephemeral:true });

    const userData=load(userDataPath), bd=load(battlePath);
    if(!userData[challenger.id]||!userData[opponent.id])
      return interaction.reply({ content:'❌ 양쪽 모두 챔피언이 필요합니다.', ephemeral:true });
    if(Object.values(bd).some(b=>[b.challenger,b.opponent].includes(challenger.id)||[b.challenger,b.opponent].includes(opponent.id)))
      return interaction.reply({ content:'⚔️ 이미 전투 중인 유저가 있습니다.', ephemeral:true });

    // 요청
    const req=await interaction.reply({ content:`📝 <@${opponent.id}>님, ${challenger.username}님이 배틀을 요청합니다.`,
      components:[new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept').setLabel('✅ 수락').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decline').setLabel('❌ 거절').setStyle(ButtonStyle.Danger)
      )], fetchReply:true
    });

    const rc=req.createMessageComponentCollector({ time:30000 });
    rc.on('collect',async btn=>{
      if(btn.user.id!==opponent.id)
        return btn.reply({ content:'⛔ 요청받은 유저만 가능합니다.', ephemeral:true });
      await btn.deferUpdate();
      if(btn.customId==='decline'){
        await btn.editReply({ content:`❌ 거절되었습니다.`, components:[] });
        return rc.stop();
      }
      rc.stop();

      // 전투 등록
      const battleId=`${challenger.id}_${opponent.id}`;
      bd[battleId]={
        challenger:challenger.id,
        opponent:opponent.id,
        hp:{
          [challenger.id]:userData[challenger.id].stats.hp,
          [opponent.id]:   userData[opponent.id].stats.hp
        },
        turn:challenger.id,
        logs:[],
      };
      initBattleContext(bd[battleId]);
      save(battlePath,bd);

      let embed=createBattleEmbed(challenger,opponent,bd[battleId],userData,challenger.id);
      const btns=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('🗡️ 평타').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 방어').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('skill').setLabel('✨ 스킬').setStyle(ButtonStyle.Primary)
      );
      await btn.editReply({ content:'⚔️ 전투 시작!', embeds:[embed], components:[btns] });
      const battleMsg=await btn.fetchReply();

      // 턴 콜렉터
      let tc;
      const startTurn=()=>{
        if(tc)tc.stop();
        processTurnStart(userData,bd[battleId]);
        tc=battleMsg.createMessageComponentCollector({ idle:30000, time:300000 });
        tc.on('collect',async i=>{
          const cur=bd[battleId], uid=i.user.id;
          if(cur.turn!==uid) return i.reply({ content:'⛔ 지금 당신 턴이 아닙니다.', ephemeral:true });

          const skillObj=skills[userData[uid].name];
          let log='', damageInfo;

          if(i.customId==='attack' || i.customId==='defend'){
            // 평타/방어: 평타는 calculateDamage, 방어는 패시브로 피해감소
            if(i.customId==='defend'){
              cur.logs.push(`🛡️ ${userData[uid].name}이 방어 자세를 취했습니다.`);
            } else {
              damageInfo=calculateDamage(userData[uid].stats,userData[cur.challenger===uid?cur.opponent:cur.challenger].stats,true);
              cur.hp[cur.challenger===uid?cur.opponent:cur.challenger]-=damageInfo.damage;
              log=damageInfo.log;
            }
          } else { // 스킬
            // 쿨다운 체크
            const cd = bd[battleId].context.cooldowns[uid][skillObj.name]||0;
            if(cd>0) return i.reply({ content:`❗ 스킬 쿨다운: ${cd}턴 남음`, ephemeral:true });

            // 스킬 데미지 계산
            const raw=calculateDamage(userData[uid].stats, userData[cur.challenger===uid?cur.opponent:cur.challenger].stats,true);
            const dmg=Math.floor(raw.damage*skillObj.adRatio + userData[uid].stats.ap*skillObj.apRatio);
            const tgt = cur.challenger===uid?cur.opponent:cur.challenger;
            cur.hp[tgt]-=dmg;
            skillObj.effect(
              userData[uid], userData[tgt], dmg, bd[battleId].context
            );
            bd[battleId].context.cooldowns[uid][skillObj.name]=skillObj.cooldown;
            log=`✨ ${skillObj.name} 발동! ${dmg} 데미지`;
          }

          // 전투 로그 & 턴 교체
          if(log) cur.logs.push(log);
          cur.turn = (cur.turn===cur.challenger?cur.opponent:cur.challenger);
          save(battlePath,bd);

          // 승리 체크
          const loser = cur.challenger===uid?cur.opponent:cur.challenger;
          if(cur.hp[loser]<=0){
            tc.stop();
            // (전적 업데이트 생략)
            const winEmbed=new EmbedBuilder()
              .setTitle('🏆 승리!')
              .setDescription(`${i.user.username}님 승리!`)
              .setColor(0x00ff88);
            return i.update({ content:null, embeds:[winEmbed], components:[] });
          }

          // 다음턴 임베드
          embed=createBattleEmbed(challenger,opponent,cur,userData,cur.turn, log);
          await i.update({ content:'💥 턴 종료!', embeds:[embed], components:[btns] });
          startTurn();
        });

        tc.on('end',async(_col,reason)=>{
          if(reason==='idle'||reason==='time'){
            delete bd[battleId];
            save(battlePath,bd);
            await battleMsg.edit({ content:'⛔ 전투 시간 종료', components:[] });
          }
        });
      };

      startTurn();
    });
  }
};
