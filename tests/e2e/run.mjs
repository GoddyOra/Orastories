// End-to-end smoke test, formalizing the flows manually verified during the
// OraCoins rollout (see the session's commit history): sign in, browse and
// claim a free book, and tip an author with OraCoins. Runs against a real
// local dev server and the real (live) Supabase backend in test-mode Stripe
// - not a CI-run test (see package.json / CI workflow comments for why).
//
// Usage:
//   npm run dev                 # in one terminal
//   npm run test:e2e            # in another
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY in .env. Creates and tears down its own throwaway
// test account - never touches real user data.
//
// Deliberately NOT covered here: the live Stripe Checkout coin-purchase
// flow (clicking through Stripe's hosted page). That's UI we don't own and
// it's slow/fragile to automate reliably - the wallet balance needed for
// the tip test below is seeded directly instead, which still exercises the
// real spend_coins_for_tip path end to end. Test the Stripe purchase step
// manually before any release that touches create-coin-checkout or the
// webhook.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.log(`e2e: skipping - missing env var(s): ${missing.join(', ')}`);
  process.exit(0);
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function withRetry(fn, label, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`  (${label} attempt ${i + 1} failed, retrying...)`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
}

async function checkDevServer() {
  try {
    const res = await fetch(BASE);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (error) {
    console.error(`e2e: dev server not reachable at ${BASE} - run \`npm run dev\` first.`);
    process.exit(1);
  }
}

async function createTestUser() {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return { email, password, userId: data.user.id };
}

async function cleanupTestUser(userId) {
  await admin.from('tips').delete().eq('reader_id', userId);
  await admin.from('coin_purchases').delete().eq('buyer_id', userId);
  await admin.from('wallets').delete().eq('user_id', userId);
  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId).catch(() => {});
}

async function getFreeBook() {
  const { data, error } = await admin.from('books').select('id, creator_id').eq('price_cents', 0).limit(1).single();
  if (error) throw error;
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  await checkDevServer();
  const { email, password, userId } = await withRetry(createTestUser, 'create test user');
  const freeBook = await withRetry(getFreeBook, 'find a free book');
  console.log(`e2e: test user ${email}, free book "${freeBook.id}"`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.log('  [page error]', error.message));

  try {
    // --- Sign in ---
    // Waits below poll for the actual next UI state (a real element
    // appearing) rather than a fixed sleep - a fixed 1500ms sleep was
    // intermittently too short under real auth round-trip latency and
    // produced flaky failures unrelated to any real app bug.
    await page.goto(`${BASE}/?openPortal=1`, { waitUntil: 'load' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.locator('button[type="submit"]').first().click();

    const usernameInput = page.locator('input[placeholder*="lowercase letters"]');
    const walletSection = page.locator('text=OraCoins Wallet');
    await Promise.race([
      usernameInput.waitFor({ timeout: 15000 }),
      walletSection.waitFor({ timeout: 15000 })
    ]).catch(() => {});

    if ((await usernameInput.count()) > 0) {
      await usernameInput.fill('e2etest' + Date.now().toString().slice(-6));
      await page.locator('button[type="submit"]').first().click();
      await walletSection.waitFor({ timeout: 15000 });
    }
    assert((await page.locator('text=OraCoins Wallet').count()) > 0, 'sign-in did not reach the account dashboard');
    console.log('  PASS sign in');

    // --- Browse, preview, claim the free book ---
    await page.goto(`${BASE}/books`, { waitUntil: 'load' });
    const claimBtn = page.locator('.claim-btn').first();
    await claimBtn.waitFor({ timeout: 15000 });
    await claimBtn.click();

    const readFullBook = page.locator('text=Read Full Book');
    await readFullBook.waitFor({ timeout: 10000 }).catch(() => {});
    if ((await readFullBook.count()) === 0) {
      console.log('  DEBUG page text snippet:', (await page.locator('body').innerText()).slice(0, 300));
    }
    assert((await readFullBook.count()) > 0, 'claiming the free book did not flip the CTA to "Read Full Book"');
    console.log('  PASS browse -> claim free book');

    // --- Seed a wallet balance directly (see file header for why) and tip ---
    await withRetry(async () => {
      const { error } = await admin.from('wallets').upsert({ user_id: userId, coin_balance: 500 });
      if (error) throw error;
    }, 'seed wallet balance');

    await page.goto(`${BASE}/?book=${freeBook.id}`, { waitUntil: 'load' });
    const tipButton = page.locator('[title="Tip the Author"]');
    await tipButton.waitFor({ timeout: 15000 });
    await tipButton.click();
    const coinPreset = page.locator('button:has-text("100")').first();
    await coinPreset.waitFor({ timeout: 10000 });
    await coinPreset.click();
    await page.locator('button:has-text("Tip with OraCoins")').click();
    await page.locator('text=Tip Sent').waitFor({ timeout: 10000 }).catch(() => {});
    assert((await page.locator('text=Tip Sent').count()) > 0, 'tip submission did not show the success state');

    const { data: tipRow, error: tipError } = await admin
      .from('tips')
      .select('amount_cents, funded_by, held_for_creator, status')
      .eq('reader_id', userId)
      .single();
    if (tipError) throw tipError;
    assert(tipRow.amount_cents === 100, `expected a 100-coin tip, got ${tipRow.amount_cents}`);
    assert(tipRow.funded_by === 'coins', `expected funded_by='coins', got '${tipRow.funded_by}'`);
    assert(tipRow.status === 'succeeded', `expected status='succeeded', got '${tipRow.status}'`);
    console.log('  PASS tip with OraCoins (verified against the database, not just the UI)');

    console.log('e2e: all flows passed');
  } finally {
    await browser.close();
    await cleanupTestUser(userId);
  }
}

main().catch((error) => {
  console.error('e2e failed:', error);
  process.exit(1);
});
