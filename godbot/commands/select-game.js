const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ComponentType } = require("discord.js");

// 롤, 스팀게임, 나머지
const PAGE_SIZE = 10;
const LOL = ["소환사의 협곡", "칼바람 나락", "롤토체스", "이벤트 모드"];
const STEAM_GAMES = ["스팀게임"];
const MAIN_IMAGE_URL = "https://media.discordapp.net/attachments/1388728993787940914/1389192042143551548/image.png?ex=6863b968&is=686267e8&hm=f5cd94557360f427a8a3bfca9b8c27290ce29d5e655871541c309133b0082e85&=&format=webp&quality=lossless";
const FOOTER_ICON_URL = "https://media.discordapp.net/attachments/1388728993787940914/1389194104424108223/2D.png?ex=6863bb54&is=686269d4&hm=59f7fbfb39d474b2577fbc87765daa533f636fa3e702285c24eda0fd51aebaa3&=&format=webp&quality=lossless";
const ALL_GAMES = [
  "소환사의 협곡", "칼바람 나락", "롤토체스", "이벤트 모드", // 롤
  "스팀게임", // 스팀
  "DJ MAX", "FC", "GTA", "GTFO", "TRPG", "건파이어 리본", "구스구스 덕", "데드락", "데바데", "델타포스",
  "돈스타브", "래프트", "레인보우식스", "레포", "로스트아크", "리썰컴퍼니", "리스크 오브 레인", "마스터 듀얼",
  "마인크래프트", "마피아42", "메이플스토리", "몬스터 헌터", "문명", "발로란트", "배틀그라운드", "배틀필드",
  "백룸", "백 포 블러드", "블레이드 앤 소울", "블루아카이브", "비세라 클린업", "서든어택", "선 헤이븐",
  "스컬", "스타듀밸리", "스타크래프트", "에이펙스", "엘소드", "오버워치", "왁제이맥스", "워프레임",
  "원신", "원스 휴먼", "이터널 리턴", "좀보이드", "카운터스트라이크", "코어 키퍼", "콜오브듀티", "테라리아",
  "테이블 탑 시뮬레이터", "테일즈런너", "파스모포비아", "파워워시 시뮬레이터", "파티 애니멀즈", "팰월드", "페긴",
  "프래그 펑크", "휴먼폴플랫", "헬다이버즈", "히오스"
];

const GAME_EMOJIS = {
  "소환사의 협곡": "<:lol1:1209715264115974144>",
  "칼바람 나락": "<:lol2:1209715933262905484>",
  "롤토체스": "<:lol3:1209715268964720680>",
  "이벤트 모드": "<:lol4:1264547319550840863>",
  "스팀게임": "<:steamgames:1209715229492117534>",
  "DJ MAX": "<:djmax:1209715237864087603>",
  "FC": "<:FcFifa:1209715892913438730>",
  "GTA": "<:gta:1209715249016737892>",
  "GTFO": "<:gtfo:1209715231647989791>",
  "TRPG": "🎲",
  "건파이어 리본": "<:Gunfire_Reborn:1287616806843842600>",
  "구스구스 덕": "<:GooseGooseDuck:1209715246743429140>",
  "데드락": "<:Dead_Lock:1287616809876324374>",
  "데바데": "<:DeadByDaylight:1212026350123225138>",
  "델타포스": "<:DeltaForce:1325337677691617331>",
  "돈스타브": "<:Dontstarve:1227026743777431553>",
  "래프트": "<:raft:1209715251826786314>",
  "레인보우식스": "<:RainbowSix:1209715227122466887>",
  "레포": "<:REPO:1348545414013390858>",
  "로스트아크": "<:lostark:1209715273070936064>",
  "리썰컴퍼니": "<:lethalCompany:1209715276325724180>",
  "리스크 오브 레인": "<:riskofrain:1209715278259425330>",
  "마스터 듀얼": "<:masterduel:1209715988556423179>",
  "마인크래프트": "<:minecraft:1209715287616917534>",
  "마피아42": "<:mafia42:1209739752862126092>",
  "메이플스토리": "<:maplestory:1239453793741963274>",
  "몬스터 헌터": "<:MONSTERHUNTER:1239453811941183558>",
  "문명": "<:Civilization:1227027166663938068>",
  "발로란트": "<:Valorant:1209715300032057436>",
  "배틀그라운드": "<:PUBG:1209741906133786634>",
  "배틀필드": "<:battlefield:1209715305270616094>",
  "백룸": "<:backroom:1209715310303641650>",
  "백 포 블러드": "<:Back4Blood:1239453806186729544>",
  "블레이드 앤 소울": "<:BladeandSoul:아이디_직접입력>",
  "블루아카이브": "<:bluearchive:1209750788080013322>",
  "비세라 클린업": "<:VisceraCleanup:1239453802386690090>",
  "서든어택": "<:suddenattack:1209715325038497832>",
  "선 헤이븐": "<:sunhaven:1239475392176459856>",
  "스컬": "<:skul:1212026352539144203>",
  "스타듀밸리": "<:StardewValley:1227026750718869638>",
  "스타크래프트": "<:Starcraft:1239453819381743737>",
  "에이펙스": "<:apex:1209715329400311859>",
  "엘소드": "<:Elsword:1319307644485505044>",
  "오버워치": "<:overwatch:1209715332126875720>",
  "왁제이맥스": "<:Wak:1239468331376054314>",
  "워프레임": "<:warframe:1209715336404803615>",
  "원신": "<:genshin:1209750786012221471>",
  "원스 휴먼": "<:once_human:1277595703941533696>",
  "이터널 리턴": "<:EternalReturn:1209715201860173836>",
  "좀보이드": "<:zomboid:1209715205324406865>",
  "카운터스트라이크": "<:CSO:1209715207220232212>",
  "코어 키퍼": "<:CoreKeeper:1239454456110780466>",
  "콜오브듀티": "<:CallOfDuty:1227026741650915429>",
  "테라리아": "<:terraria:1209715209120387172>",
  "테이블 탑 시뮬레이터": "<:TabletopSimulator:1239453797668098079>",
  "테일즈런너": "<:TalesRunner:1209715210852638731>",
  "파스모포비아": "<:phasmophobia:1209715213306302524>",
  "파워워시 시뮬레이터": "<:PowerWashSimulator:1227026735619637368>",
  "파티 애니멀즈": "<:party_animals2:1319307580773761106>",
  "팰월드": "<:Palworld:1209715220360990791>",
  "페긴": "<:feign:1209715217152475166>",
  "프래그 펑크": "<:FragPunk:1348542967677456444>",
  "휴먼폴플랫": "<:humanfallflat:1209715225742549062>",
  "헬다이버즈": "<:helldivers:1209715222462599188>",
  "히오스": "<:HeroesoftheStorm:1361899848579678218>"
};

// 롤/스팀 제외 나머지 정렬
function getInitial(char) {
  const code = char.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
    const initialIdx = Math.floor((code - 0xac00) / 588);
    return INITIALS[initialIdx];
  }
  if (/[a-zA-Z]/.test(char)) return char[0].toLowerCase();
  return "Ω";
}
function sortByInitial(a, b) {
  const ia = getInitial(a);
  const ib = getInitial(b);
  if (ia === ib) return a.localeCompare(b, "ko-KR");
  if (ia === "Ω") return 1;
  if (ib === "Ω") return -1;
  if (/[ㄱ-ㅎ]/.test(ia) && /[ㄱ-ㅎ]/.test(ib)) return ia.localeCompare(ib, "ko-KR");
  if (/[ㄱ-ㅎ]/.test(ia)) return -1;
  if (/[ㄱ-ㅎ]/.test(ib)) return 1;
  return ia.localeCompare(ib, "en");
}

const EXCLUDE_GAMES = [...LOL, ...STEAM_GAMES];
const ETC_GAMES = ALL_GAMES.filter(x => !EXCLUDE_GAMES.includes(x)).sort(sortByInitial);

const GAMES_PAGED = [ // 첫 페이지만 롤+스팀, 나머지는 10개씩 끊음
  [...LOL, ...STEAM_GAMES, ...ETC_GAMES.slice(0, 5)],
  ...Array.from({ length: Math.ceil((ETC_GAMES.length - 5) / 10) }, (_, i) =>
    ETC_GAMES.slice(5 + i * 10, 5 + (i + 1) * 10)
  )
];

// 역할명별로 아이콘 부여
function getIcon(roleName) {
  if (LOL.includes(roleName)) return "🟦";
  if (STEAM_GAMES.includes(roleName)) return "⚙️";
  return "🎮";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임선택")
    .setDescription("게임 역할 태그를 설정합니다. (가나다 순 정렬)"),

  async execute(interaction) {
    await interaction.guild.roles.fetch();
    let member = await interaction.guild.members.fetch(interaction.user.id);

    let page = 0;
    const totalPages = GAMES_PAGED.length;
    let processing = false;

    function getPageRoles(idx) {
      const gameNames = GAMES_PAGED[idx];
      const roles = interaction.guild.roles.cache.filter(
        role => !role.managed && gameNames.includes(role.name)
      );
      const rolesInOrder = gameNames.map(name => roles.find(r => r.name === name)).filter(Boolean);
      return rolesInOrder;
    }

    async function showPage(pageIdx, updateInteraction = null, isProcessing = false) {
      const rolesThisPage = getPageRoles(pageIdx);

      const description =
        rolesThisPage.map((role) =>
          `${member.roles.cache.has(role.id) ? "✅" : "⬜"}  ${GAME_EMOJIS[role.name] || ""}  ${member.roles.cache.has(role.id) ? `**${role.name}**` : `*${role.name}*`}`
        ).join('\n') || '선택 가능한 역할이 없습니다.';

      const embed = new EmbedBuilder()
        .setTitle(`게임 역할 선택 (페이지 ${pageIdx + 1}/${totalPages})`)
        .setDescription(description)
        .setColor(0x2095ff)
        .setImage(MAIN_IMAGE_URL)
        .setFooter({
          text: "게임 태그를 1개 이상 유지하세요. │신규 게임태그 문의는 스탭진에게",
          iconURL: FOOTER_ICON_URL
        });

      if (isProcessing) {
        const processingRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("processing")
            .setLabel("처리중입니다. 잠시만 기다려주세요")
            .setStyle("Secondary")
            .setDisabled(true)
        );
        if (updateInteraction) return updateInteraction.update({ embeds: [embed], components: [processingRow], ephemeral: true });
        else return interaction.editReply({ embeds: [embed], components: [processingRow], ephemeral: true });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("game_roles_select")
        .setPlaceholder("설정할 게임 태그를 선택하세요")
        .setMinValues(0)
        .setMaxValues(rolesThisPage.length)
        .addOptions(
          rolesThisPage.map(role => ({
            label: role.name.length > 100 ? role.name.slice(0, 97) + "..." : role.name,
            value: role.id,
            default: member.roles.cache.has(role.id)
          }))
        );

      const actionRow = new ActionRowBuilder().addComponents(selectMenu);

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prev")
          .setLabel("이전")
          .setStyle("Secondary")
          .setDisabled(pageIdx === 0)
          .setEmoji("⬅️"),
        new ButtonBuilder()
          .setCustomId("next")
          .setLabel("다음")
          .setStyle("Primary")
          .setDisabled(pageIdx >= totalPages - 1)
          .setEmoji("➡️"),
      );

      const payload = {
        embeds: [embed],
        components: [actionRow, navRow],
        ephemeral: true,
      };
      if (updateInteraction) await updateInteraction.update(payload);
      else await interaction.reply(payload);
    }

    await showPage(page);

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 120_000,
    });

    collector.on("collect", async i => {
  if (i.isStringSelectMenu()) {
    const selected = new Set(i.values);
    const rolesThisPage = getPageRoles(page);
    const toAdd = [];
    const toRemove = [];
    for (const role of rolesThisPage) {
      if (selected.has(role.id) && !member.roles.cache.has(role.id)) toAdd.push(role.id);
      if (!selected.has(role.id) && member.roles.cache.has(role.id)) toRemove.push(role.id);
    }
    if (toAdd.length) await member.roles.add(toAdd, "게임 역할 선택");
    if (toRemove.length) await member.roles.remove(toRemove, "게임 역할 해제");

    member = await interaction.guild.members.fetch(interaction.user.id);
    await showPage(page, i);

  } else if (i.isButton()) {
    if (i.customId === "prev" && page > 0) {
      page -= 1;
      await showPage(page, i);
    }
    if (i.customId === "next" && page < totalPages - 1) {
      page += 1;
      await showPage(page, i);
    }
  }
});

    collector.on("end", async () => {
      try {
        await interaction.editReply({
          components: [],
        });
      } catch {}
    });
  }
};
