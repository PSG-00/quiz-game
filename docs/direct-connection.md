# 게임 연결 직행 (Cloudflare 우회)

## 왜 필요한가

2026-10-27 측정 결과, 한국 PC와 4G 폰 모두 Cloudflare의 LA 지점(`colo=LAX`)으로 들어간다. 서버 VM은 서울(`asia-northeast3-c`)에 있으므로 모든 신호가 한국 → LA → 서울을 오간다. Cloudflare 입구까지 왕복 138ms, 게임 서버까지 앱 핑 왕복 270ms(폰 4G 약 300ms)였다. 경로가 길수록 패킷 하나가 유실될 때 연결 전체가 잠깐 멈추기 쉽다.

사용자가 들어오는 주소는 그대로 `quiz.rescene.online`이고, 화면 파일도 지금처럼 Cloudflare 캐시로 받는다. 게임용 WebSocket만 DNS ONLY 주소 `ws.quiz.rescene.online`으로 서울 VM에 바로 붙는다. VM에서는 Caddy가 인증서를 받고 `127.0.0.1:3000`으로 넘긴다.

## 동작

- 서버 환경 변수 `OX_DIRECT_WS_URL`이 있을 때만 페이지에 `<meta name="ox-direct-socket">`을 넣는다. 없으면 지금과 똑같이 페이지 주소로만 연결한다.
- 새 연결은 직접 주소를 먼저 쓴다. 직접 연결이 3초 안에 열리지 않거나 WELCOME 전에 닫히면 다음 한 번은 Cloudflare로 연결한다.
- Cloudflare 연결이 붙으면 직접 주소를 옆에서 한 번 확인한다. 확인도 실패하면 그 탭은 10분 동안 Cloudflare만 쓴다.
- 확인이 성공하면(직접 주소는 멀쩡한데 Cloudflare에 붙은 경우) 연결 복구 버튼과 같은 방식으로 같은 자리를 유지한 채 직접 주소로 옮긴다. 대기실(`WAITING`), 쉬는 시간(`BREAK`, 남은 시간 8초 이상), 게임 종료(`ENDED`)에서만 옮기고, 문제·판정·추첨 중이거나 재연결이 닫아 버리는 창(비밀번호·저장·우승 기록 등)이 열려 있으면 기다린다. 로비에서는 옮기지 않고 방에 들어간 뒤 옮긴다. 옮긴 뒤 5분 안에는 다시 옮기지 않는다.
- 두 경로가 모두 실패하면 망 자체가 끊긴 것이므로 번갈아 시도한다. Cloudflare 장애 때는 막아 둔 직접 주소도 다시 시도한다.
- 화면이 꺼져 있거나 다른 앱에 가 있는 동안(`document.hidden`)의 실패는 세지 않는다. 안드로이드는 이때 크롬의 인터넷을 막아 어느 주소든 수십 ms 만에 실패하므로 경로에 대한 정보가 없다. 그래서 화면을 켜면 항상 직접 주소부터 시도한다.
- 서버 재시작(1012)·접속 인원 초과(1013)는 경로 실패로 세지 않는다.

## 로그

- `CONNECTION_CLOSED`, `SESSION_RESTORED`에 `path`(`direct`/`cf`)가 붙는다.
- `CONNECTION_PATHS {"direct":n,"cf":m}`: 직접 주소가 켜져 있을 때 1분마다, 숫자가 바뀌었을 때만 남는다.
- `CLIENT_DIAG`의 모든 항목에 그 순간의 `path`가 붙고, 다음 이유가 추가됐다.
  - `direct-failed`: 직접 연결이 WELCOME 전에 실패함. `detail`은 걸린 시간, `code`는 종료 코드.
  - `direct-probe`: Cloudflare로 붙은 뒤 직접 주소 확인 결과(`ok`/`failed`).
  - `direct-switch`: 확인 결과가 `ok`여서 직접 주소로 옮김. `detail`은 옮긴 시점의 게임 단계.

```bash
grep -h -E "CONNECTION_PATHS|direct-failed|direct-probe|direct-switch" ~/.pm2/logs/ox-quiz-show-out*.log | tail -20
```

## 서버 설정 (한 번만)

1. **고정 IP**: GCP 콘솔 → VPC 네트워크 → IP 주소 → VM의 외부 IP 행 → "고정 IP 주소로 승격(Promote to static IP address)". 임시 IP는 VM을 껐다 켜면 바뀐다.
2. **방화벽**: Compute Engine → VM 인스턴스 → 수정 → 방화벽에서 "HTTPS 트래픽 허용"을 체크한다. 80 포트는 같은 VM의 다른 서비스(Docker)가 쓰므로 HTTP 설정은 그대로 둔다. 3000 포트는 열지 않는다.
3. **DNS**: Cloudflare → DNS → 레코드 추가. 유형 `A`, 이름 `ws.quiz`, IPv4 주소는 1번의 고정 IP, 프록시 상태는 **DNS 전용(회색 구름)**. 기존 `quiz` 레코드는 건드리지 않는다.
4. **443 사용 여부 확인**: 아무것도 나오지 않아야 한다. 2026-10-27 기준 80은 Docker(`docker-proxy`)가 쓰고 443은 비어 있다. 그래서 Caddy는 443만 쓰고, 인증서도 443으로 받는다(TLS-ALPN 방식).
   ```bash
   sudo ss -tlnp | grep -E ':443\s'
   ```
5. **Caddy 설치** (Debian/Ubuntu). 설치 직후 Caddy 기본 설정은 80 포트를 쓰려다 실패한다. 다음 단계에서 설정을 바꾸면 정상이고, Docker 쪽 80에는 영향이 없다.
   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install -y caddy
   ```
6. **Caddy 설정**: 게임 서버는 루프백에서 온 `CF-Connecting-IP`를 접속자 IP로 믿고 비밀번호·방 코드 시도 횟수를 IP별로 센다. Caddy가 이 헤더를 실제 접속 IP로 덮어써야 접속자가 값을 꾸며 넣을 수 없고, 모든 사람이 같은 IP로 묶이지 않는다.
   ```bash
   sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
   {
   	auto_https disable_redirects
   }
   https://ws.quiz.rescene.online {
   	tls {
   		issuer acme {
   			disable_http_challenge
   		}
   	}
   	reverse_proxy 127.0.0.1:3000 {
   		header_up CF-Connecting-IP {remote_host}
   		stream_close_delay 30m
   	}
   }
   EOF
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl restart caddy
   sudo ss -tlnp | grep caddy
   ```
   `auto_https disable_redirects`와 `disable_http_challenge`는 Caddy가 80 포트를 아예 쓰지 않게 한다. 마지막 명령에는 `:443`(그리고 내부 관리용 `127.0.0.1:2019`)만 보여야 한다. 처음 한 번은 기본 설정으로 실패한 상태라 `restart`를 쓰고, 이후 설정을 바꿀 때는 `reload`를 쓴다. 인증서 발급은 2·3번(443 개방, DNS 레코드)이 끝난 뒤에야 성공한다. 순서가 바뀌어도 Caddy가 몇 분 간격으로 다시 시도한다.

   `stream_close_delay`는 Caddy 설정을 다시 읽을 때 열려 있는 게임 연결을 바로 끊지 않고 최대 30분 유지하게 한다. `systemctl restart caddy`나 Caddy 업데이트는 직접 연결을 모두 끊으므로 게임 중에는 하지 않는다. 끊겨도 폰은 다시 연결하며, 직접 주소가 안 되면 Cloudflare로 붙는다.
7. **확인**: PC에서 아래 명령이 방 목록 JSON을 돌려주면 된다. 처음에는 인증서 발급에 몇 초 걸릴 수 있다.
   ```bash
   curl -s https://ws.quiz.rescene.online/api/rooms
   ```
   폰에서 https://ws.quiz.rescene.online 을 열면 같은 게임이 Cloudflare 없이 열린다(시험용 주소). 방에 들어가 연결 복구를 누르면 `CLIENT_DIAG`의 `rttMs`로 직접 경로의 왕복 시간을 볼 수 있다.

## 켜기와 끄기

켜기: `ecosystem.config.cjs`의 `env_production`에 `OX_DIRECT_WS_URL: 'wss://ws.quiz.rescene.online'`을 넣고 게임이 없을 때 main에 푸시한다. 배포 뒤 새로 연 페이지부터 직접 주소를 쓴다.

끄기: 같은 줄을 지우고 푸시한다. 급할 때는 Caddy를 멈추거나(`sudo systemctl stop caddy`) DNS 레코드를 지워도 된다. 이 경우 폰은 직접 연결 실패 후 Cloudflare로 붙는다. 탭마다 처음 한 번은 실패를 확인하느라 최대 3초 늦어진다.

대가: `ws.quiz` 주소로는 VM IP가 공개되고, 그 경로는 Cloudflare의 공격 차단을 받지 않는다. 페이지와 Cloudflare 경로는 그대로 남는다.
