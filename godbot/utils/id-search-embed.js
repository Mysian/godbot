// utils/safe-search-embed-unguarded.js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  inlineCode,
  codeBlock,
} = require('discord.js');

// ===== 설정 =====
const DEFAULT_CONFIG = {
  // 이 채널로 결과를 보낼 수 있게 기본값을 둠. 필요 시 호출부에서 덮어쓰기.
  defaultChannelId: '1429984530491506798',

  // 허용된 공개 검색 엔진/플랫폼 (링크만 생성)
  engines: [
    { name: 'Google', build: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    { name: 'Naver', build: (q) => `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}` },
    { name: 'Bing', build: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
    { name: 'YouTube', build: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
    { name: 'Reddit', build: (q) => `https://www.reddit.com/search/?q=${encodeURIComponent(q)}` },
    { name: 'X (Twitter)', build: (q) => `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live` },
  ],

  // 사이트 한정 검색(사이트 연산자) 퀵 링크
  siteScopes: [
    { label: 'GitHub', pattern: 'site:github.com' },
    { label: 'StackOverflow', pattern: 'site:stackoverflow.com' },
    { label: 'Steam', pattern: 'site:store.steampowered.com OR site:steamcommunity.com' },
    { label: 'Wikipedia', pattern: 'site:wikipedia.org' },
    { label: 'Twitch', pattern: 'site:twitch.tv' },
  ],

  // 서버 내부(합법적 접근) 메타 조회 기능 on/off
  allowGuildIntrospection: true,

  color: 0x5865F2,
  footer: '통합검색',
};

// ===== 유틸 함수 =====
// 안전 가드 관련 함수 (hasPII, hasBlockedIntent) 제거됨

function buildEngineButtons(query, cfg = DEFAULT_CONFIG) {
  const rows = [];
  const chunk = (arr, size) => arr.reduce((acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]), []);
  const buttons = cfg.engines.map((e) =>
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(e.name).setURL(e.build(query))
  );
  for (const group of chunk(buttons, 5)) {
    rows.push(new ActionRowBuilder().addComponents(group));
  }
  return rows;
}

function buildSiteScopeRows(query, cfg = DEFAULT_CONFIG) {
  // site: 연산자를 붙인 검색 링크 묶음
  const rows = [];
  const chunk = (arr, size) => arr.reduce((acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]), []);
  const buttons = cfg.siteScopes.map((s) => {
    const q = `${s.pattern} ${query}`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    return new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(`🔎 ${s.label}`).setURL(url);
  });
  for (const group of chunk(buttons, 5)) {
    rows.push(new ActionRowBuilder().addComponents(group));
  }
  return rows;
}

function buildSafeEmbed(query, requesterTag, cfg = DEFAULT_CONFIG) {
  const embed = new EmbedBuilder()
    .setTitle('🔎 통합검색')
    .setColor(cfg.color)
    .setDescription(
      [
        `**검색어**: ${inlineCode(query)}`,
        '',
        '• 본 기능은 공개 검색 엔진의 링크를 제공합니다.',
      ].join('\n')
    )
    .setFooter({ text: cfg.footer })
    .setTimestamp();

  if (requesterTag) {
    embed.addFields({ name: '요청자', value: requesterTag, inline: true });
  }

  return embed;
}

// buildBlockedEmbed 함수 제거됨

async function gatherGuildSafeMeta(guild, query) {
  // 서버 내부, 합법적으로 볼 수 있는 범위에서만 "히트 포인트"를 찾아 요약
  // (대량 히스토리 스캔/저장 없음. 실시간 간단 매칭)
  // - 회원 닉네임/디스플레이네임/유저태그/유저ID 부분일치
  // - 역할명 부분일치
  // - 공개 채널 토픽/설명 부분일치
  // 주: 메시지 기록 대규모 수집·보관은 의도적으로 미구현(프라이버시 고려)
  const safe = {
    members: [],
    roles: [],
    channels: [],
  };

  try {
    // 멤버
    const members = await guild.members.fetch({ withPresences: false });
    const q = query.toLowerCase();
    members.forEach((m) => {
      const tag = `${m.user.username}#${m.user.discriminator === '0' ? '' : m.user.discriminator}`.replace(/#$/, '');
      const display = m.displayName || '';
      const hit =
        (display && display.toLowerCase().includes(q)) ||
        (m.user.username && m.user.username.toLowerCase().includes(q)) ||
        (tag && tag.toLowerCase().includes(q)) ||
        (m.id && m.id.includes(query));
      if (hit) {
        safe.members.push({
          id: m.id,
          user: m.user.tag,
          displayName: m.displayName,
          roles: m.roles.cache.map((r) => r.name),
        });
      }
    });

    // 역할
    guild.roles.cache.forEach((r) => {
      if ((r.name || '').toLowerCase().includes(query.toLowerCase())) {
        safe.roles.push({ id: r.id, name: r.name });
      }
    });

    // 채널(공개 메타만)
    guild.channels.cache.forEach((ch) => {
      const name = ch.name || '';
      const topic = ch.topic || '';
      if (name.toLowerCase().includes(query.toLowerCase()) || topic.toLowerCase().includes(query.toLowerCase())) {
        safe.channels.push({ id: ch.id, name, type: ch.type, topic: topic?.slice(0, 200) || '' });
      }
    });
  } catch (e) {
    // 조용히 무시 (권한 부족 등)
  }

  return safe;
}

function formatGuildMetaAsField(meta) {
  const lines = [];

  if (meta.members.length) {
    lines.push('**멤버 매칭**');
    meta.members.slice(0, 10).forEach((m) => {
      lines.push(`• ${m.displayName} (${m.user}) — ID: ${m.id}`);
      if (m.roles?.length) {
        lines.push(`  ↳ Roles: ${m.roles.slice(0, 6).join(', ')}`);
      }
    });
    if (meta.members.length > 10) lines.push(`…외 ${meta.members.length - 10}명`);
  }

  if (meta.roles.length) {
    lines.push('', '**역할 매칭**');
    meta.roles.slice(0, 10).forEach((r) => lines.push(`• ${r.name} — ID: ${r.id}`));
    if (meta.roles.length > 10) lines.push(`…외 ${meta.roles.length - 10}개`);
  }

  if (meta.channels.length) {
    lines.push('', '**채널 매칭**');
    meta.channels.slice(0, 10).forEach((c) => {
      lines.push(`• #${c.name} — ID: ${c.id}`);
      if (c.topic) lines.push(`  ↳ ${c.topic}`);
    });
    if (meta.channels.length > 10) lines.push(`…외 ${meta.channels.length - 10}개`);
  }

  if (!lines.length) return '서버 내부에서 눈에 띄는 매칭이 없습니다.';
  return lines.join('\n');
}

// ===== 공개 API =====

/**
 * 통합검색 임베드 전송
 * @param {import('discord.js').Client} client
 * @param {string} channelId
 * @param {string} query
 * @param {Partial<typeof DEFAULT_CONFIG>} configOverride
 */
async function sendSafeSearchEmbed(client, channelId, query, configOverride = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...configOverride };
  const channel = await client.channels.fetch(channelId || cfg.defaultChannelId).catch(() => null);
  if (!channel || !channel.isSendable?.()) return false;

  // 안전 가드 제거됨

  const requesterTag = channel.guild ? `<#${channel.id}>@${client.user?.username || 'bot'}` : undefined;
  const embed = buildSafeEmbed(query, requesterTag, cfg);

  const rows = [
    ...buildEngineButtons(query, cfg),
    ...buildSiteScopeRows(query, cfg),
  ].slice(0, 5); // 최대 5줄

  // 길드 메타(합법 범위)
  if (cfg.allowGuildIntrospection && channel.guild) {
    const meta = await gatherGuildSafeMeta(channel.guild, query);
    embed.addFields({ name: '서버 내부 매칭', value: formatGuildMetaAsField(meta) });
  }

  await channel.send({ embeds: [embed], components: rows });
  return true;
}

/**
 * 간단 메시지 리스너 등록: 지정 채널에서 "!검색 <키워드>" 형태로 사용
 * @param {import('discord.js').Client} client
 * @param {{ channelId?: string, prefix?: string, configOverride?: Partial<typeof DEFAULT_CONFIG> }} opts
 */
function registerSafeSearchListener(client, opts = {}) {
  const channelId = opts.channelId || DEFAULT_CONFIG.defaultChannelId;
  const prefix = typeof opts.prefix === 'string' ? opts.prefix : '!검색';
  const cfgOverride = opts.configOverride || {};

  client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    if (msg.channelId !== channelId) return;
    if (!msg.content.startsWith(prefix)) return;

    const query = msg.content.slice(prefix.length).trim();
    if (!query) {
      await msg.reply({
        content: [
          '사용법:',
          codeBlock(`{prefix} <검색어>\n예) ${prefix} 발로란트 핵 제보 방법`),
        ].join('\n'),
      });
      return;
    }

    await sendSafeSearchEmbed(msg.client, msg.channelId, query, cfgOverride);
  });
}

module.exports = {
  DEFAULT_CONFIG,
  sendSafeSearchEmbed,
  registerSafeSearchListener,
};
