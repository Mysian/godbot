const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const nicknameRolesPath = path.join(__dirname, '../data/nickname-roles.json');
const titlesPath = path.join(__dirname, '../data/limited-titles.json');

async function loadJson(p, isArray = false) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, isArray ? "[]" : "{}");
  const release = await lockfile.lock(p, { retries: 3 });
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  await release();
  return data;
}
async function saveJson(p, data) {
  const release = await lockfile.lock(p, { retries: 3 });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  await release();
}
function isEmptyDesc(str) {
  if (str === undefined || str === null) return false;
  const s = String(str).trim().replace(/\.$/, '').toLowerCase();
  return s === '없음';
}
function validateHexOrUrl(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  const hex = s.replace('#','');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return '#' + hex.toUpperCase();
  return null;
}
function toInt(n, def = null) {
  if (n === undefined || n === null) return def;
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.trunc(v);
}
function previewEmbed(type, payload) {
  const e = new EmbedBuilder();
  if (type === 'nickname') {
    e.setTitle('닉네임 색상 항목 미리보기');
    if (payload.color && typeof payload.color === 'string') {
      const col = validateHexOrUrl(payload.color);
      if (col && !col.startsWith('http')) e.setColor(col);
      if (col && col.startsWith('http')) e.setImage(col);
    }
    e.setDescription(`${payload.emoji || ''} ${payload.name || ''}\n가격: ${payload.price || 0} BE\n${payload.desc || ''}\n역할ID: ${payload.roleId}`);
  } else {
    e.setTitle('한정판 칭호 항목 미리보기');
    if (payload.color && typeof payload.color === 'string') {
      const col = validateHexOrUrl(payload.color);
      if (col && !col.startsWith('http')) e.setColor(col);
      if (col && col.startsWith('http')) e.setImage(col);
    }
    e.setDescription(`${payload.emoji || ''} ${payload.name || ''}\n가격: ${payload.price || 0} BE\n${payload.desc || ''}\n재고: ${payload.stock === null || payload.stock === undefined ? '무제한' : payload.stock}\n역할ID: ${payload.roleId}`);
  }
  return e;
}
function filterList(obj, keyword) {
  const arr = Object.values(obj || {});
  if (!keyword) return arr;
  const k = String(keyword).toLowerCase();
  return arr.filter(v =>
    String(v.roleId||'').toLowerCase().includes(k) ||
    String(v.name||'').toLowerCase().includes(k) ||
    String(v.desc||'').toLowerCase().includes(k)
  );
}
function paginate(arr, page, size) {
  const p = Math.max(1, toInt(page, 1));
  const s = Math.max(1, toInt(size, 10));
  const start = (p - 1) * s;
  return { slice: arr.slice(start, start + s), page: p, size: s, total: arr.length, pages: Math.max(1, Math.ceil(arr.length / s)) };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('상점관리')
    .setDescription('상점 데이터 관리')
    .addStringOption(o => o.setName('종류').setDescription('nickname 또는 title').setRequired(true).addChoices({ name: '닉네임색상', value: 'nickname' }, { name: '한정칭호', value: 'title' }))
    .addStringOption(o => o.setName('작업').setDescription('add, edit, remove, list, backup, restore, set_stock, adjust_price').setRequired(true).addChoices(
      { name: '추가', value: 'add' },
      { name: '수정', value: 'edit' },
      { name: '삭제', value: 'remove' },
      { name: '목록', value: 'list' },
      { name: '백업', value: 'backup' },
      { name: '복원(덮어쓰기)', value: 'restore' },
      { name: '재고설정(칭호)', value: 'set_stock' },
      { name: '가격조정(일괄)', value: 'adjust_price' }
    ))
    .addStringOption(o => o.setName('roleid').setDescription('역할ID(추가/수정/삭제/재고설정에 필요)').setRequired(false))
    .addStringOption(o => o.setName('이름').setDescription('이름(추가/수정)').setRequired(false))
    .addStringOption(o => o.setName('이모지').setDescription('이모지(추가/수정)').setRequired(false))
    .addStringOption(o => o.setName('설명').setDescription('설명(추가/수정)').setRequired(false))
    .addIntegerOption(o => o.setName('가격').setDescription('가격(BE)(추가/수정)').setRequired(false))
    .addStringOption(o => o.setName('색상').setDescription('HEX(#RRGGBB) 또는 이미지 URL').setRequired(false))
    .addIntegerOption(o => o.setName('재고').setDescription('재고(칭호 전용, 정수 또는 0이상)').setRequired(false))
    .addStringOption(o => o.setName('검색').setDescription('목록 검색 키워드').setRequired(false))
    .addIntegerOption(o => o.setName('페이지').setDescription('목록 페이지(기본 1)').setRequired(false))
    .addIntegerOption(o => o.setName('페이지크기').setDescription('목록 크기(기본 10, 최대 20)').setRequired(false))
    .addStringOption(o => o.setName('json').setDescription('복원/일괄조정용 JSON 문자열').setRequired(false))
    .addStringOption(o => o.setName('조정방식').setDescription('abs(절대값)/pct(퍼센트)').setRequired(false).addChoices({ name: '절대값', value: 'abs' }, { name: '퍼센트', value: 'pct' }))
    .addIntegerOption(o => o.setName('조정값').setDescription('abs이면 +증감 금액, pct이면 +증감 퍼센트(예: 10, -5)').setRequired(false)),
  async execute(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      await interaction.reply({ content: '관리자만 사용 가능합니다.', ephemeral: true });
      return;
    }
    const type = interaction.options.getString('종류');
    const op = interaction.options.getString('작업');
    const roleId = interaction.options.getString('roleid');
    const name = interaction.options.getString('이름');
    const emoji = interaction.options.getString('이모지');
    const desc = interaction.options.getString('설명');
    const price = interaction.options.getInteger('가격');
    const colorIn = interaction.options.getString('색상');
    const stockIn = interaction.options.getInteger('재고');
    const keyword = interaction.options.getString('검색');
    const page = interaction.options.getInteger('페이지') || 1;
    const pageSize = Math.min(20, interaction.options.getInteger('페이지크기') || 10);
    const jsonStr = interaction.options.getString('json');
    const adjustMode = interaction.options.getString('조정방식');
    const adjustVal = interaction.options.getInteger('조정값');

    const targetPath = type === 'nickname' ? nicknameRolesPath : titlesPath;
    let data = await loadJson(targetPath);

    if (op === 'add') {
      if (!roleId) { await interaction.reply({ content: 'roleid가 필요합니다.', ephemeral: true }); return; }
      if (data[roleId]) { await interaction.reply({ content: '이미 존재하는 roleid입니다.', ephemeral: true }); return; }
      const col = validateHexOrUrl(colorIn);
      const payload = {
        roleId,
        name: name || '',
        emoji: emoji || '',
        price: toInt(price, 0),
        desc: isEmptyDesc(desc) ? '' : (desc || ''),
        color: col,
      };
      if (type === 'title') payload.stock = stockIn !== null && stockIn !== undefined ? Math.max(0, toInt(stockIn, 0)) : null;
      data[roleId] = payload;
      await saveJson(targetPath, data);
      const e = previewEmbed(type, payload);
      await interaction.reply({ content: '추가 완료', embeds: [e], ephemeral: true });
      return;
    }

    if (op === 'edit') {
      if (!roleId) { await interaction.reply({ content: 'roleid가 필요합니다.', ephemeral: true }); return; }
      if (!data[roleId]) { await interaction.reply({ content: '해당 roleid가 없습니다.', ephemeral: true }); return; }
      if (name !== null && name !== undefined) data[roleId].name = name;
      if (emoji !== null && emoji !== undefined) data[roleId].emoji = emoji;
      if (price !== null && price !== undefined) data[roleId].price = toInt(price, 0);
      if (desc !== undefined) data[roleId].desc = isEmptyDesc(desc) ? '' : desc;
      if (colorIn !== null && colorIn !== undefined) data[roleId].color = validateHexOrUrl(colorIn);
      if (type === 'title' && (stockIn !== null && stockIn !== undefined)) data[roleId].stock = Math.max(0, toInt(stockIn, 0));
      await saveJson(targetPath, data);
      const e = previewEmbed(type, data[roleId]);
      await interaction.reply({ content: '수정 완료', embeds: [e], ephemeral: true });
      return;
    }

    if (op === 'remove') {
      if (!roleId) { await interaction.reply({ content: 'roleid가 필요합니다.', ephemeral: true }); return; }
      if (!data[roleId]) { await interaction.reply({ content: '해당 roleid가 없습니다.', ephemeral: true }); return; }
      const removed = data[roleId];
      delete data[roleId];
      await saveJson(targetPath, data);
      const e = previewEmbed(type, removed);
      await interaction.reply({ content: '삭제 완료', embeds: [e], ephemeral: true });
      return;
    }

    if (op === 'list') {
      const arr = filterList(data, keyword);
      const { slice, page: p, size, total, pages } = paginate(arr, page, pageSize);
      if (slice.length === 0) { await interaction.reply({ content: '항목이 없습니다.', ephemeral: true }); return; }
      const e = new EmbedBuilder().setTitle(type === 'nickname' ? '닉네임 색상 목록' : '한정판 칭호 목록').setDescription(`검색: ${keyword || '없음'} | ${p}/${pages} 페이지 | 총 ${total}개 | 페이지크기 ${size}`);
      slice.forEach(v => {
        const stockTxt = type === 'title' ? ` | 재고:${v.stock === null || v.stock === undefined ? '무제한' : v.stock}` : '';
        e.addFields({ name: `${v.emoji || ''} ${v.name || ''}`, value: `ID:${v.roleId} | 가격:${v.price||0}${stockTxt}\n${v.desc||''}` });
      });
      await interaction.reply({ embeds: [e], ephemeral: true });
      return;
    }

    if (op === 'backup') {
      const buf = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
      const file = new AttachmentBuilder(buf, { name: type === 'nickname' ? 'nickname-roles.backup.json' : 'limited-titles.backup.json' });
      await interaction.reply({ content: '백업 파일입니다.', files: [file], ephemeral: true });
      return;
    }

    if (op === 'restore') {
      if (!jsonStr) { await interaction.reply({ content: 'json이 필요합니다.', ephemeral: true }); return; }
      let parsed;
      try { parsed = JSON.parse(jsonStr); } catch { await interaction.reply({ content: 'JSON 파싱 실패.', ephemeral: true }); return; }
      if (typeof parsed !== 'object' || Array.isArray(parsed)) { await interaction.reply({ content: '객체 형태의 JSON이 필요합니다.', ephemeral: true }); return; }
      for (const k of Object.keys(parsed)) {
        if (!parsed[k] || typeof parsed[k] !== 'object') { await interaction.reply({ content: `형식 오류: ${k}`, ephemeral: true }); return; }
      }
      await saveJson(targetPath, parsed);
      data = parsed;
      const count = Object.keys(data).length;
      await interaction.reply({ content: `복원 완료: ${count}개 항목`, ephemeral: true });
      return;
    }

    if (op === 'set_stock') {
      if (type !== 'title') { await interaction.reply({ content: '칭호 전용 작업입니다.', ephemeral: true }); return; }
      if (!roleId) { await interaction.reply({ content: 'roleid가 필요합니다.', ephemeral: true }); return; }
      if (!data[roleId]) { await interaction.reply({ content: '해당 roleid가 없습니다.', ephemeral: true }); return; }
      if (stockIn === null || stockIn === undefined) { await interaction.reply({ content: '재고 값이 필요합니다.', ephemeral: true }); return; }
      data[roleId].stock = Math.max(0, toInt(stockIn, 0));
      await saveJson(targetPath, data);
      const e = previewEmbed(type, data[roleId]);
      await interaction.reply({ content: '재고 설정 완료', embeds: [e], ephemeral: true });
      return;
    }

    if (op === 'adjust_price') {
      if (!adjustMode || adjustVal === null || adjustVal === undefined) { await interaction.reply({ content: '조정방식과 조정값이 필요합니다.', ephemeral: true }); return; }
      const list = Object.values(data);
      if (list.length === 0) { await interaction.reply({ content: '대상 항목이 없습니다.', ephemeral: true }); return; }
      let changed = 0;
      if (adjustMode === 'abs') {
        for (const it of list) { it.price = Math.max(0, toInt((it.price || 0) + adjustVal, 0)); changed++; }
      } else if (adjustMode === 'pct') {
        for (const it of list) {
          const base = it.price || 0;
          const next = Math.round(base * (1 + adjustVal / 100));
          it.price = Math.max(0, toInt(next, 0));
          changed++;
        }
      } else {
        await interaction.reply({ content: '조정방식은 절대값 또는 퍼센트만 가능합니다.', ephemeral: true });
        return;
      }
      await saveJson(targetPath, data);
      const e = new EmbedBuilder().setTitle('가격 조정 결과').setDescription(`종류:${type} | 방식:${adjustMode} | 값:${adjustVal} | 변경:${changed}개`);
      await interaction.reply({ embeds: [e], ephemeral: true });
      return;
    }

    await interaction.reply({ content: '잘못된 옵션입니다.', ephemeral: true });
  }
};
