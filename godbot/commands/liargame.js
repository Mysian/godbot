const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, PermissionsBitField } = require('discord.js');

// 카테고리별 제시어
const WORDS = {
  게임:    ['롤', '스타크래프트', '카트라이더', '마인크래프트', '포켓몬', '오버워치'],
  사회:    ['시장', '대통령', '교사', '경찰', '변호사', '의사'],
  과학:    ['원자', '화석', '중력', '태양', '세포', '화학'],
  드라마:  ['응답하라1988', '이태원클라스', '부부의세계', '더글로리', 'SKY캐슬', '도깨비'],
  영화:    ['기생충', '아바타', '인터스텔라', '타이타닉', '명량', '어벤져스']
};
const CATEGORIES = Object.keys(WORDS);

const games = {}; // channelId: { ... }

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle(arr) {
  return arr.map(v => [Math.random(), v]).sort().map(v => v[1]);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('라이어게임')
    .setDescription('카테고리별 라이어 게임')
    .addSubcommand(sub =>
      sub.setName('시작')
        .setDescription('라이어 게임을 시작합니다.')
        .addStringOption(opt =>
          opt.setName('카테고리')
            .setDescription('게임 주제를 선택합니다.')
            .setRequired(true)
            .addChoices(...CATEGORIES.map(c => ({ name: c, value: c })))
        )
    )
    .addSubcommand(sub =>
      sub.setName('종료')
        .setDescription('진행중인 라이어 게임을 종료합니다. (관리자만)')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channelId = interaction.channel.id;

    // /라이어게임 시작
    if (sub === '시작') {
      const category = interaction.options.getString('카테고리');
      if (games[channelId]?.started) {
        return interaction.reply({ content: '이미 라이어 게임이 진행중입니다.', ephemeral: true });
      }
      games[channelId] = {
        started: false,
        category,
        word: pick(WORDS[category]),
        participants: [],
        order: [],
        liarIndex: null,
        turn: 0,
        state: 'waiting'
      };

      // 버튼 세팅
      const joinBtn = new ButtonBuilder()
        .setCustomId(`liar_join_${channelId}`)
        .setLabel('참여')
        .setStyle(ButtonStyle.Success);
      const startBtn = new ButtonBuilder()
        .setCustomId(`liar_start_${channelId}`)
        .setLabel('시작')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true);

      const row = new ActionRowBuilder().addComponents(joinBtn, startBtn);

      const embed = new EmbedBuilder()
        .setTitle('🕵️‍♂️ 라이어 게임')
        .setDescription(`**카테고리:** ${category}\n\n최소 3명 이상 참여 필요!\n참여 후 '시작'을 눌러주세요.`)
        .addFields({ name: '참여자 명단', value: '없음' })
        .setColor(0x6c63ff);

      const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

      // ▶️ 10분 보장 참여 collector
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 1000 * 60 * 10 // 10분
      });

      collector.on('collect', async btnInt => {
        const game = games[channelId];
        if (!game) return;

        // 참여
        if (btnInt.customId === `liar_join_${channelId}`) {
          if (!game.participants.find(u => u.id === btnInt.user.id)) {
            game.participants.push({ id: btnInt.user.id, name: btnInt.member.displayName ?? btnInt.user.username });
          }
          embed.data.fields = [
            { name: '참여자 명단', value: game.participants.map(u => `<@${u.id}>`).join(', ') || '없음' }
          ];
          startBtn.setDisabled(game.participants.length < 3);
          await btnInt.update({ embeds: [embed], components: [row] });
        }

        // 시작
        if (btnInt.customId === `liar_start_${channelId}`) {
          if (game.participants.length < 3) {
            return btnInt.reply({ content: '3명 이상만 시작할 수 있습니다!', ephemeral: true });
          }
          // 게임 세팅
          game.started = true;
          game.order = shuffle([...game.participants]);
          game.liarIndex = Math.floor(Math.random() * game.order.length);
          game.turn = 0;
          game.state = 'playing';
          collector.stop();

          // DM 안내
          for (let i = 0; i < game.order.length; i++) {
            const user = await btnInt.guild.members.fetch(game.order[i].id);
            if (i === game.liarIndex) {
              try { await user.send('당신은 **라이어**입니다! 모두의 설명을 듣고 정답을 유추하세요.'); } catch {}
            } else {
              try { await user.send(`제시어는: **${game.word}**`); } catch {}
            }
          }

          // 설명 차례 안내
          const descBtn = new ButtonBuilder()
            .setCustomId(`liar_desc_${channelId}`)
            .setLabel('설명하기 (내 차례)')
            .setStyle(ButtonStyle.Primary);
          const descRow = new ActionRowBuilder().addComponents(descBtn);
          const orderList = game.order.map((u, i) => `${i + 1}. <@${u.id}>`).join('\n');
          const embed2 = new EmbedBuilder()
            .setTitle('🎤 라이어 게임 - 설명 시간!')
            .setDescription(`**설명 순서**\n${orderList}\n\n자신의 차례가 되면 버튼을 눌러 설명을 입력하세요.`)
            .addFields({ name: '현재 차례', value: `<@${game.order[game.turn].id}>` })
            .setColor(0xf9cb40);

          await btnInt.message.edit({ embeds: [embed2], components: [descRow] });
        }
      });

      // 타임아웃
      collector.on('end', async (_, reason) => {
        if (reason !== 'messageDelete' && !games[channelId]?.started) {
          games[channelId] = null;
          await msg.edit({ content: '⏰ 10분간 참여가 없어 게임이 취소됨.', embeds: [], components: [] });
        }
      });
    }

    // /라이어게임 종료
    else if (sub === '종료') {
      // 관리자만 사용 가능
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '관리자만 사용할 수 있습니다.', ephemeral: true });
      }
      if (!games[channelId]?.started) {
        return interaction.reply({ content: '진행중인 라이어 게임이 없습니다.', ephemeral: true });
      }
      games[channelId] = null;
      return interaction.reply({ content: '라이어 게임이 강제 종료되었습니다.', ephemeral: false });
    }
  },
};
