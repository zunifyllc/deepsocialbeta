import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const base = process.env.DEEPSOCIAL_TEST_BASE || 'https://deepsocialbeta.vercel.app';
const suffix = () => randomBytes(5).toString('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const runId = process.env.GITHUB_RUN_ID || 'manual';
const results = [];
const browserErrors = [];
const browser = await chromium.launch({ headless: true });
const record = (name, result, detail = '') => {
  results.push({ name, result, detail });
  console.log(`${result}: ${name}${detail ? ' — ' + detail : ''}`);
};
async function user(tag) {
  const context = await browser.newContext({ viewport: { width: 1320, height: 860 } });
  const page = await context.newPage();
  page.on('pageerror', e => browserErrors.push(`${tag}: ${e.message.slice(0, 160)}`));
  const username = 'qa' + tag + suffix();
  const email = `deepsocial-qa-${runId}-${suffix()}@example.com`;
  const password = 'Qa9!' + randomBytes(22).toString('base64url');
  await page.goto(base + '/auth', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await page.locator('#username').fill(username);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/home(?:[?#]|$)/, { timeout: 45000 });
  await page.getByTestId('post-composer-textarea').waitFor({ timeout: 25000 });
  record('Signup and authenticated home for user ' + tag, 'PASS');
  return { context, page, username };
}
async function run(name, fn) {
  try {
    await fn();
    record(name, 'PASS');
  } catch (error) {
    record(name, 'FAIL', String(error instanceof Error ? error.message : error).slice(0, 300));
    throw error;
  }
}
let A, B;
try {
  await run('Production preflight', async () => {
    const r = await fetch(base + '/auth', { redirect: 'manual' });
    assert.equal(r.status, 200, 'auth page HTTP status');
  });
  A = await user('a');
  B = await user('b');
  const postText = 'DeepSocial live two-user QA post ' + suffix();
  await run('User A publishes, user B sees post', async () => {
    await A.page.getByTestId('post-composer-textarea').fill(postText);
    await A.page.getByTestId('post-composer-submit').click();
    await A.page.getByText(postText, { exact: true }).first().waitFor({ timeout: 30000 });
    await B.page.goto(base + '/home', { waitUntil: 'domcontentloaded' });
    await B.page.getByRole('button', { name: 'for you', exact: true }).click();
    await B.page.getByText(postText, { exact: true }).first().waitFor({ timeout: 30000 });
  });
  await run('User B follows user A', async () => {
    await B.page.goto(base + '/' + A.username, { waitUntil: 'domcontentloaded' });
    await delay(1300);
    await B.page.getByRole('button', { name: 'Follow', exact: true }).first().click();
    await B.page.getByRole('button', { name: 'Following', exact: true }).first().waitFor({ timeout: 20000 });
  });
  await run('Following feed contains user A post', async () => {
    await B.page.goto(base + '/home', { waitUntil: 'domcontentloaded' });
    await B.page.getByRole('button', { name: 'following', exact: true }).click();
    await B.page.getByText(postText, { exact: true }).first().waitFor({ timeout: 30000 });
  });
  await run('User B likes user A post', async () => {
    const post = B.page.locator('article').filter({ hasText: postText }).first();
    await post.getByTestId('like-button').click();
    await post.getByTestId('like-button').locator('svg.fill-current').waitFor({ timeout: 15000 });
  });
  const replyText = 'DeepSocial QA reply ' + suffix();
  let postUrl = '';
  await run('User B replies to A post', async () => {
    await B.page.locator('article').filter({ hasText: postText }).first().locator('a[href^="/post/"]').first().click();
    await B.page.waitForURL(url => new URL(url).pathname.startsWith('/post/'), { timeout: 20000 });
    postUrl = B.page.url();
    await B.page.getByTestId('post-composer-textarea').fill(replyText);
    await B.page.getByTestId('post-composer-submit').click();
    await B.page.getByText(replyText, { exact: true }).first().waitFor({ timeout: 30000 });
  });
  await run('User A sees notification from B', async () => {
    await A.page.goto(base + '/notifications', { waitUntil: 'domcontentloaded' });
    await A.page.getByText(B.username, { exact: false }).first().waitFor({ timeout: 30000 });
  });
  const messageText = 'DeepSocial two-user DM ' + suffix();
  await run('A sends direct message to B', async () => {
    await A.page.goto(base + '/' + B.username, { waitUntil: 'domcontentloaded' });
    await delay(1400);
    await A.page.getByTestId('message-button').click();
    await A.page.waitForURL(/\/messages\/[0-9a-f-]+/, { timeout: 20000 });
    await A.page.getByTestId('message-input').fill(messageText);
    await A.page.getByTestId('message-send').click();
    await A.page.getByTestId('message-bubble').filter({ hasText: messageText }).waitFor({ timeout: 25000 });
  });
  await run('B receives message in inbox', async () => {
    await B.page.goto(base + '/messages', { waitUntil: 'domcontentloaded' });
    await B.page.getByText(A.username, { exact: false }).first().waitFor({ timeout: 30000 });
    await B.page.getByText(A.username, { exact: false }).first().click();
    await B.page.getByTestId('message-bubble').filter({ hasText: messageText }).waitFor({ timeout: 30000 });
  });

  // Extended regression assertions are made against independent browser sessions.
  await run('B unlikes A post; state persists after reload', async () => {
    await B.page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    const like = B.page.getByTestId('like-button').first();
    await like.locator('svg.fill-current').waitFor({ timeout: 15000 });
    await like.click();
    await B.page.waitForTimeout(800);
    assert.equal(await like.locator('svg.fill-current').count(), 0, 'like must be cleared');
    await B.page.reload({ waitUntil: 'domcontentloaded' });
    const newLike = B.page.getByTestId('like-button').first();
    await newLike.waitFor({ timeout: 20000 });
    await B.page.waitForTimeout(1200);
    assert.equal(await newLike.locator('svg.fill-current').count(), 0, 'unlike must persist');
  });
  await run('B unfollows A; following state persists', async () => {
    await B.page.goto(base + '/' + A.username, { waitUntil: 'domcontentloaded' });
    const following = B.page.getByRole('button', { name: 'Following', exact: true }).first();
    await following.waitFor({ timeout: 20000 });
    await following.click();
    await B.page.getByRole('button', { name: 'Follow', exact: true }).first().waitFor({ timeout: 15000 });
    await B.page.reload({ waitUntil: 'domcontentloaded' });
    await B.page.getByRole('button', { name: 'Follow', exact: true }).first().waitFor({ timeout: 15000 });
  });
  const reverseText = 'DeepSocial reverse two-user DM ' + suffix();
  await run('B sends reply DM and A receives it', async () => {
    await B.page.goto(base + '/messages', { waitUntil: 'domcontentloaded' });
    await B.page.getByText(A.username, { exact: false }).first().waitFor({ timeout: 20000 });
    await B.page.getByText(A.username, { exact: false }).first().click();
    await B.page.getByTestId('message-input').fill(reverseText);
    await B.page.getByTestId('message-send').click();
    await B.page.getByTestId('message-bubble').filter({ hasText: reverseText }).waitFor({ timeout: 20000 });
    await A.page.getByTestId('message-bubble').filter({ hasText: reverseText }).waitFor({ timeout: 25000 });
  });
  await run('Mobile home, profile, messages navigation', async () => {
    await A.page.setViewportSize({ width: 390, height: 844 });
    await A.page.goto(base + '/home', { waitUntil: 'domcontentloaded' });
    const nav = A.page.locator('nav').filter({ has: A.page.getByRole('link', { name: 'Messages', exact: true }) }).last();
    await nav.getByRole('link', { name: 'Profile' }).waitFor({ timeout: 15000 });
    await nav.getByRole('link', { name: 'Messages' }).click();
    await A.page.waitForURL(url => new URL(url).pathname === '/messages', { timeout: 20000 });
    await A.page.getByRole('link', { name: 'Home', exact: true }).last().click();
    await A.page.waitForURL(url => new URL(url).pathname === '/home', { timeout: 20000 });
  });
  await run('B blocks A, A cannot send new DM', async () => {
    await B.page.goto(base + '/' + A.username, { waitUntil: 'domcontentloaded' });
    await B.page.locator('main').getByRole('button', { name: 'More options' }).click();
    await B.page.getByRole('menuitem', { name: 'Block @' + A.username }).click();
    await B.page.getByRole('alertdialog').getByRole('button', { name: 'Block', exact: true }).click();
    await B.page.waitForTimeout(1100);
    await A.page.setViewportSize({ width: 1320, height: 860 });
    await A.page.goto(base + '/messages', { waitUntil: 'domcontentloaded' });
    await A.page.getByText(B.username, { exact: false }).first().waitFor({ timeout: 20000 });
    await A.page.getByText(B.username, { exact: false }).first().click();
    const shouldNotSend = 'Blocked DM must fail ' + suffix();
    await A.page.getByTestId('message-input').fill(shouldNotSend);
    await A.page.getByTestId('message-send').click();
    await A.page.waitForTimeout(2000);
    assert.equal(await A.page.getByTestId('message-bubble').filter({ hasText: shouldNotSend }).count(), 0, 'blocked DM must not persist');
  });
} catch (error) {
  console.error('Two-user test halted:', String(error).slice(0, 400));
  process.exitCode = 1;
} finally {
  console.log('RESULTS ' + JSON.stringify(results));
  console.log('BROWSER_ERRORS ' + JSON.stringify(browserErrors.slice(0, 12)));
  await browser.close();
}
