const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const bePath = path.join(__dirname, '../data/BE.json');
const earnCooldownPath = path.join(__dirname, '../data/earn-cooldown.json');
const lockPath = path.join(__dirname, '../data/earn-lock.json');
const profilesPath = path.join(__dirname, '../data/profiles.json');
const koreaTZ = 9 * 60 * 60 * 1000;

// ===== 유틸 =====
function loadJson(p) { if (!fs.existsSync(p)) fs.writeFileSync(p, "{}"); return JSON.parse(fs.readFileSync(p, 'utf8')); }
function saveJson(p, data) { fs.writeFileSync(p, JSON.stringify(data, null, 2)); }
function getUserBe(userId) { const be = loadJson(bePath); return be[userId]?.amount || 0; }
function setUserBe(userId, diff, reason = "") {
  const be = loadJson(bePath);
  be[userId] = be[userId] || { amount: 0, history: [] };
  be[userId].amount += diff;
  be[userId].history.push({ type: diff > 0 ? "earn" : "lose", amount: Math.abs(diff), reason, timestamp: Date.now() });
  saveJson(bePath, be);
}
function getCooldown(userId, type) { const data = loadJson(earnCooldownPath); return data[userId]?.[type] || 0; }
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
  data[userId] = Date.now() + 190000;
  saveJson(lockPath, data);
  return true;
}
function unlock(userId) { const data = loadJson(lockPath); if (data[userId]) delete data[userId]; saveJson(lockPath, data); }
function hasProfile(userId) { if (!fs.existsSync(profilesPath)) return false; const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8')); return !!profiles[userId]; }
function comma(n) { return n.toLocaleString('ko-KR'); }

// ===== 카드/블랙잭 유틸 =====
function blackjackValue(hand) {
  let sum = 0, aces = 0;
  for (let card of hand) {
    if (card.value >= 10) sum += 10;
    else if (card.value === 1) { sum += 11; aces++; }
    else sum += card.value;
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
}
function drawCard(deck) {
  const idx = Math.floor(Math.random() * deck.length);
  return deck.splice(idx, 1)[0];
}
function cardStr(card) {
  const suitEmojis = { '♠': '♠️', '♥': '♥️', '♦': '♦️', '♣': '♣️' };
  const n = card.value === 1 ? "A" : card.value === 11 ? "J" : card.value === 12 ? "Q" : card.value === 13 ? "K" : card.value;
  let colorWrap = s => s;
  if (card.suit === '♥' || card.suit === '♦') colorWrap = s => `**${s}**`; // 빨간색 계열은 볼드
  return colorWrap(`[${suitEmojis[card.suit] || card.suit}${n}]`);
}
function deckInit() {
  const suits = ['♠', '♥', '♦', '♣'];
  const deck = [];
  for (let s of suits) for (let v = 1; v <= 13; v++) deck.push({ suit: s, value: v });
  return deck;
}

// ===== 명령어 모듈 =====
module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수획득')
    .setDescription('파랑 정수(BE) 획득: 블랙잭')
    .addStringOption(option =>
      option.setName('종류')
        .setDescription('정수를 획득할 방법을 선택하세요.')
        .setRequired(true)
        .addChoices(
          { name: '블랙잭', value: 'blackjack' }
        )
    ),

  // ===== execute =====
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    const kind = interaction.options.getString('종류');
    const userId = interaction.user.id;
    if (!hasProfile(userId)) {
      await interaction.reply({ content: "❌ 프로필 정보가 없습니다!\n`/프로필등록` 명령어로 먼저 프로필을 등록해 주세요.", ephemeral: true });
      return;
    }

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
      if (reward >= 1500) effectMsg = `\n\n🎉 **대박! 고액 출석 보상  (${reward} BE 🔷)** 🎉\n✨✨✨✨✨`;
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
        const MAX_ROUND = 5;
        const TIME_LIMIT = 30 * 1000; // 30초
        const colorList = ['Primary', 'Secondary', 'Success', 'Danger'];
        const colorName = { 'Primary': '파랑', 'Secondary': '회색', 'Success': '초록', 'Danger': '빨강' };
        const BE_EMOJI = '🔷';

        function makeBoard() {
          const base = colorList[Math.floor(Math.random() * colorList.length)];
          let arr = Array(9).fill(base);
          let diffIdx = Math.floor(Math.random() * 9);
          let diff;
          do {
            diff = colorList[Math.floor(Math.random() * colorList.length)];
          } while (diff === base);
          arr[diffIdx] = diff;
          return { arr, answer: diffIdx, base, diff };
        }

        let round = 1;
        let state = { round: 1, correct: 0 };
        let { arr, answer, base, diff } = makeBoard();

        function buttonRows(arr, answerIdx) {
          const rows = [];
          for (let r = 0; r < 3; r++) {
            rows.push(
              new ActionRowBuilder().addComponents(
                ...arr.slice(r * 3, r * 3 + 3).map((c, idx) => {
                  const realIdx = r * 3 + idx;
                  const isAnswer = realIdx === answerIdx;
                  return new ButtonBuilder()
                    .setCustomId(`alba_${state.round}_${realIdx}_${c}_${isAnswer ? 1 : 0}`)
                    .setStyle(ButtonStyle[c])
                    .setLabel(isAnswer ? `${BE_EMOJI}` : `${realIdx + 1}`);
                })
              )
            );
          }
          return rows;
        }

        const embed = new EmbedBuilder()
          .setTitle("💼 알바 미니게임 1/5")
          .setDescription(
            `아래 9개 버튼 중에서, **색이 다른 버튼**(🔷)을 클릭해!\n` +
            `시간 제한: 30초`
          )
          .setFooter({ text: `1단계 - ${colorName[base]} 버튼 중 ${colorName[diff]} 버튼을 찾아라!` });

        await interaction.reply({ embeds: [embed], components: buttonRows(arr, answer), ephemeral: true });

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
                }).catch(() => {});
                collector.stop('done');
              } else {
                state.round++;
                let { arr, answer, base, diff } = makeBoard();
                await interaction.editReply({
                  embeds: [
                    new EmbedBuilder()
                      .setTitle(`💼 알바 미니게임 ${state.round}/5`)
                      .setDescription(
                        `아래 9개 버튼 중에서, **색이 다른 버튼**(🔷)을 클릭해!\n시간 제한: 30초`
                      )
                      .setFooter({ text: `${state.round}단계 - ${colorName[base]} 버튼 중 ${colorName[diff]} 버튼을 찾아라!` }
                      )
                  ],
                  components: buttonRows(arr, answer),
                  ephemeral: true
                }).catch(() => {});
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
              }).catch(() => {});
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
                  .setDescription("30초 내에 5라운드를 모두 성공하지 못했어! **0 BE**")
              ],
              components: [],
              ephemeral: true
            }).catch(() => {});
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
      const coins = amounts.slice(0,3);
      const bills = amounts.slice(3,6);

      const embed = new EmbedBuilder()
        .setTitle("🎰 도박 미니게임")
        .setDescription(`베팅할 금액을 선택하세요!\n(당신의 정수🔷: ${myBe} BE)`);

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
          await i.reply({ content: "정수가 부족해!", ephemeral: true });
          unlock(userId);
          collector.stop();
          return;
        }

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
              `현재 금액🔷: **${total} BE**\n` +
              `GO! → ${Math.round(total*minRate)}~${Math.round(total*maxRate)} BE (성공시)\n`
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
          const rate = Math.random() * 0.7 + 1.3;
          currentTotal = Math.round(currentTotal * rate);
          currentStage++;
          if (currentStage >= 5) {
            setUserBe(userId, currentTotal, `도박 5단계 대성공!`);
            await i2.update({
              embeds: [new EmbedBuilder()
                .setTitle("🏆 도박 5단계 대성공!")
                .setDescription(`최종 금액🔷: **${currentTotal} BE**\n최고단계까지 성공!!`)
              ],
              components: [],
              ephemeral: true
            });
            unlock(userId);
            goCollector.stop();
            collector.stop();
            return;
          }
          await goGamble(i2, currentTotal, currentStage);
        });

        goCollector.on('end', () => { unlock(userId); });
        collector.stop();
      });
      collector.on('end', () => { unlock(userId); });
      return;
    }

    // 3. 가위바위보 - 모달만 띄우고 본 게임은 아래 modal()에서 처리!
    if (kind === 'rps') {
      if (!lock(userId)) {
        await interaction.reply({ content: '⚠️ 현재 미니게임 진행중이야! 잠시 후 다시 시도해줘.', ephemeral: true }); return;
      }
      setTimeout(unlock, 130000, userId);
      const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
      const modal = new ModalBuilder()
        .setCustomId('rps_bet_modal')
        .setTitle('가위바위보 배팅금 입력');
      const betInput = new TextInputBuilder()
        .setCustomId('rps_bet')
        .setLabel('배팅할 금액 (10~1,000,000 BE)')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1).setMaxLength(10).setPlaceholder('예: 5000');
      modal.addComponents(
        new ActionRowBuilder().addComponents(betInput)
      );
      await interaction.showModal(modal);
      return;
    }

    // 4. 블랙잭 - 모달만 띄우고 본 게임은 아래 modal()에서 처리!
    if (kind === 'blackjack') {
      if (!lock(userId)) {
        await interaction.reply({ content: '⚠️ 현재 미니게임 진행중이야! 잠시 후 다시 시도해줘.', ephemeral: true }); return;
      }
      setTimeout(unlock, 190000, userId);
      const modal = new ModalBuilder()
        .setCustomId('blackjack_bet_modal')
        .setTitle('블랙잭 배팅금 입력');
      const betInput = new TextInputBuilder()
        .setCustomId('blackjack_bet')
        .setLabel('배팅할 금액 (100~10,000,000 BE)')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1).setMaxLength(10).setPlaceholder('예: 50000');
      modal.addComponents(new ActionRowBuilder().addComponents(betInput));
      await interaction.showModal(modal);
      return;
    }
  },

  // --- 모달 submit (modal) ---
  async modal(interaction) {
    const userId = interaction.user.id;

    // === 가위바위보 모달 submit ===
    if (interaction.customId === 'rps_bet_modal') {
      const raw = interaction.fields.getTextInputValue('rps_bet').replace(/,/g, '');
      const bet = Math.floor(Number(raw));
      if (isNaN(bet) || bet < 10 || bet > 1000000) {
        await interaction.reply({ content: "⚠️ 잘못된 배팅금액이야. (10~1,000,000 BE)", ephemeral: true });
        unlock(userId); return;
      }
      if (getUserBe(userId) < bet) {
        await interaction.reply({ content: "⚠️ 소유 BE 부족!", ephemeral: true });
        unlock(userId); return;
      }
      let rpsGame = async () => {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('rps_0').setLabel('✌️ 가위').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('rps_1').setLabel('✊ 바위').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('rps_2').setLabel('✋ 보').setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle('✂️ 가위바위보')
            .setDescription(`배팅금: **${comma(bet)} BE**\n가위/바위/보 중 하나를 골라!`)
          ],
          components: [row], ephemeral: true
        });
        const filter = i => i.user.id === userId && i.customId.startsWith('rps_');
        interaction.channel.createMessageComponentCollector({ filter, max: 1, time: 30000 })
          .on('collect', async i2 => {
            const rnd = Math.random();
            let acc = 0, result = null;
            for (let r of RPS_RATE) {
              acc += r.prob;
              if (rnd <= acc) { result = r.result; break; }
            }
            if (!result) result = 'lose';
            let userPick = ['가위', '바위', '보'][parseInt(i2.customId.split('_')[1])];
            let botPick = null;
            if (result === 'draw') {
              botPick = userPick;
            } else if (result === 'win') {
              botPick = ['바위', '보', '가위'][parseInt(i2.customId.split('_')[1])];
            } else {
              botPick = ['보', '가위', '바위'][parseInt(i2.customId.split('_')[1])];
            }
            let msg = `너: **${userPick}**\n상대: **${botPick}**\n\n`;
            if (result === 'win') {
              setUserBe(userId, Math.floor(bet * 1.9), '가위바위보 승리');
              msg += `🎉 승리! **${comma(Math.floor(bet * 1.9))} BE** 획득!`;
              await i2.update({ embeds: [new EmbedBuilder().setTitle('✂️ 가위바위보').setDescription(msg)], components: [], ephemeral: true });
              unlock(userId);
            } else if (result === 'lose') {
              setUserBe(userId, -bet, '가위바위보 패배');
              msg += `💀 패배! 배팅금 **${comma(bet)} BE** 소멸!`;
              await i2.update({ embeds: [new EmbedBuilder().setTitle('✂️ 가위바위보').setDescription(msg)], components: [], ephemeral: true });
              unlock(userId);
            } else { // draw
              msg += `🤝 무승부! 다시 한 번 도전해!`;
              await i2.update({ embeds: [new EmbedBuilder().setTitle('✂️ 가위바위보').setDescription(msg)], components: [], ephemeral: true });
              setTimeout(() => rpsGame(), 2000);
            }
          })
          .on('end', async (_, reason) => {
            if (reason === 'time') {
              setUserBe(userId, -Math.floor(bet * 0.25), '가위바위보 시간초과/도중포기(25%만 소멸)');
              await interaction.followUp({ content: `⏰ 제한시간 초과! 배팅금의 25%(${comma(Math.floor(bet * 0.25))} BE)만 소멸!`, ephemeral: true });
              unlock(userId);
            }
          });
      };
      rpsGame();
      return;
    }

    // === 블랙잭 모달 submit ===
    if (interaction.customId === 'blackjack_bet_modal') {
  const raw = interaction.fields.getTextInputValue('blackjack_bet').replace(/,/g, '');
  const bet = Math.floor(Number(raw));
  if (isNaN(bet) || bet < 100 || bet > 10000000) {
    await interaction.reply({ content: "⚠️ 잘못된 배팅금액이야. (100~10,000,000 BE)", ephemeral: true });
    unlock(userId); return;
  }
  if (getUserBe(userId) < bet) {
    await interaction.reply({ content: "⚠️ 소유 BE 부족!", ephemeral: true });
    unlock(userId); return;
  }
  let deck = deckInit();
  let userHand = [drawCard(deck), drawCard(deck)];
  let dealerHand = [drawCard(deck), drawCard(deck)];
  let gameOver = false;

  // 카드 이모지 변환 함수 (색상 강조)
  function cardStr(card) {
    const suitEmojis = { '♠': '♠️', '♥': '♥️', '♦': '♦️', '♣': '♣️' };
    const n = card.value === 1 ? "A" : card.value === 11 ? "J" : card.value === 12 ? "Q" : card.value === 13 ? "K" : card.value;
    let colorWrap = s => s;
    if (card.suit === '♥' || card.suit === '♦') colorWrap = s => `**${s}**`;
    return colorWrap(`[${suitEmojis[card.suit] || card.suit}${n}]`);
  }

  // 임베드 빌더: 상태별 색상/메시지/오픈카드 구분
  function getEmbed(state) {
    const colorMap = {
      'start': 0x3399ff, 'playing': 0x3399ff,
      'bj': 0x44dd66, 'win': 0x44dd66,
      'draw': 0xaaaacc, 'lose': 0xff3333, 'bust': 0xff3333
    };
    const titleMap = {
      'start': "🃏 블랙잭",
      'playing': "🃏 블랙잭",
      'bj': "🂡 블랙잭!!",
      'win': "🎉 블랙잭 승리!",
      'lose': "💀 블랙잭 패배!",
      'draw': "🤝 블랙잭 무승부!",
      'bust': "💥 버스트!"
    };
    // 딜러 패 오픈 여부
    let dealerCards = (state === 'playing' || state === 'start')
      ? `${cardStr(dealerHand[0])} [ ? ]`
      : dealerHand.map(cardStr).join(' ');
    let dealerSum = (state === 'playing' || state === 'start')
      ? ''
      : ` (합계: ${blackjackValue(dealerHand)})`;
    let userCards = userHand.map(cardStr).join(' ');
    let userSum = ` (합계: ${blackjackValue(userHand)})`;

    let desc = `**딜러**: ${dealerCards}${dealerSum}\n**나**: ${userCards}${userSum}\n`;

    // 추가 안내
    if (state === 'playing' || state === 'start')
      desc += `\n카드를 더 받거나(히트), 멈출 수 있음!`;
    else if (state === 'bj')
      desc += `\n\n🂡 **블랙잭! (첫 두 장 21)**\n**${comma(Math.floor(bet * 1.9))} BE** 획득!`;
    else if (state === 'win')
      desc += `\n\n🎉 **승리! ${comma(Math.floor(bet * 1.9))} BE** 획득!`;
    else if (state === 'draw')
      desc += `\n\n🤝 **무승부!** 배팅금 반환!`;
    else if (state === 'bust')
      desc += `\n\n💥 **BUST! 21 초과!**\n패배! 배팅금 ${comma(bet)} BE 소멸!`;
    else if (state === 'lose')
      desc += `\n\n💀 **패배! 배팅금 ${comma(bet)} BE 소멸!**`;

    return new EmbedBuilder()
      .setTitle(titleMap[state] || "🃏 블랙잭")
      .setColor(colorMap[state] || 0x3399ff)
      .setDescription(desc);
  }

  // 게임 진행 함수
  let gameStep = async (intr, isFirst = false) => {
    if (gameOver) return;
    const userVal = blackjackValue(userHand);

    // 버스트(패배)
    if (userVal > 21) {
      setUserBe(userId, -bet, '블랙잭 패배(버스트)');
      await intr.update({
        embeds: [getEmbed('bust')], components: [], ephemeral: true
      });
      unlock(userId); gameOver = true; return;
    }

    // 첫 두장 블랙잭
    if (userVal === 21 && isFirst) {
      setUserBe(userId, Math.floor(bet * 1.9), '블랙잭 승리(첫 두장 21)');
      await intr.update({
        embeds: [getEmbed('bj')], components: [], ephemeral: true
      });
      unlock(userId); gameOver = true; return;
    }

    // HIT/STAND 버튼
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_hit').setLabel('HIT(카드)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bj_stand').setLabel('STAND(그만)').setStyle(ButtonStyle.Danger)
    );
    await intr[isFirst ? 'reply' : 'update']({
      embeds: [getEmbed('playing')], components: [row], ephemeral: true
    });

    // 버튼 클릭 수집기
    const filter = i => i.user.id === userId && (i.customId === 'bj_hit' || i.customId === 'bj_stand');
    interaction.channel.createMessageComponentCollector({ filter, max: 1, time: 60000 })
      .on('collect', async i2 => {
        if (i2.customId === 'bj_hit') {
          userHand.push(drawCard(deck));
          gameStep(i2, false);
        } else { // stand
          while (blackjackValue(dealerHand) < 17) dealerHand.push(drawCard(deck));
          const dealerVal = blackjackValue(dealerHand);
          const userVal = blackjackValue(userHand);

          // 승/무/패
          let state = 'lose';
          if (dealerVal > 21 || userVal > dealerVal) {
            setUserBe(userId, Math.floor(bet * 1.9), '블랙잭 승리');
            state = 'win';
          } else if (dealerVal === userVal) {
            state = 'draw';
          } else {
            setUserBe(userId, -bet, '블랙잭 패배');
            state = 'lose';
          }
          await i2.update({
            embeds: [getEmbed(state)],
            components: [], ephemeral: true
          });
          unlock(userId); gameOver = true; return;
        }
      })
      .on('end', async (_, reason) => {
        if (!gameOver && reason === 'time') {
          setUserBe(userId, -Math.floor(bet * 0.25), '블랙잭 시간초과/도중포기(25%만 소멸)');
          await interaction.followUp({ content: `⏰ 제한시간 초과! 배팅금의 25%(${comma(Math.floor(bet * 0.25))} BE)만 소멸!`, ephemeral: true });
          unlock(userId); gameOver = true;
        }
      });
  };

  // 게임 시작
  gameStep(interaction, true);
  return;
   }
  }
};
