const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('관리자도움말')
        .setDescription('서버 관리진 전용 도움말을 확인합니다.'),
    async execute(interaction) {
        // 임베드 페이지들 정의
        const pages = [
            new EmbedBuilder()
                .setTitle('👑 잘 부탁드립니다. 스탭 여러분을 위한 메뉴얼입니다.')
                .setDescription('### - 스탭 필수 사항\n> **스탭 여러분은 반드시 <#1276751288117235755> / <#1224157669930176512> 2개 채널의 알림을 상시 켜두시길 바랍니다.**\n\n신고 및 민원, 갓봇을 통한 모든 유저사항은 채널ID : 1380874052855529605 에 기재됩니다.')
                .setColor(0xFFD700),
            new EmbedBuilder()
                .setTitle('1. [스탭 등급 안내]')
                .setDescription(
                    `<:Staff_Badge:1276703660436492409> <:Main_Staff_Badge:1276703924493094963> <:Server_Master_Badge:1276704005761929297>\n`
                    + `- [스탭 제재 안내](https://discord.com/channels/785841387396005948/1211656980012212264/1212757741513482321)\n`
                    + `- 스탭 여러분은 statbot을 통한 통계 현황이 집계되지 않습니다.\n\n`
                    + `## <@&1201856430580432906>  <:Staff_Badge:1276703660436492409>\n`
                    + '`유저들과 가장 친숙한 관리직`\n'
                    + '> 현재 스탭 : <@1324685105528307765> <@456226577798135808> <@308999309947437076>\n'
                    + '- 세부적인 업무 내용 및 가이드/메뉴얼은 하단 스크롤로 확인.\n'
                    + '\n[주요 업무]\n'
                    + '- 신규 유저 승인 및 케어\n'
                    + '- 유저/채널 모니터링 및 특이사항 보고\n'
                    + '- 민원 접수 [민원통합센터 통해서만]\n'
                    + '- 내전&방송 승인, 상담실 운영\n'
                    + '- 서버 이용수칙에 의거한 제재 및 관리 권한\n'
                    + '\n[해금 권한]\n'
                    + '- 신규 유저 승인/거절, 내전/방송/상담실 수동 승인, \'까봇\' 명령어 사용\n'
                    + '- 스레드&이벤트 전체, 기본 로그 열람, 일반 채팅 제거, 타임아웃, 음소거, 투표, 음성채널 우선 발언권, 유저 음성채널 이동'
                )
                .setColor(0x60A9F7),
            new EmbedBuilder()
                .setTitle('2. [메인 스탭 안내]')
                .setDescription(
                    `## <@&786128824365482025> <:Main_Staff_Badge:1276703924493094963>\n`
                    + '`모든 서버 유저, 그 중에서도 스탭을 지원하는 총책`\n'
                    + '- 더 많은 로그 열람 및 유저 추방 권한 부여\n\n'
                    + '> [메인 스탭별 업무]\n'
                    + '> - <@285645561582059520> : 공식 이벤트 진행, 아리봇/리더보드/스탯봇 담당, 민원 총 책임\n'
                    + '> - <@403164325595971584> : 스탭 서포트, 모니터링, 홍보, 스탭진 멘탈케어\n'
                    + '> - <@871253558488625175> : 까리봇 담당, 서버 모니터링, 행사/이벤트 서포트, 멤버 강등'
                )
                .setColor(0xF0B400),
            new EmbedBuilder()
                .setTitle('3. [서버 마스터 안내]')
                .setDescription(
                    `## <@&786129540828495872> <:Server_Master_Badge:1276704005761929297>\n`
                    + '`서버 운영/규칙 정립, 모든 민원 총괄 및 공식 입장 통보`\n'
                    + '- <@638742607861645372>'
                )
                .setColor(0xFF6666),
            new EmbedBuilder()
                .setTitle('4. [관리진 전원 유의사항]')
                .setDescription(
                    '- 스탭진 모두에게는 기밀 보안 유지 의무가 있습니다.\n'
                    + '```\n'
                    + '- 모든 민원 업무 처리는 명백한 "증거자료"에 의해서만 진행\n'
                    + '- 제재 시 반드시 스탭 채팅방/유저 처리내용 채널에 기록\n'
                    + '- 스탭 채팅방 내용 유출 금지\n'
                    + '- 민원/제재 내용은 관련 없는 제3자에게 노출 금지\n'
                    + '- 권한 남용/과시는 무관용\n'
                    + '- 허위사실 공표, 특정인 비방도 추방 사유\n'
                    + '- 스탭 대상 제재는 경고 없이 즉각 추방\n'
                    + '```'
                )
                .setColor(0x888888),
            new EmbedBuilder()
                .setTitle('5. [명령어 안내]')
                .setDescription(
                    '/관리 : 서버 관리 메인 명령어\n'
                    + '/디엠 : 특정 유저에게 익명 DM\n'
                    + '/서버부스트현황 : 부스트 유저 리스트 확인\n'
                    + '/ping : 응답속도 확인\n'
                    + '/msg : 관리진 전용 익명 채팅\n'
                    + '/관계 [유저1] [유저2] : 두 유저 관계 확인\n'
                    + '/게임초기화 : 갓봇 미니게임 강제 종료\n'
                    + '/챔피언배틀종료 : 챔피언배틀 강제 종료\n'
                    + '/잠수함태우기 : 음성채널 유저 잠수방 이동'
                )
                .setColor(0x5ADDA6),
        ];

        let currentPage = 0;

        // 페이지네이션 버튼
        const getRow = () => new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('이전')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('다음')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === pages.length - 1)
            );

        // 임베드 전송 (명령어 입력자만 보이게)
        await interaction.reply({
            embeds: [pages[currentPage]],
            components: [getRow()],
            ephemeral: true
        });

        // 콜렉터
        const collector = interaction.channel.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id && i.message.interaction.id === interaction.id,
            time: 60 * 1000,
        });

        collector.on('collect', async i => {
            if (i.customId === 'prev' && currentPage > 0) {
                currentPage--;
            } else if (i.customId === 'next' && currentPage < pages.length - 1) {
                currentPage++;
            }
            await i.update({ embeds: [pages[currentPage]], components: [getRow()] });
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch { }
        });
    },
};
