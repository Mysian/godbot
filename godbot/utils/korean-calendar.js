// utils/korean-calendar.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');

const CHANNEL_ID = '1432696771796013097';
const STORE = path.join(process.cwd(), 'data-calendar.json');

// 외부 캘린더(ICS) 구독 목록 — 필요시 추가/삭제
const FEEDS = [
  'https://calendar.google.com/calendar/ical/ko.south_korea.official%23holiday%40group.v.calendar.google.com/public/basic.ics',
  'https://calendars.icloud.com/holidays/kr_ko.ics'
];

// ===== 공통 유틸 =====
function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return { local:{events:{}}, external:{events:{}, fetchedAt:0}, hidden:{}, messages:{}, lastRenderedYm:null }; }
}
function writeStore(data) { fs.writeFileSync(STORE, JSON.stringify(data)); }

function kstNow() {
  const fmt = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p=>[p.type,p.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`);
}
function ymKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function ymdKey(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function lastDayOfMonth(y,m){ return new Date(y,m,0).getDate(); }
function parseDateKST(input){
  const m = input.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo<1||mo>12) return null;
  const ld = lastDayOfMonth(y,mo);
  if (d<1||d>ld) return null;
  return {y,mo,d};
}
function parseTime(t){
  if (!t) return null;
  const m = t.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return m ? `${m[1].padStart(2,'0')}:${m[2]}` : null;
}

// ===== ICS 다운로드 & 파싱 =====
function get(url){
  return new Promise((resolve,reject)=>{
    https.get(url,(res)=>{
      if (res.statusCode && res.statusCode>=300 && res.statusCode<400 && res.headers.location){
        return get(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode!==200){ reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let data=''; res.setEncoding('utf8');
      res.on('data',chunk=>data+=chunk);
      res.on('end',()=>resolve(data));
    }).on('error',reject);
  });
}

// 매우 단순화된 .ics 파서 (VEVENT 의 DTSTART/DTEND/ALLDAY, SUMMARY 만 사용)
function parseIcs(text){
  // 라인 폴딩 해제
  const lines = text.replace(/\r/g,'').split('\n').reduce((acc,l)=>{
    if (l.startsWith(' ') || l.startsWith('\t')) acc[acc.length-1]+=l.slice(1); else acc.push(l);
    return acc;
  },[]);
  const events=[];
  let inEvent=false, e={};
  for (const raw of lines){
    const line = raw.trim();
    if (line==='BEGIN:VEVENT'){ inEvent=true; e={}; continue; }
    if (line==='END:VEVENT'){ inEvent=false; if (e.SUMMARY && (e.DTSTART||e.DTSTART_DATE)) events.push(e); e={}; continue; }
    if (!inEvent) continue;
    const i = line.indexOf(':'); if (i<0) continue;
    const keyPart = line.slice(0,i); const val = line.slice(i+1);
    const key = keyPart.split(';')[0].toUpperCase();
    if (key==='SUMMARY') e.SUMMARY = val;
    else if (key==='DTSTART'){
      // 형식: YYYYMMDD 또는 YYYYMMDDTHHMMSSZ
      if (/^\d{8}$/.test(val)) e.DTSTART_DATE = val;
      else if (/^\d{8}T\d{6}Z$/.test(val)) e.DTSTART = val;
    } else if (key==='DTSTART;VALUE=DATE'){ e.DTSTART_DATE = val; }
  }
  // 날짜 키로 변환(KST)
  const norm = (e)=>{
    if (e.DTSTART_DATE){
      const y = +e.DTSTART_DATE.slice(0,4), m = +e.DTSTART_DATE.slice(4,6), d = +e.DTSTART_DATE.slice(6,8);
      return { date: ymdKey(y,m,d), title: e.SUMMARY.trim() };
    }
    if (e.DTSTART){
      // UTC → KST
      const y=+e.DTSTART.slice(0,4), mo=+e.DTSTART.slice(4,6), d=+e.DTSTART.slice(6,8);
      const hh=+e.DTSTART.slice(9,11), mm=+e.DTSTART.slice(11,13);
      const dt = new Date(Date.UTC(y,mo-1,d,hh,mm));
      const fmt = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
      const [Y,M,D] = fmt.format(dt).split('-').map(x=>+x);
      return { date: ymdKey(Y,M,D), title: e.SUMMARY.trim() };
    }
    return null;
  };
  return events.map(norm).filter(Boolean);
}

async function refreshExternalIfNeeded(store){
  const now = Date.now();
  if (now - (store.external.fetchedAt||0) < 6*60*60*1000) return store; // 6시간 캐시
  const eventsByDate = {};
  for (const url of FEEDS){
    try{
      const text = await get(url);
      const arr = parseIcs(text);
      for (const it of arr){
        eventsByDate[it.date] = eventsByDate[it.date] || [];
        eventsByDate[it.date].push({ id:`ext-${Buffer.from(it.title).toString('base64').slice(0,16)}`, title: it.title, time:null, source:url });
      }
    }catch(e){ /* skip feed */ }
  }
  store.external.events = eventsByDate;
  store.external.fetchedAt = now;
  writeStore(store);
  return store;
}

// ===== 로컬 일정 CRUD =====
function applyAdd(store, date, timeStr, titleStr, user){
  store.local.events[date] = store.local.events[date] || [];
  const id = `loc-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  store.local.events[date].push({ id, title:titleStr.trim(), time: (timeStr||'').trim() || null, by:user.id, name:user.username });
  writeStore(store);
  return id;
}
function applyRemove(store, date, kw){
  // 로컬 먼저 제거
  const list = store.local.events[date] || [];
  const i = list.findIndex(e=> e.title.includes(kw));
  if (i>=0){ const removed=list.splice(i,1)[0]; if (list.length===0) delete store.local.events[date]; writeStore(store); return removed; }
  // 외부 것은 직접 삭제 불가 → 숨김 처리
  const ex = store.external.events[date] || [];
  const hit = ex.find(e=> e.title.includes(kw));
  if (hit){
    store.hidden[date] = store.hidden[date] || {};
    store.hidden[date][hit.id] = true;
    writeStore(store);
    return { ...hit, hidden:true };
  }
  return null;
}
function searchEvents(store, q){
  const res = [];
  const isDate = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(q.trim());
  const norm = s=>s.replace(/[/.]/g,'-').replace(/\b(\d{4})-(\d)(?=-)/g,(_,a,b)=>`${a}-0${b}`).replace(/-(\d)(?=$)/g,(_,b)=>`-0${b}`);
  const mergeAt = (date, items)=>{
    if (!items || !items.length) return;
    res.push([date, items]);
  };
  const visible = (date, arr)=>arr.filter(e=>!(store.hidden[date]&&store.hidden[date][e.id]));
  if (isDate){
    const key = norm(q.trim());
    const items = [
      ...visible(key, store.external.events[key]||[]),
      ...(store.local.events[key]||[])
    ];
    if (items.length) mergeAt(key, items);
  }else{
    for (const [date, arr] of Object.entries(store.external.events||{})){
      const v = visible(date, arr).filter(e=>e.title.includes(q));
      if (v.length) mergeAt(date, v);
    }
    for (const [date, arr] of Object.entries(store.local.events||{})){
      const v = arr.filter(e=>e.title.includes(q));
      if (v.length) mergeAt(date, v);
    }
  }
  return res.sort((a,b)=>a[0].localeCompare(b[0]));
}

// ===== 달력 렌더링 =====
function kstWeekdayOf(y,m,d){
  const date = new Date(Date.UTC(y, m-1, d, 12, 0, 0));
  const name = new Intl.DateTimeFormat('ko-KR',{weekday:'short',timeZone:'Asia/Seoul'}).format(date);
  const map = { '일':0,'월':1,'화':2,'수':3,'목':4,'금':5,'토':6 };
  return map[name] ?? 0;
}
function buildCalendarBlock(year,month,store){
  const firstWd = kstWeekdayOf(year,month,1);
  const days = lastDayOfMonth(year,month);
  const header = '일  월  화  수  목  금  토';
  const cells = [];
  for (let i=0;i<firstWd;i++) cells.push('  ');
  for (let d=1;d<=days;d++) cells.push(String(d).padStart(2,' '));
  while (cells.length%7!==0) cells.push('  ');

  const kst = kstNow();
  const tY = kst.getFullYear(), tM = kst.getMonth()+1, tD = kst.getDate();

  const lines = [];
  for (let r=0;r<cells.length/7;r++){
    const row = [];
    for (let c=0;c<7;c++){
      const idx = r*7+c;
      const v = cells[idx];
      if (v.trim()===''){ row.push('  '); continue; }
      const d = parseInt(v.trim(),10);
      const key = ymdKey(year,month,d);

      const external = (store.external.events[key]||[]).filter(e=>!(store.hidden[key]&&store.hidden[key][e.id]));
      const local = store.local.events[key]||[];
      const hasEvent = external.length + local.length > 0;

      const isToday = (tY===year && tM===month && tD===d);
      const isHoliday = external.some(e => /공휴일|대체공휴일|설날|추석|신정|삼일절|현충일|광복절|개천절|한글날|크리스마스/.test(e.title));

      let label = v;
      if (isHoliday) label = `#${label}`;      // 공휴일 마킹
      if (isToday) label = `[${String(label.trim()).padStart(2,' ')}]`;
      else label = ` ${label} `;
      if (hasEvent) label = label.replace(/\s?(\d{1,2})\s?/, (m,g)=>`*${String(g).padStart(2,' ')}*`); // 일정 있음 = 볼드
      label = label.replace(/#/,'🔴');         // 공휴일 = 빨간 점
      row.push(label);
    }
    lines.push(row.join(' '));
  }
  return '```text\n' + header + '\n' + lines.join('\n') + '\n```';
}
function monthTitle(year,month){
  const dt = new Date(Date.UTC(year,month-1,1,12));
  const name = new Intl.DateTimeFormat('ko-KR',{month:'long'}).format(dt);
  return `${year}년 ${name}`;
}
function actionRows(viewYm){
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`kcal:prev:${viewYm}`).setStyle(ButtonStyle.Secondary).setLabel('이전달').setEmoji('◀'),
      new ButtonBuilder().setCustomId(`kcal:today`).setStyle(ButtonStyle.Secondary).setLabel('오늘').setEmoji('📅'),
      new ButtonBuilder().setCustomId(`kcal:next:${viewYm}`).setStyle(ButtonStyle.Secondary).setLabel('다음달').setEmoji('▶')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`kcal:search`).setStyle(ButtonStyle.Primary).setLabel('검색').setEmoji('🔎'),
      new ButtonBuilder().setCustomId(`kcal:add`).setStyle(ButtonStyle.Success).setLabel('일정 추가'),
      new ButtonBuilder().setCustomId(`kcal:remove`).setStyle(ButtonStyle.Danger).setLabel('일정 제거')
    )
  ];
}
function renderEmbed(year,month,store){
  const desc = buildCalendarBlock(year,month,store);
  const kst = kstNow();
  const todayKey = ymdKey(kst.getFullYear(),kst.getMonth()+1,kst.getDate());
  const todayItems = [
    ...((store.external.events[todayKey]||[]).filter(e=>!(store.hidden[todayKey]&&store.hidden[todayKey][e.id]))),
    ...(store.local.events[todayKey]||[])
  ];
  const listToday = todayItems.slice(0,10).map(e=>`• ${e.time?`[${e.time}] `:''}${e.title}`).join('\n') || '등록된 일정이 없습니다.';
  return new EmbedBuilder()
    .setTitle(`${monthTitle(year,month)} | 한국 시간 기준`)
    .setDescription(desc)
    .addFields(
      {name:'오늘', value: todayKey, inline:true},
      {name:'오늘 일정', value:listToday, inline:false},
      {name:'표기', value:'🔴 공휴일 · *굵은 숫자* 일정 있음 · [숫자] 오늘', inline:false}
    )
    .setColor(0x5865F2)
    .setTimestamp(kst);
}

// ===== 메시지 생성/업데이트 =====
async function ensureMonthMessage(client, store, year, month){
  const channel = await client.channels.fetch(CHANNEL_ID).catch(()=>null);
  if (!channel || !channel.isTextBased()) return;
  const embed = renderEmbed(year,month,store);
  const rows = actionRows(`${year}-${String(month).padStart(2,'0')}`);
  if (store.messages.messageId){
    const msg = await channel.messages.fetch(store.messages.messageId).catch(()=>null);
    if (msg){ await msg.edit({embeds:[embed], components:rows}); return; }
  }
  const sent = await channel.send({embeds:[embed], components:rows});
  store.messages.messageId = sent.id;
  writeStore(store);
}

// ===== 모달 =====
async function openAddModal(interaction){
  const modal = new ModalBuilder().setCustomId('kcal:modal:add').setTitle('일정 추가');
  const date = new TextInputBuilder().setCustomId('kcal:date').setLabel('날짜 (YYYY-MM-DD)').setPlaceholder('2025-10-28').setRequired(true).setStyle(TextInputStyle.Short);
  const time = new TextInputBuilder().setCustomId('kcal:time').setLabel('시간 (선택, HH:mm)').setPlaceholder('20:30').setRequired(false).setStyle(TextInputStyle.Short);
  const title = new TextInputBuilder().setCustomId('kcal:title').setLabel('일정 내용').setPlaceholder('길드 레이드').setRequired(true).setStyle(TextInputStyle.Paragraph);
  modal.addComponents(new ActionRowBuilder().addComponents(date), new ActionRowBuilder().addComponents(time), new ActionRowBuilder().addComponents(title));
  await interaction.showModal(modal);
}
async function openRemoveModal(interaction){
  const modal = new ModalBuilder().setCustomId('kcal:modal:remove').setTitle('일정 제거');
  const date = new TextInputBuilder().setCustomId('kcal:date').setLabel('날짜 (YYYY-MM-DD)').setPlaceholder('2025-10-28').setRequired(true).setStyle(TextInputStyle.Short);
  const keyword = new TextInputBuilder().setCustomId('kcal:kw').setLabel('키워드 포함(부분일치)').setPlaceholder('레이드').setRequired(true).setStyle(TextInputStyle.Short);
  modal.addComponents(new ActionRowBuilder().addComponents(date), new ActionRowBuilder().addComponents(keyword));
  await interaction.showModal(modal);
}
async function openSearchModal(interaction){
  const modal = new ModalBuilder().setCustomId('kcal:modal:search').setTitle('일정 검색');
  const q = new TextInputBuilder().setCustomId('kcal:q').setLabel('날짜(YYYY-MM-DD) 또는 키워드').setPlaceholder('2025-10-28 혹은 레이드').setRequired(true).setStyle(TextInputStyle.Short);
  modal.addComponents(new ActionRowBuilder().addComponents(q));
  await interaction.showModal(modal);
}

// ===== 초기화 =====
module.exports = async function init(client){
  let store = readStore();
  store = await refreshExternalIfNeeded(store);

  const now = kstNow();
  await ensureMonthMessage(client, store, now.getFullYear(), now.getMonth()+1);

  client.on('interactionCreate', async (interaction)=>{
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    if (interaction.isButton()){
      if (!interaction.customId.startsWith('kcal:')) return;

      if (interaction.customId==='kcal:today'){
        await interaction.deferUpdate();
        let s = readStore(); s = await refreshExternalIfNeeded(s);
        const k = kstNow();
        await ensureMonthMessage(interaction.client, s, k.getFullYear(), k.getMonth()+1);
        return;
      }
      const [_,action,ym] = interaction.customId.split(':');
      const base = kstNow();
      let y = base.getFullYear(), m = base.getMonth()+1;
      if (ym && /^\d{4}-\d{2}$/.test(ym)){ y = parseInt(ym.slice(0,4),10); m = parseInt(ym.slice(5),10); }
      if (action==='prev'){
        const d = new Date(Date.UTC(y,m-2,1)); const ny = d.getUTCFullYear(), nm = d.getUTCMonth()+1;
        await interaction.deferUpdate();
        let s = readStore(); s = await refreshExternalIfNeeded(s);
        await ensureMonthMessage(interaction.client, s, ny, nm);
        return;
      }
      if (action==='next'){
        const d = new Date(Date.UTC(y,m,1)); const ny = d.getUTCFullYear(), nm = d.getUTCMonth()+1;
        await interaction.deferUpdate();
        let s = readStore(); s = await refreshExternalIfNeeded(s);
        await ensureMonthMessage(interaction.client, s, ny, nm);
        return;
      }
      if (action==='add'){ await openAddModal(interaction); return; }
      if (action==='remove'){ await openRemoveModal(interaction); return; }
      if (action==='search'){ await openSearchModal(interaction); return; }
      return;
    }

    if (interaction.isModalSubmit()){
      if (!interaction.customId.startsWith('kcal:modal:')) return;

      if (interaction.customId==='kcal:modal:add'){
        const dateStr = interaction.fields.getTextInputValue('kcal:date').trim();
        const timeStr = interaction.fields.getTextInputValue('kcal:time').trim();
        const titleStr = interaction.fields.getTextInputValue('kcal:title').trim();
        const parsed = parseDateKST(dateStr);
        if (!parsed){ await interaction.reply({content:'날짜 형식이 올바르지 않습니다. 예) 2025-10-28', ephemeral:true}); return; }
        const okTime = parseTime(timeStr) || null;
        let s = readStore();
        const id = applyAdd(s, ymdKey(parsed.y,parsed.mo,parsed.d), okTime, titleStr, interaction.user);
        await interaction.reply({content:`추가 완료: ${ymdKey(parsed.y,parsed.mo,parsed.d)} ${okTime?`[${okTime}] `:''}${titleStr}`, ephemeral:true});
        s = await refreshExternalIfNeeded(readStore());
        await ensureMonthMessage(interaction.client, s, parsed.y, parsed.mo);
        return;
      }

      if (interaction.customId==='kcal:modal:remove'){
        const dateStr = interaction.fields.getTextInputValue('kcal:date').trim();
        const kw = interaction.fields.getTextInputValue('kcal:kw').trim();
        const parsed = parseDateKST(dateStr);
        if (!parsed){ await interaction.reply({content:'날짜 형식이 올바르지 않습니다. 예) 2025-10-28', ephemeral:true}); return; }
        let s = readStore();
        const removed = applyRemove(s, ymdKey(parsed.y,parsed.mo,parsed.d), kw);
        if (removed){
          await interaction.reply({content:`제거 처리: ${dateStr} ${removed.time?`[${removed.time}] `:''}${removed.title}${removed.hidden?' (외부 이벤트 숨김)':''}`, ephemeral:true});
          s = await refreshExternalIfNeeded(readStore());
          await ensureMonthMessage(interaction.client, s, parsed.y, parsed.mo);
        } else {
          await interaction.reply({content:`해당 날짜에서 '${kw}' 를 포함한 일정을 찾지 못했습니다.`, ephemeral:true});
        }
        return;
      }

      if (interaction.customId==='kcal:modal:search'){
        const q = interaction.fields.getTextInputValue('kcal:q').trim();
        let s = await refreshExternalIfNeeded(readStore());
        const results = searchEvents(s, q);
        if (results.length===0){ await interaction.reply({content:`검색 결과가 없습니다.`, ephemeral:true}); return; }
        const lines = [];
        for (const [date, arr] of results){
          lines.push(`• ${date}`);
          for (const e of arr){ lines.push(`  - ${e.time?`[${e.time}] `:''}${e.title}${e.source?' (외부)':''}`); }
        }
        const chunk = lines.join('\n').slice(0,1900);
        await interaction.reply({embeds:[ new EmbedBuilder().setTitle('검색 결과').setDescription('```text\n'+chunk+'\n```').setColor(0x2ECC71) ], ephemeral:true});
        return;
      }
    }
  });

  // 정기 새로고침(외부 캘린더 + 월 전환 체크)
  setInterval(async()=>{
    let s = await refreshExternalIfNeeded(readStore());
    const now2 = kstNow();
    const key = ymKey(now2);
    if (s.lastRenderedYm !== key){
      await ensureMonthMessage(client, s, now2.getFullYear(), now2.getMonth()+1);
      s.lastRenderedYm = key;
      writeStore(s);
    } else {
      // 월 안 바뀌어도 외부 피드 갱신 반영
      await ensureMonthMessage(client, s, now2.getFullYear(), now2.getMonth()+1);
    }
  }, 30*60*1000);
};
