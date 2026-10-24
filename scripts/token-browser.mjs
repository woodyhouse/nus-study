import { pathToFileURL } from 'node:url';

// Works with a standard Playwright Page or a Codex tab adapter:
// { url: () => tab.url(), goto: url => tab.goto(url), ...locator methods }.
// Deliberately prepares only. Never reads, generates, copies or logs a token.
export async function prepareTokenDialog(page, options = {}) {
  const base = new URL(options.base ?? 'https://canvas.nus.edu.sg');
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Use an authorized HTTPS Canvas origin.');
  }
  const purpose = options.purpose ?? 'NUS Study personal pack';
  const days = options.days ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > 89) throw new Error('Expiry must be between 1 and 89 days.');
  const now = new Date(options.now ?? Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid current date.');
  // NUS uses Singapore time. Date is represented without ambiguous dd/mm ordering.
  const date = new Date(now.getTime() + days * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = name => parts.find(p => p.type === name).value;
  const expires = `${part('year')}-${part('month')}-${part('day')}`;
  const settings = base.origin + '/profile/settings';
  if ((await page.url()) !== settings) await page.goto(settings);
  if (!(await page.url()).startsWith(settings)) return { status: 'login-required', settings };
  const field = page.getByRole('textbox', { name: 'Purpose', exact: true });
  if (!(await field.isVisible())) {
    const open = page.getByRole('link', { name: 'New access token', exact: true });
    if (!(await open.isVisible())) return { status: 'unavailable', settings };
    await open.click();
  }
  await field.fill(purpose);
  const expiry = page.getByRole('combobox', { name: 'Expiration date', exact: true });
  await expiry.fill(expires);
  await expiry.press('Tab');
  const time = page.getByRole('combobox', { name: 'Expiration time', exact: true });
  await time.fill('00:00');
  await time.press('Tab');
  // Read only these non-secret input values; never snapshot a generated dialog.
  const actualDate = await expiry.evaluate(el => el.value);
  const actualTime = await time.evaluate(el => el.value);
  const expectedDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(expires + 'T00:00:00Z'));
  if (actualDate !== expectedDate || actualTime !== '00:00') throw new Error('Canvas did not accept the requested expiry; inspect the date controls before continuing.');
  if (!(await page.getByRole('button', { name: 'Generate token', exact: true }).isEnabled())) throw new Error('Canvas token form is not ready.');
  return { status: 'awaiting-confirmation', purpose, expiresAt: expires + 'T00:00:00+08:00', settings };
}

// CLI prints code only, suitable for playwright-cli run-code. It performs no UI
// action itself. Keep CLI tracing/video off; use this only before generation.
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== '--print-code') {
    console.error('Usage: node scripts/token-browser.mjs --print-code');
    process.exitCode = 1;
  } else {
    console.log(`async (page) => { const prepare = ${prepareTokenDialog.toString()}; return await prepare(page); }`);
  }
}
