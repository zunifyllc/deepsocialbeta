import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const base = 'https://deepsocialbeta-git-test-privacy-scheduled-preview-zunifyllc.vercel.app';
const rand = () => randomBytes(5).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function preflight() {
  for (let i = 0; i < 100; i++) {
    try {
      const [ping, home] = await Promise.all([
        fetch(base + '/api/auth/ok', {redirect:'manual'}),
        fetch(base + '/auth', {redirect:'manual'}),
      ]);
      if (ping.status === 200 && home.status === 200) {
        const html = await home.text();
        const assets = [...new Set([...html.matchAll(new RegExp('rel="modulepreload" href="(/assets/[^"]+[.]js)"','g'))].map(x=>x[1]))].slice(0,18);
        if(assets.length > 4 && (await Promise.all(assets.map(async x => (await fetch(base+x,{redirect:'manual'})).status))).every(x=>x===200)) {
          console.log('PASS: isolated Preview auth + JS modules accessible');return;
        }
      }
    } catch {}
    await sleep(1600);
  }
  throw new Error('Preview inaccessible; no accounts created');
}
const browser = await chromium.launch({headless:true});
const errors=[];
async function signup(tag) {
  const context = await browser.newContext({viewport:{width:1280,height:860}});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(tag+': '+error.message.slice(0,130)));
  const username='qa'+tag+rand();
  const email='security-'+process.env.GITHUB_RUN_ID+'-'+rand()+'@example.com';
  const password='Qa9!'+randomBytes(24).toString('base64url');
  await page.goto(base+'/auth',{waitUntil:'domcontentloaded',timeout:40000});
  await page.getByRole('button',{name:'Sign up',exact:true}).click();
  await page.locator('#username').fill(username);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button',{name:'Create account'}).click();
  await page.waitForURL(/\/home(?:[?#]|$)/,{timeout:35000});
  await page.getByTestId('post-composer-textarea').waitFor({state:'visible',timeout:30000});
  await sleep(1100);
  console.log('PASS: signed in '+tag);
  return {page,context,username};
}

let A,B;
try{
  await preflight();
  A=await signup('a');
  B=await signup('b');
  const liveText='Preview privacy public '+rand();
  await B.page.goto(base+'/home',{waitUntil:'domcontentloaded'});
  await B.page.getByTestId('post-composer-textarea').fill(liveText);
  await B.page.getByTestId('post-composer-submit').click();
  await B.page.getByText(liveText,{exact:true}).first().waitFor({timeout:30000});
  await sleep(1800);
  console.log('PASS: control public post published');

  const scheduledText='Preview privacy scheduled SECRET '+rand();
  await B.page.getByTestId('post-composer-textarea').fill(scheduledText);
  await B.page.getByTestId('composer-schedule-toggle').click();
  const tomorrow=new Date(Date.now()+40*60*1000);
  const pad=n=>String(n).padStart(2,'0');
  const local=[tomorrow.getFullYear(),pad(tomorrow.getMonth()+1),pad(tomorrow.getDate())].join('-')+'T'+pad(tomorrow.getHours())+':'+pad(tomorrow.getMinutes());
  await B.page.getByTestId('composer-schedule-input').fill(local);
  await B.page.getByTestId('post-composer-submit').click();
  await B.page.waitForTimeout(1800);
  await B.page.goto(base+'/scheduled-posts',{waitUntil:'domcontentloaded'});
  await B.page.getByTestId('scheduled-post').filter({hasText:scheduledText}).waitFor({timeout:35000});
  console.log('PASS: author can access own scheduled post');

  await A.page.goto(base+'/home',{waitUntil:'domcontentloaded'});
  await A.page.getByRole('button',{name:'for you',exact:true}).click();
  await A.page.getByText(liveText,{exact:true}).first().waitFor({timeout:30000});
  assert.equal(await A.page.getByText(scheduledText,{exact:true}).count(),0,'scheduled content was visible in public feed');
  console.log('PASS: scheduled post not visible in public feed');

  await A.page.goto(base+'/'+B.username,{waitUntil:'domcontentloaded'});
  await A.page.getByTestId('message-button').click();
  await A.page.waitForURL(/\/messages\/[0-9a-f-]+/,{timeout:30000});
  const chatURL=A.page.url();
  const before='Preview DM before block '+rand();
  await A.page.getByTestId('message-input').fill(before);
  await A.page.getByTestId('message-send').click();
  await A.page.getByTestId('message-bubble').filter({hasText:before}).waitFor({timeout:30000});
  console.log('PASS: DM works before block');

  await B.page.goto(base+'/'+A.username,{waitUntil:'domcontentloaded'});
  await B.page.locator('main').getByRole('button',{name:'More options'}).click();
  await B.page.getByRole('menuitem',{name:'Block @'+A.username}).click();
  await B.page.getByRole('alertdialog').getByRole('button',{name:'Block',exact:true}).click();
  await B.page.getByText('Blocked @'+A.username).waitFor({timeout:30000});
  await sleep(1000);
  console.log('PASS: user B blocked A');

  // Existing DM history remains visible; new messages must be rejected.
  await A.page.goto(chatURL,{waitUntil:'domcontentloaded'});
  const blockedDM='Preview DM must be blocked '+rand();
  await A.page.getByTestId('message-input').fill(blockedDM);
  await A.page.getByTestId('message-send').click();
  await sleep(2300);
  assert.equal(await A.page.getByTestId('message-bubble').filter({hasText:blockedDM}).count(),0,'blocked DM was added to conversation');
  console.log('PASS: blocked user cannot send new message in existing DM');

  // Hard block should remove A's ability to see B's posts when signed in.
  await A.page.goto(base+'/home',{waitUntil:'domcontentloaded'});
  await A.page.getByRole('button',{name:'for you',exact:true}).click();
  await sleep(1000);
  assert.equal(await A.page.getByText(liveText,{exact:true}).count(),0,'blocked author remained visible in feed');
  console.log("PASS: blocked author's post hidden from signed-in feed");
  console.log('PASS: privacy/scheduled E2E complete');
} catch(error){
  console.log('FAIL:',error instanceof Error?error.message.slice(0,350):String(error).slice(0,350));
  if(A)console.log('A pathname:',new URL(A.page.url()).pathname);
  if(B)console.log('B pathname:',new URL(B.page.url()).pathname);
  console.log('Script errors count:',errors.length);
  throw error;
}finally{
  await browser.close();
}
