const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const bePath = path.join(__dirname, '../data/BE.json');
const earnCooldownPath = path.join(__dirname, '../data/earn-cooldown.json');
const lockPath = path.join(__dirname, '../data/earn-lock.json');
const koreaTZ = 9 * 60 * 60 * 1000; // +09:00

function loadJson(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, "{}");
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}
function getUserBe(userId) {
  const be = loadJson(bePath);
  return be[userId]?.amount || 0;
}
function setUserBe(userId, diff, reason = "") {
  const be = loadJson(bePath);
  be[userId] = be[userId] || { amount: 0, history: [] };
  be[userId].amount += diff;
  be[userId].history.push({ type: diff > 0 ? "earn" : "lose", amount: Math.abs(diff), reason, timestamp: Date.now() });
  saveJson(bePath, be);
}
function getCooldown(userId, type) {
  const data = loadJson(earnCooldownPath);
  return data[userId]?.[type] || 0;
}
function setCooldown(userId, type, ms, midnight = false) {
  const data = loadJson(earnCooldownPath);
  data[userId] = data[userId] || {};
  data[userId][type] = midnight ? nextMidnightKR() : Date.now() + ms;
  saveJson(earnCooldownPath, data);
}
function nextMidnightKR() {
  const now = new Date(Date.now() + koreaTZ);
  now.setHours(0, 0, 0, 0);
  return now.getTime() - koreaTZ + 24 * 60 * 60 * 1000;
}
function lock(userId) {
  const data = loadJson(lockPath);
  if (data[userId] && Date.now() < data[userId]) return false;
  data[userId] = Date.now() + 120000; // 2분 lock
  saveJson(lockPath, data);
  return true;
}
function unlock(userId) {
  const data = loadJson(lockPath);
  if (data[userId]) delete data[userId];
  saveJson(lockPath, data);
}

// 도박 단계별 실패확률
const GO_FAIL_RATE = [0.15, 0.25, 0.40, 0.55, 0.75];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수획득')
    .setDescription('파랑 정수(BE) 획득: 출석, 알바, 도박')
    .addStringOption(option =>
      option
        .setName('종류')
        .setDescription('정수를 획득할 방법을 선택하세요.')
        .setRequired(true)
        .addChoices(
          { name: '출석', value: 'attendance' },
          { name: '알바', value: 'alba' },
          { name: '도박', value: 'gamble' }
        )
    ),

  async execute(interaction) {
    const kind = interaction.options.getString('종류');
    const userId = interaction.user.id;

    // 0. 출석
    if (kind === 'attendance') {
      const now = Date.now();
      const next = getCooldown(userId, 'attendance');
      if (next > now) {
        const remain = Math.ceil((next - now) / 1000 / 60);
        await interaction.reply({ content: `⏰ 이미 출석했어! 다음 출석 가능까지 약 ${remain}분 남음.`, ephemeral: true });
        return;
      }
      // 100~2,000 BE, 고액일수록 희박(가중치)
      const probTable = [
        ...Array(100).fill(1),   // 100~299: 100
        ...Array(50).fill(2),    // 300~499: 50
        ...Array(25).fill(3),    // 500~999: 25
        ...Array(5).fill(4),     // 1,000~1,499: 5
        ...Array(2).fill(5),     // 1,500~1,999: 2
        6                       // 2,000: 1
      ];
      const selected = probTable[Math.floor(Math.random() * probTable.length)];
      let reward = 100;
      if (selected === 1) reward = Math.floor(Math.random() * 200) + 100;
      else if (selected === 2) reward = Math.floor(Math.random() * 200) + 300;
      else if (selected === 3) reward = Math.floor(Math.random() * 500) + 500;
      else if (selected === 4) reward = Math.floor(Math.random() * 500) + 1000;
      else if (selected === 5) reward = Math.floor(Math.random() * 500) + 1500;
      else if (selected === 6) reward = 2000;

      setUserBe(userId, reward, "출석 보상");
      setCooldown(userId, 'attendance', 0, true);

      // 고액 이펙트
      let effectMsg = "";
      if (reward >= 1500) effectMsg = `\n\n🎉 **대박! 고액 출석 보상 (${reward} BE)** 🎉\n✨✨✨✨✨`;
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("📅 출석 완료!")
          .setDescription(`오늘의 출석 보상: **${reward} BE**\n(내일 자정 이후 다시 출석 가능!)${effectMsg}`)
        ],
        ephemeral: true
      });
      return;
    }

            // 1. 알바 (색찾기 5연속 미니게임)
    if (kind === 'alba') {
  try {
    let round = 1;
    const MAX_ROUND = 5;
    const TIME_LIMIT = 60 * 1000; // 60초

    const colorList = ['Primary', 'Secondary', 'Success', 'Danger'];
    const colorName = { 'Primary': '파랑', 'Secondary': '회색', 'Success': '초록', 'Danger': '빨강' };

    function makeRow() {
      const base = colorList[Math.floor(Math.random() * colorList.length)];
      let arr = Array(6).fill(base);
      let diffIdx = Math.floor(Math.random() * 6);
      let diff;
      do {
        diff = colorList[Math.floor(Math.random() * colorList.length)];
      } while (diff === base);
      arr[diffIdx] = diff;
      return { arr, answer: diffIdx, base, diff };
    }

    let state = { round: 1, correct: 0 };
    let { arr, answer, base, diff } = makeRow();

    const embed = new EmbedBuilder()
      .setTitle("💼 알바 미니게임 1/5")
      .setDescription(`아래 6개 버튼 중에서, **색이 다른 버튼**을 클릭해!\n\n시간 제한: 60초`)
      .setFooter({ text: `1단계 - ${colorName[base]} 버튼 중 ${colorName[diff]} 버튼을 찾아라!` });

    let rows = [
      new ActionRowBuilder().addComponents(
        ...arr.map((c, idx) =>
          new ButtonBuilder()
            .setCustomId(`alba_${state.round}_${idx}_${c}_${c === diff ? 1 : 0}`)
            .setStyle(ButtonStyle[c])
            .setLabel(`${idx + 1}`)
        )
      )
    ];

    await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });

    const filter = i => i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: TIME_LIMIT });

    collector.on('collect', async i => {
      try {
        await i.deferUpdate();
        const [_, r, idx, c, isAnswer] = i.customId.split('_');
        if (parseInt(r) !== state.round) return;
        if (parseInt(isAnswer) === 1) {
          state.correct++;
          if (state.round === MAX_ROUND) {
            setUserBe(userId, 300, "알바(미니게임) 성공");
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setTitle("💼 알바 성공!")
                  .setDescription("모든 라운드 성공! **300 BE** 지급 🎉")
              ],
              components: [],
              ephemeral: true
            }).catch(e => console.error(e));
            collector.stop('done');
          } else {
            state.round++;
            let { arr, answer, base, diff } = makeRow();
            let rows = [
              new ActionRowBuilder().addComponents(
                ...arr.map((c, idx) =>
                  new ButtonBuilder()
                    .setCustomId(`alba_${state.round}_${idx}_${c}_${c === diff ? 1 : 0}`)
                    .setStyle(ButtonStyle[c])
                    .setLabel(`${idx + 1}`)
                )
              )
            ];
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setTitle(`💼 알바 미니게임 ${state.round}/5`)
                  .setDescription(`색이 다른 버튼을 클릭해!\n\n시간 제한: 60초`)
                  .setFooter({ text: `${state.round}단계 - ${colorName[base]} 버튼 중 ${colorName[diff]} 버튼을 찾아라!` }
                  )
              ],
              components: rows,
              ephemeral: true
            }).catch(e => console.error(e));
          }
        } else {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("💤 알바 실패!")
                .setDescription(`틀렸어! **0 BE**\n(처음부터 다시 도전 가능)`)
            ],
            components: [],
            ephemeral: true
          }).catch(e => console.error(e));
          collector.stop('fail');
        }
      } catch (e) {
        console.error(e);
        await interaction.editReply({
          content: "❌ 예기치 못한 오류가 발생했습니다.",
          components: [],
          ephemeral: true
        }).catch(() => {});
        collector.stop('fail');
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason !== 'done' && reason !== 'fail') {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("⏰ 알바 시간초과!")
              .setDescription("60초 내에 5라운드를 모두 성공하지 못했어! **0 BE**")
          ],
          components: [],
          ephemeral: true
        }).catch(e => {});
      }
    });
    return;
  } catch (e) {
    console.error(e);
    await interaction.reply({
      content: '❌ 알바 미니게임 중 오류가 발생했습니다.',
      ephemeral: true
    }).catch(() => {});
    return;
  }
}




    // 2. 도박
    if (kind === 'gamble') {
      if (!lock(userId)) {
        await interaction.reply({ content: '⚠️ 현재 도박 미니게임 진행중이야! 잠시 후 다시 시도해줘.', ephemeral: true }); return;
      }
      const myBe = getUserBe(userId);
      const amounts = [10, 100, 500, 1000, 5000, 10000];
      // 소유 BE보다 많은 금액 버튼은 비활성화
      const coins = amounts.slice(0,3);
      const bills = amounts.slice(3,6);

      const embed = new EmbedBuilder()
        .setTitle("🎰 도박 미니게임")
        .setDescription(`베팅할 금액을 선택하세요!\n(최대 소지금: ${myBe} BE)`);

      const row1 = new ActionRowBuilder().addComponents(
        coins.map(a => new ButtonBuilder()
          .setCustomId(`gamble_bet_${a}`)
          .setLabel(`🪙 ${a}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(myBe < a)
        )
      );
      const row2 = new ActionRowBuilder().addComponents(
        bills.map(a => new ButtonBuilder()
          .setCustomId(`gamble_bet_${a}`)
          .setLabel(`💵 ${a}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(myBe < a)
        )
      );

      await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });

      const filter = i => i.user.id === userId;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });

      collector.on('collect', async i => {
        if (!i.customId.startsWith('gamble_bet_')) return;
        const bet = parseInt(i.customId.split('_')[2]);
        if (getUserBe(userId) < bet) {
          await i.reply({ content: "베팅금이 부족해!", ephemeral: true });
          unlock(userId);
          collector.stop();
          return;
        }

        // 베팅금 차감 후 GO/STOP 인터페이스
        setUserBe(userId, -bet, "도박 베팅 시작");
        let total = bet;
        let stage = 0;
        let stopped = false;
        let lastMsg = null;

        const goGamble = async (intr, total, stage) => {
          const successRate = 1 - GO_FAIL_RATE[stage];
          const minRate = 1.3, maxRate = 2.0;
          const goBtn = new ButtonBuilder().setCustomId('gamble_go').setLabel('GO!').setStyle(ButtonStyle.Success);
          const stopBtn = new ButtonBuilder().setCustomId('gamble_stop').setLabel('STOP!').setStyle(ButtonStyle.Danger);
          const embed = new EmbedBuilder()
            .setTitle(`🎰 도박 ${stage+1}단계 / 최대 5단계`)
            .setDescription(
              `현재 금액: **${total} BE**\n` +
              `GO! → ${Math.round(total*minRate)}~${Math.round(total*maxRate)} BE (성공시)\n` +
              `실패확률: ${(GO_FAIL_RATE[stage]*100).toFixed(0)}%`
            )
            .setFooter({ text: `GO 성공시 계속 진행, STOP시 그만!` });
          await intr.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(goBtn, stopBtn)], ephemeral: true });
        };

        const msgIntr = await i.reply({
          embeds: [new EmbedBuilder()
            .setTitle("🎰 도박 시작!")
            .setDescription(`베팅금: **${bet} BE**\nGO! 또는 STOP!을 선택하세요.`)
          ],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('gamble_go').setLabel('GO!').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('gamble_stop').setLabel('STOP!').setStyle(ButtonStyle.Danger)
          )],
          ephemeral: true
        });

        let currentTotal = bet;
        let currentStage = 0;

        const filter2 = i2 => i2.user.id === userId && ['gamble_go', 'gamble_stop'].includes(i2.customId);
        const goCollector = interaction.channel.createMessageComponentCollector({ filter: filter2, time: 60000 });

        goCollector.on('collect', async i2 => {
          if (i2.customId === 'gamble_stop') {
            setUserBe(userId, currentTotal, `도박 STOP 수령 (총 ${currentStage+1}단계)`);
            await i2.update({
              embeds: [new EmbedBuilder()
                .setTitle("💰 도박 종료!")
                .setDescription(`STOP! 최종 금액: **${currentTotal} BE**\n이만큼 벌었어!`)
              ],
              components: [],
              ephemeral: true
            });
            unlock(userId);
            goCollector.stop();
            collector.stop();
            return;
          }
          // GO!
          if (Math.random() < GO_FAIL_RATE[currentStage]) {
            await i2.update({
              embeds: [new EmbedBuilder()
                .setTitle("💸 도박 실패!")
                .setDescription("아쉽게도 실패! 베팅금과 불린 돈을 모두 잃었어...")
              ],
              components: [],
              ephemeral: true
            });
            unlock(userId);
            goCollector.stop();
            collector.stop();
            return;
          }
          // 성공시 금액 증가
          const rate = Math.random() * 0.7 + 1.3;
          currentTotal = Math.round(currentTotal * rate);
          currentStage++;
          if (currentStage >= 5) {
            setUserBe(userId, currentTotal, `도박 5단계 대성공!`);
            await i2.update({
              embeds: [new EmbedBuilder()
                .setTitle("🏆 도박 5단계 대성공!")
                .setDescription(`최종 금액: **${currentTotal} BE**\n최고단계까지 성공!!`)
              ],
              components: [],
              ephemeral: true
            });
            unlock(userId);
            goCollector.stop();
            collector.stop();
            return;
          }
          // 다음 단계 계속
          await goGamble(i2, currentTotal, currentStage);
        });

        goCollector.on('end', () => { unlock(userId); });

        collector.stop();
      });
      collector.on('end', () => { unlock(userId); });
      return;
    }
  }
};
