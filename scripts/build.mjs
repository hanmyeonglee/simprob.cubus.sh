import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';
import katexPluginModule from '@vscode/markdown-it-katex';
import puppeteer from 'puppeteer-core';

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
const assets = join(output, 'assets');
const katexPlugin = katexPluginModule.default ?? katexPluginModule;

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
}).use(katexPlugin, { throwOnError: true });

const documents = await loadDocuments();
await rm(output, { recursive: true, force: true });
await mkdir(assets, { recursive: true });

await writeFile(join(output, 'index.html'), createPage({
  pageTitle: '중화 반응 문제',
  heading: '중화 반응 문제',
  description: '고등학교 화학 중화 반응 문제 10개',
  switchLabel: '답안 보기',
  switchHref: 'answers.html',
  downloadLabel: '문제 PDF 다운로드',
  downloadHref: 'problems.pdf',
  items: documents.problems,
  type: 'problem',
}));

await writeFile(join(output, 'answers.html'), createPage({
  pageTitle: '중화 반응 문제 해답',
  heading: '중화 반응 문제 해답',
  description: '고등학교 화학 중화 반응 문제 10개 해답',
  switchLabel: '문제 보기',
  switchHref: 'index.html',
  downloadLabel: '해답 PDF 다운로드',
  downloadHref: 'answers.pdf',
  items: documents.answers,
  type: 'answer',
}));

await cp(join(root, 'styles', 'site.css'), join(assets, 'site.css'));
await cp(join(root, 'node_modules', 'katex', 'dist', 'katex.min.css'), join(assets, 'katex.min.css'));
await cp(join(root, 'node_modules', 'katex', 'dist', 'fonts'), join(assets, 'fonts'), { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  await createPdf(browser, 'index.html', 'problems.pdf', ['답안 보기', '문제 PDF 다운로드']);
  await createPdf(browser, 'answers.html', 'answers.pdf', ['문제 보기', '해답 PDF 다운로드']);
} finally {
  await browser.close();
}

console.log(`Generated index.html, answers.html, and 10-page PDFs for ${documents.problems.length} problems.`);

async function loadDocuments() {
  const [problems, answers] = await Promise.all([
    loadCollection('problems'),
    loadCollection('answers'),
  ]);

  if (problems.length !== 10 || answers.length !== 10) {
    throw new Error(`Expected 10 problem and 10 answer Markdown files; found ${problems.length} and ${answers.length}.`);
  }

  const expectedNumbers = Array.from({ length: 10 }, (_, index) => index + 1);
  for (const [label, entries] of [['problems', problems], ['answers', answers]]) {
    const actual = entries.map((entry) => entry.number);
    if (actual.some((number, index) => number !== expectedNumbers[index])) {
      throw new Error(`${label}/ must contain problem-01.md through problem-10.md in order.`);
    }
  }

  return { problems, answers };
}

async function loadCollection(directory) {
  const filenames = (await readdir(join(root, directory)))
    .filter((filename) => /^problem-\d{2}\.md$/.test(filename))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));

  return Promise.all(filenames.map(async (filename) => {
    const number = Number(filename.match(/^problem-(\d{2})\.md$/)[1]);
    const source = await readFile(join(root, directory, filename), 'utf8');
    return {
      number,
      html: markdown.render(source),
      filename,
    };
  }));
}

function createPage({ pageTitle, heading, description, switchLabel, switchHref, downloadLabel, downloadHref, items, type }) {
  const articles = items.map(({ number, html }) => `
    <article class="document" id="${type}-${number}" data-document-number="${number}">
      ${html}
    </article>`).join('\n');

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${description}">
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="assets/katex.min.css">
    <link rel="stylesheet" href="assets/site.css">
  </head>
  <body>
    <nav class="action-bar" aria-label="문서 메뉴">
      <a class="button button-primary" href="${switchHref}">${switchLabel}</a>
      <a class="button button-secondary" href="${downloadHref}" download>${downloadLabel}</a>
    </nav>
    <header class="page-heading">
      <p class="eyebrow">CHEMISTRY · HIGH SCHOOL</p>
      <h1>${heading}</h1>
      <p>${description}</p>
    </header>
    <main class="documents">
${articles}
    </main>
    <footer class="site-footer">총 ${items.length}개 문서</footer>
  </body>
</html>
`;
}

async function createPdf(browserInstance, htmlFilename, pdfFilename, buttonTexts) {
  const page = await browserInstance.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
  await page.emulateMediaType('print');
  await page.goto(pathToFileURL(join(output, htmlFilename)).href, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  const layout = await page.evaluate(() => ({
    documentCount: document.querySelectorAll('.document').length,
    katexCount: document.querySelectorAll('.katex').length,
    overflowCount: [...document.querySelectorAll('.document')]
      .filter((element) => element.getBoundingClientRect().height > 1015).length,
    actionsVisible: getComputedStyle(document.querySelector('.action-bar')).display !== 'none',
  }));

  if (layout.documentCount !== 10 || layout.katexCount === 0 || layout.overflowCount > 0 || layout.actionsVisible) {
    throw new Error(`${htmlFilename} cannot be printed as one clean page per document: ${JSON.stringify(layout)}.`);
  }

  const pdfPath = join(output, pdfFilename);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
    margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
  });
  await page.close();

  const { stdout: info } = await execFileAsync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  if (pageCount !== 10) {
    throw new Error(`${pdfFilename} has ${pageCount} pages; expected exactly 10.`);
  }

  const { stdout: extractedText } = await execFileAsync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
  if (buttonTexts.some((buttonText) => extractedText.includes(buttonText))) {
    throw new Error(`${pdfFilename} unexpectedly includes a web page control.`);
  }

  const pageTexts = extractedText.split('\f').map((text) => text.trim()).filter(Boolean);
  for (const [index, pageText] of pageTexts.entries()) {
    const number = index + 1;
    if (!new RegExp(`문제\\s*${number}`).test(pageText)) {
      throw new Error(`${pdfFilename} page ${number} does not contain problem ${number}.`);
    }
  }
}
