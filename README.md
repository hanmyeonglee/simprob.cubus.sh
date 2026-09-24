# Simprobs

고등학교 화학 중화 반응 문제와 해답을 제공하는 정적 사이트다. Docker 이미지 빌드 중 `problems/`와 `answers/`의 Markdown 파일을 각각 `index.html`, `answers.html`로 렌더링하고, 각 문서를 한 페이지씩 담은 10페이지 PDF도 생성한다. 브라우저 런타임에는 생성된 HTML, CSS, PDF만 포함된다.

## 실행

공유 `cubus_web` 네트워크가 이미 생성되어 있는 환경에서 실행한다.

```sh
docker compose build
docker compose up -d
```

기본 호스트명은 `simprobs.cubus.sh`다. 다른 호스트명을 쓸 때는 `SIMPROBS_HOST` 환경 변수를 지정한다. Cloudflare Tunnel에서 해당 호스트명을 `nginx-proxy:80`으로 보내는 경로는 인프라 설정에서 별도로 연결해야 한다.

## 생성 파일

- `/` 또는 `/index.html`: 문제 10개, 답안 보기 버튼, 문제 PDF 다운로드 버튼
- `/answers.html`: 해답 10개, 문제 보기 버튼, 해답 PDF 다운로드 버튼
- `/problems.pdf`: 문제마다 한 페이지인 10페이지 PDF
- `/answers.pdf`: 해답마다 한 페이지인 10페이지 PDF

PDF는 이미지 빌드 시 생성되며 페이지 수와 문서 순서를 빌드 중 확인한다.
