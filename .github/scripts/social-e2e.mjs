import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = process.env.TARGET_ORIGIN;
assert.equal(base, 'https://deepsocialbeta-git-test-deepsocial-social-e2e-zunifyllc.vercel.app');
const rand = () => randomBytes(5).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ensurePreviewReachable() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const [health, page] = await Promise.all([
        fetch(base + '/api/auth/ok', { redirect: 'manual' }),
        fetch(base + '/auth', { redirect: 'manual' }),
      ]);
      if (health.status === 200 && page.status === 200) {
        const html = await page.text();
        const assets = [...new Set(
          [...html.matchAll(new RegExp('rel="modulepreload" href="(/assets/[^"]+[.]js)"', 'g'))]
          .map(match => match[1])
        )].slice(0, 20);
        if (assets.length >= 5) {
          const codes = await Promise.all(assets.map(async asset => {
            const r = await fetch(base + asset, { redirect: 'manual' });
            return r.status;
          }));
          if (codes.every(code => code === 200)) {
            console.log('PASS: isolated Preview HTML, JS assets and Auth API accessible');
            return;
          }
        }
      }
    } catch {}
    await sleep(1500);
  }
  throw new Error('Preview browser access not ready; no test users created');
}

const browser = await chromium.launch({ headless: true });
const errors = [];
let A, B;
async function makeUser(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await ctx.newPage();
  page.on('pageerror', err => errors.push(tag + ': ' + err.message.slice(0, 160)));
  const username = ('qa' + tag + rand()).toLowerCase();
  const email = 'deepsocial-social-' + process.env.GITHUB_RUN_ID + '-' + rand() + '@example.com';
  const password = 'Qa9!' + randomBytes(22).toString('base64url');
  await page.goto(base + '/auth', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await page.locator('#username').fill(username);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/home(?:[?#]|$)/, { timeout: 45000 });
  await page.getByTestId('post-composer-textarea').waitFor({ state: 'visible', timeout: 25000 });
  await sleep(1200);
  console.log('PASS: Neon Auth signup and social profile for user ' + tag);
  return { ctx, page, username };
}

async function postText(actor, text) {
  await actor.page.goto(base + '/home', { waitUntil: 'domcontentloaded' });
  const box = actor.page.getByTestId('post-composer-textarea');
  await box.fill(text);
  await actor.page.getByTestId('post-composer-submit').click();
  await actor.page.getByText(text, { exact: true }).first().waitFor({ timeout: 45000 });
  await sleep(1600);
}

function postArticle(page, text) {
  return page.locator('article').filter({ hasText: text }).first();
}

try {
  await ensurePreviewReachable();
  B = await makeUser('b');
  const sharedText = 'Social QA post ' + rand();
  await postText(B, sharedText);
  console.log('PASS: user B published post');

  A = await makeUser('a');
  await A.page.goto(base + '/home', { waitUntil: 'domcontentloaded' });
  await A.page.getByRole('button', { name: 'for you', exact: true }).click();
  await A.page.getByText(sharedText, { exact: true }).first().waitFor({ timeout: 35000 });
  console.log('PASS: public post visible in For You');

  await A.page.goto(base + '/' + B.username, { waitUntil: 'domcontentloaded' });
  await A.page.getByRole('button', { name: 'Follow', exact: true }).click();
  await A.page.getByRole('button', { name: 'Following', exact: true }).waitFor({ timeout: 20000 });
  console.log('PASS: user A followed user B');

  await A.page.goto(base + '/home', { waitUntil: 'domcontentloaded' });
  await A.page.getByRole('button', { name: 'following', exact: true }).click();
  const post = postArticle(A.page, sharedText);
  await post.waitFor({ timeout: 35000 });
  console.log("PASS: followed user post visible in Following feed");

  const like = post.getByTestId('like-button');
  await like.click();
  await A.page.waitForTimeout(900);
  assert.match(await like.locator('svg').getAttribute('class') ?? '', /fill-current/, 'liked heart should be filled');
  console.log('PASS: user A liked user B post');

  const href = await post.locator('a[href^="/post/"]').first().getAttribute('href');
  assert.match(href ?? '', /^\/post\/[0-9a-f-]+$/i, 'post permalink');
  await A.page.goto(base + href, { waitUntil: 'domcontentloaded' });
  const reply = 'Social QA reply ' + rand();
  await A.page.getByTestId('post-composer-textarea').fill(reply);
  await A.page.getByTestId('post-composer-submit').click();
  await A.page.getByText(reply, { exact: true }).first().waitFor({ timeout: 40000 });
  await sleep(1100);
  console.log('PASS: user A replied to post and reply rendered');

  await A.page.goto(base + '/' + B.username, { waitUntil: 'domcontentloaded' });
  await A.page.getByTestId('message-button').click();
  await A.page.waitForURL(/\/messages\/[0-9a-f-]+/, { timeout: 35000 });
  const conversationURL = A.page.url();
  const message = 'Social QA direct message ' + rand();
  await A.page.getByTestId('message-input').fill(message);
  await A.page.getByTestId('message-send').click();
  await A.page.getByTestId('message-bubble').filter({ hasText: message }).first().waitFor({ timeout: 30000 });
  console.log('PASS: A sent direct message to B');

  await B.page.goto(base + '/messages', { waitUntil: 'domcontentloaded' });
  await B.page.getByTestId('conversation-item').filter({ hasText: A.username }).first().waitFor({ timeout: 35000 });
  await B.page.getByTestId('conversation-item').filter({ hasText: A.username }).first().click();
  await B.page.getByTestId('message-bubble').filter({ hasText: message }).first().waitFor({ timeout: 30000 });
  console.log('PASS: B received direct message in private inbox');

  const response = 'Social QA reply DM ' + rand();
  await B.page.getByTestId('message-input').fill(response);
  await B.page.getByTestId('message-send').click();
  await B.page.getByTestId('message-bubble').filter({ hasText: response }).first().waitFor({ timeout: 25000 });
  await A.page.goto(conversationURL, { waitUntil: 'domcontentloaded' });
  await A.page.getByTestId('message-bubble').filter({ hasText: response }).first().waitFor({ timeout: 30000 });
  console.log('PASS: B replied and A received response');

  // OAuth initiation only. This deliberately does not log into any Google account.
  const googlePage = await A.ctx.newPage();
  await googlePage.goto(base + '/auth', { waitUntil: 'domcontentloaded' }).catch(() => {});
  // Already signed-in A will redirect, so Google OAuth initiation is checked
  // separately against Neon provider configuration outside this browser run.
  await googlePage.close();

  if (errors.length) console.log('Browser JS error count:', errors.length);
  console.log('PASS: Two-user feed, follow, like, reply and bidirectional DM Preview E2E');
} catch (err) {
  console.log('FAIL at step:', err instanceof Error ? err.message.slice(0,400) : String(err).slice(0,400));
  if (A?.page) console.log('A URL:', A.page.url().replace(/\?.*/, ''));
  if (B?.page) console.log('B URL:', B.page.url().replace(/\?.*/, ''));
  if (errors.length) console.log('Browser JS errors:', JSON.stringify(errors.slice(-3)));
  throw err;
} finally {
  await browser.close();
}
