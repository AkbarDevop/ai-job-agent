#!/usr/bin/env node

/**
 * LinkedIn Easy Apply Automation
 *
 * Fills and submits LinkedIn Easy Apply forms using Playwright and a JSON config.
 * Imports cookies from your local Chrome profile to authenticate with LinkedIn.
 *
 * Usage:
 *   node linkedin-easy-apply.js <jobUrl> <configPath>
 *
 * Exit codes:
 *   0 = submitted successfully
 *   1 = crash / unexpected error
 *   2 = blocked on unknown required field
 *   3 = no continue button found
 *   4 = step limit exceeded
 */

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright-core');

const [, , jobUrl, configPath] = process.argv;

if (!jobUrl || !configPath) {
  console.error('Usage: node linkedin-easy-apply.js <jobUrl> <configPath>');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return '';
}

/**
 * Build LinkedIn cookies from the local Chrome cookie store.
 * Requires the `browser_cookie3` Python package:
 *   pip install browser-cookie3
 *
 * Update the cookie_file path to match your OS and Chrome profile.
 */
function buildCookies() {
  const cookiePath = config.chromeCookiePath || process.env.CHROME_COOKIE_PATH || '';
  if (!cookiePath) {
    throw new Error(
      'Set config.chromeCookiePath or CHROME_COOKIE_PATH env var to your Chrome Cookies file.\n' +
      'macOS default: ~/Library/Application Support/Google/Chrome/Default/Cookies\n' +
      'Linux default: ~/.config/google-chrome/Default/Cookies'
    );
  }
  const raw = execFileSync(
    'python3',
    [
      '-c',
      `
import browser_cookie3, json
jar = browser_cookie3.chrome(cookie_file=${JSON.stringify(cookiePath)}, domain_name='linkedin.com')
arr = []
for c in jar:
    arr.append({
        "name": c.name,
        "value": c.value,
        "domain": c.domain,
        "path": c.path,
        "expires": float(c.expires or -1),
        "httpOnly": bool(getattr(c, "_rest", {}).get("HttpOnly", False)),
        "secure": bool(c.secure),
    })
print(json.dumps(arr))
      `,
    ],
    { encoding: 'utf8' }
  );
  return JSON.parse(raw);
}

/**
 * Dropdown auto-answer engine.
 * Matches question text against known patterns and picks the best option.
 * Customize the rules below to match your profile.
 */
function pickOption(questionText, options) {
  const q = normalize(questionText);
  const normalized = options
    .map((opt) => ({ raw: opt, norm: normalize(opt) }))
    .filter((opt) => opt.norm && opt.norm !== 'select an option');

  const exact = (...needles) => {
    for (const needle of needles) {
      const hit = normalized.find((opt) => opt.norm === normalize(needle));
      if (hit) return hit.raw;
    }
    return null;
  };

  const contains = (...needles) => {
    for (const needle of needles) {
      const hit = normalized.find((opt) => opt.norm.includes(normalize(needle)));
      if (hit) return hit.raw;
    }
    return null;
  };

  // --- Email ---
  if (q.includes('email')) {
    return contains(config.email) || normalized[0]?.raw || null;
  }
  // --- Phone country code ---
  if (q.includes('phone country code')) {
    return contains(config.phoneCountryLabel || 'United States (+1)') || normalized[0]?.raw || null;
  }
  // --- Work authorization (future) ---
  if (q.includes('authorized to work') && q.includes('future')) {
    return exact('Yes');
  }
  // --- Data processing consent ---
  if (q.includes('processing of personal data')) {
    return contains('Acknowledge', 'Confirm') || normalized[0]?.raw || null;
  }
  // --- SMS opt-out ---
  if (q.includes('sms') || q.includes('text message')) {
    return exact('No') || contains('No', 'Opt out', 'Do not consent') || normalized[0]?.raw || null;
  }
  // --- Referral source ---
  if (q.includes('how did you hear')) {
    return contains('LinkedIn Jobs', 'LinkedIn');
  }
  // --- Work authorization ---
  if (q.includes('authorized to work') || q.includes('legally authorized')) {
    return exact(config.authorizedToWork || 'Yes');
  }
  // --- Sponsorship (future) ---
  if (q.includes('require sponsorship') && q.includes('future')) {
    return exact(config.requireFutureSponsorship || 'Yes');
  }
  // --- Sponsorship (current) ---
  if (q.includes('require sponsorship')) {
    return exact(config.requireCurrentSponsorship || 'No');
  }
  // --- Degree completed ---
  if (q.includes('bachelor') && q.includes('completed')) {
    return exact(config.degreeCompleted || 'No');
  }
  // --- Engineering level ---
  if ((q.includes('junior') || q.includes('senior')) && q.includes('engineering')) {
    return exact('Yes');
  }
  // --- Background check ---
  if (q.includes('background check')) {
    return exact('Yes');
  }
  // --- Former employee ---
  if (q.includes('previously been employed') || q.includes('previously employed') || q.includes('former employee')) {
    return exact('No');
  }
  // --- On-site ---
  if (q.includes('on-site') || q.includes('onsite')) {
    return exact('Yes');
  }
  // --- Travel ---
  if (q.includes('travel')) {
    return contains('100', 'Yes') || exact('Yes');
  }
  // --- Advanced degree ---
  if ((q.includes('pursuing a master') || q.includes("master's degree") || q.includes('doctoral degree') || q.includes('phd degree')) && !q.includes('degree type')) {
    return exact(config.pursuingAdvancedDegree || 'No');
  }
  // --- Python ---
  if (q.includes('python')) {
    return exact('Yes');
  }
  // --- Location ---
  if (q.includes('location') && !q.includes('race') && !q.includes('ethnicity')) {
    return contains(config.location);
  }
  // --- City ---
  if (q.includes('city') && !q.includes('race') && !q.includes('ethnicity')) {
    return contains(config.city || config.location);
  }
  // --- EEO: Gender ---
  if ((q.includes('gender') || q.includes('sex')) &&
      normalized.some(o => o.norm.includes('male') || o.norm.includes('man') || o.norm.includes('female'))) {
    const g = config.eeoGender || 'Male';
    return exact(g) || contains(g);
  }
  // --- EEO: Race/ethnicity ---
  if ((q.includes('race') || q.includes('ethnicity') || q.includes('ethnic background')) &&
      normalized.some(o => o.norm.includes('asian') || o.norm.includes('white') || o.norm.includes('black') || o.norm.includes('hispanic'))) {
    const r = config.eeoRace || 'Decline to self-identify';
    return exact(r) || contains(r);
  }
  // --- EEO: Veteran ---
  if (q.includes('veteran') &&
      normalized.some(o => o.norm.includes('veteran') || o.norm === 'no' || o.norm === 'yes')) {
    const v = config.eeoVeteran || 'No';
    return exact(v) || contains('I am not', 'Not a', v);
  }
  // --- EEO: Disability ---
  if ((q.includes('disability') || q.includes('cc-305') || q.includes('form cc')) &&
      normalized.some(o => o.norm.includes('disability'))) {
    return normalized.find(o => o.norm.includes("don't have") || o.norm.includes('do not have'))?.raw ||
           contains("No, I Don't Have", "No, I do not") || exact('No');
  }
  // --- Affirmative action / EEO acknowledgment ---
  if (q.includes('affirmative action') || q.includes('equal opportunity') || q.includes('equal employment')) {
    return exact('I understand') || contains('I understand', 'I acknowledge', 'Acknowledge') || normalized[0]?.raw || null;
  }
  // --- Agreement/terms ---
  if (q.includes('agree') || q.includes('privacy policy') || q.includes('terms of service')) {
    return exact('I understand') || contains('I understand', 'I agree', 'Acknowledge') || normalized[0]?.raw || null;
  }
  // --- Placement/source ---
  if (q.includes('make the best possible placement') || q.includes('eoe')) {
    return normalized[0]?.raw || null;
  }
  // --- Graduation date ---
  if (q.includes('graduation date') || q.includes('expected graduation')) {
    const grad = config.expectedGraduation || 'May 2027';
    return exact(grad) || contains(grad) || null;
  }
  // --- Commitment / start date ---
  if (q.includes('commitment') || q.includes('can you begin')) {
    return exact('Yes') || contains('Yes') || normalized[0]?.raw || null;
  }
  // --- How did you hear (fallback) ---
  if (q.includes('how did you hear') || q.includes('how did you find')) {
    return contains('LinkedIn', 'Online', 'Other', 'Job Board', 'Website') || normalized[normalized.length - 1]?.raw || null;
  }
  // --- Degree type ---
  if (q.includes('degree type') || q.includes('degree level')) {
    const deg = config.degreeType || "Bachelor's";
    return exact(deg) || contains('Bachelor') || null;
  }
  // --- GPA range ---
  if (q.includes('gpa') || q.includes('grade point')) {
    const gpaRange = config.gpaRange || '3.0-3.4';
    return exact(gpaRange) || contains(gpaRange.split('-')[0]) || null;
  }
  // --- Generic Yes/No ---
  if (normalized.length === 2 && normalized.every(o => o.norm === 'yes' || o.norm === 'no')) {
    if (q.includes('previously employed') || q.includes('worked for') || q.includes('previously worked') ||
        q.includes('relative') || q.includes('family member') || q.includes('convicted') ||
        q.includes('felony') || q.includes('terminated') || q.includes('fired') ||
        q.includes('ever been') || q.includes('do you know anyone')) {
      return exact('No');
    }
    return exact('Yes');
  }
  return null;
}

function pickChoice(questionText, options) {
  const q = normalize(questionText);
  const normalized = options
    .map((opt) => ({ raw: opt, norm: normalize(opt) }))
    .filter((opt) => opt.norm && opt.norm !== 'select an option');
  if (!normalized.length) return null;

  if (q.includes('office') || q.includes('location')) {
    return normalized[0].raw;
  }
  if (q.includes('gender identity') || q.includes('identify') && q.includes('gender')) {
    const g = (config.eeoGender || '').toLowerCase();
    return normalized.find((opt) => opt.norm.includes('cis-man') || opt.norm === g || opt.norm === 'male' || opt.norm === 'man')?.raw || null;
  }
  if (q.includes('race') || q.includes('ethnicity')) {
    const r = (config.eeoRace || '').toLowerCase();
    return normalized.find((opt) => opt.norm.includes(r))?.raw || null;
  }
  if (q.includes('protected veteran') || q.includes('veteran')) {
    return normalized.find((opt) => opt.norm.includes('not') && opt.norm.includes('veteran'))?.raw ||
           normalized.find((opt) => opt.norm === 'no')?.raw ||
           normalized.find((opt) => opt.norm.includes('i am not'))?.raw || null;
  }
  if (q.includes('disability')) {
    return normalized.find((opt) => (opt.norm.includes('no') || opt.norm.includes("don't")))?.raw || null;
  }
  if (q.includes('top choice')) {
    return null;
  }
  // Major / field of study
  if (q.includes('major') || q.includes('field of study') || q.includes('area of study')) {
    const major = (config.major || 'engineering').toLowerCase();
    return normalized.find((opt) => opt.norm.includes(major))?.raw ||
           normalized.find((opt) => opt.norm.includes('engineering'))?.raw || null;
  }
  // Location preference
  if (q.includes('preferred location') || q.includes('work location') || q.includes('which location')) {
    return normalized.find((opt) => opt.norm.includes('open') || opt.norm.includes('any') || opt.norm.includes('all'))?.raw || normalized[0].raw;
  }

  const yes = normalized.find((opt) => opt.norm === 'yes');
  if (yes) return yes.raw;
  return normalized[0].raw;
}

/**
 * Text field auto-fill engine.
 * Returns the value to fill based on the question text and your config.
 */
function fillTextForQuestion(questionText) {
  const q = normalize(questionText);
  if (q.includes('preferred name') || q.includes('nickname') || q.includes('go by')) return config.preferredName || config.firstName || '';
  if (q.includes('first name')) return config.firstName || '';
  if (q.includes('last name')) return config.lastName || '';
  if (q.includes('phone')) return config.phoneNational || config.phone || '';
  if (q.includes('how many years')) return config.yearsExperience || '0';
  if (q.includes('city') || q.includes('current location') || q === 'location') return config.location || '';
  if (q.includes('website') || q.includes('portfolio')) return config.website || '';
  if (q.includes('linkedin')) return config.linkedin || '';
  if (q.includes('github')) return config.github || '';
  if (q.includes('citizenship')) return config.citizenship || '';
  if (q.includes('zip code') || q.includes('postal code')) return config.postalCode || '';
  if (q.includes('current employer')) return config.currentCompany || '';
  if (q.includes('compensation') || q.includes('salary') || q.includes('pay') || q.includes('expect') && q.includes('paid')) return config.compensation || '';
  if (q.includes('start date') || q.includes('availability') || q.includes('when are you interested in starting') || q.includes('available for hire') || q.includes('date available')) return config.startDate || '';
  if (q.includes('graduation') || q.includes('when is your projected graduation')) return config.expectedGraduation || '';
  if (q.includes('field of study') || q.includes('major')) return config.major || '';
  if (q.includes('status if not') || q.includes('immigration status') || q.includes('visa status')) return config.visaStatus || '';
  if (q.includes('how did you hear') || q.includes('how did you find') || q.includes('who referred') || q.includes('source did you hear')) return 'LinkedIn';
  if (q.includes('project') && (q.includes('interested') || q.includes('enjoyed'))) return config.projectPitch || '';
  if (q.includes('gpa') || q.includes('grade point')) return config.gpa || '';
  if (q.includes('school') || q.includes('university') || q.includes('college')) return config.school || '';
  if (q.includes('address')) return config.address || '';
  if (q.includes('state') || q.includes('province')) return config.state || '';
  if (q.includes('country')) return config.country || 'United States';
  if (q.includes('if yes') || q.includes('please explain') || q.includes('please specify') || q.includes('please provide') || q.includes('please list')) return 'N/A';
  return '';
}

async function getDialog(page) {
  const dialog = page.locator('[role="dialog"]').first();
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
  return dialog;
}

async function getProgress(dialog) {
  return normalize(await dialog.innerText()).slice(0, 200);
}

async function fillStandardInputs(dialog) {
  const report = { filled: [], selected: [], uploaded: [], unknown: [] };

  // Email select
  const emailSelect = dialog.locator('select').filter({ hasText: config.email });
  if (await emailSelect.count()) {
    await emailSelect.first().selectOption({ label: config.email }).catch(() => {});
    report.selected.push(`email:${config.email}`);
  }

  // First name
  const firstName = dialog.locator('input[id*="first"], input[id*="32258"], input[id*="51521"]');
  if (await firstName.count()) {
    await firstName.first().fill(config.firstName || '');
    report.filled.push('first_name');
  }

  // Last name
  const lastName = dialog.locator('input[id*="last"], input[id*="32250"], input[id*="51537"]');
  if (await lastName.count()) {
    await lastName.first().fill(config.lastName || '');
    report.filled.push('last_name');
  }

  // Phone country code
  const phoneCountry = dialog.locator('select[id*="phoneNumber-country"]');
  if (await phoneCountry.count()) {
    await phoneCountry.first().selectOption({ label: config.phoneCountryLabel || 'United States (+1)' }).catch(() => {});
    report.selected.push('phone_country');
  }

  // Phone number
  const phoneNumber = dialog.locator('input[id*="phoneNumber-nationalNumber"]');
  if (await phoneNumber.count()) {
    await phoneNumber.first().fill(config.phoneNational || String(config.phone || '').replace(/\D/g, ''));
    report.filled.push('phone_number');
  }

  // Location inputs
  const locationInputs = dialog.locator('input[id*="location"], input[placeholder*="City"], input[placeholder*="location"]');
  const locationCount = await locationInputs.count();
  for (let i = 0; i < locationCount; i++) {
    const input = locationInputs.nth(i);
    if (!(await input.inputValue())) {
      await input.fill(config.location || '');
      report.filled.push(`location:${i}`);
      await sleep(1000);
      const locationRegex = new RegExp(config.location || 'NOMATCH', 'i');
      const option = dialog.locator('[role="option"]').filter({ hasText: locationRegex }).first();
      if (await option.count()) {
        await option.click().catch(() => {});
      } else {
        await input.press('ArrowDown').catch(() => {});
        await sleep(250);
        await input.press('Enter').catch(() => {});
      }
    }
  }

  // Resume upload
  const fileInputs = dialog.locator('input[type="file"]');
  const fileCount = await fileInputs.count();
  for (let i = 0; i < fileCount; i++) {
    const input = fileInputs.nth(i);
    const id = await input.getAttribute('id');
    if (id && /cover-letter/i.test(id)) continue;
    if (config.resumePath) {
      await input.setInputFiles(config.resumePath);
      report.uploaded.push(id || `file:${i}`);
    }
  }

  // Dropdowns (select elements)
  const selects = dialog.locator('select');
  const selectCount = await selects.count();
  for (let i = 0; i < selectCount; i++) {
    const select = selects.nth(i);
    const value = await select.inputValue().catch(() => '');
    const options = await select.locator('option').evaluateAll((opts) =>
      opts.map((opt) => opt.textContent || '').map((text) => text.trim()).filter(Boolean)
    );
    const selectedText = await select.evaluate((sel) => sel.options[sel.selectedIndex]?.textContent?.trim() || '');
    const needsFill = !value || /select an option/i.test(value) || /select an option/i.test(selectedText) || /^(0|-1)$/.test(value);
    if (needsFill) {
      const containerText = await select.locator('xpath=ancestor::*[self::div or self::fieldset][1]').innerText().catch(() => '');
      const picked = pickOption(containerText, options);
      if (picked) {
        await select.selectOption({ label: picked }).catch(async () => {
          const norm = normalize(picked);
          const option = options.find((opt) => normalize(opt) === norm) || options.find((opt) => normalize(opt).includes(norm));
          if (option) await select.selectOption({ label: option });
        });
        report.selected.push(picked);
      }
    }
  }

  // Textareas
  const textareas = dialog.locator('textarea');
  const textareaCount = await textareas.count();
  for (let i = 0; i < textareaCount; i++) {
    const textarea = textareas.nth(i);
    const val = await textarea.inputValue().catch(() => '');
    if (!val) {
      const containerText = await textarea.locator('xpath=ancestor::*[self::div or self::fieldset][1]').innerText().catch(() => '');
      const fill = fillTextForQuestion(containerText);
      if (fill) {
        await textarea.fill(fill);
        report.filled.push(`textarea:${fill.slice(0, 30)}`);
      }
    }
  }

  // Text inputs
  const textInputs = dialog.locator('input[type="text"], input[type="tel"], input:not([type])');
  const textInputCount = await textInputs.count();
  for (let i = 0; i < textInputCount; i++) {
    const input = textInputs.nth(i);
    const value = await input.inputValue().catch(() => '');
    if (value) continue;
    const containerText = await input.locator('xpath=ancestor::*[self::div or self::fieldset][1]').innerText().catch(() => '');
    const fill = fillTextForQuestion(containerText);
    if (fill) {
      await input.fill(fill);
      report.filled.push(`input:${fill.slice(0, 30)}`);
      if (/location|city/i.test(containerText)) {
        await input.press('ArrowDown').catch(() => {});
        await input.press('Enter').catch(() => {});
      }
    }
  }

  // Fieldsets (checkboxes and radios)
  const fieldsets = dialog.locator('fieldset');
  const fieldsetCount = await fieldsets.count();
  for (let i = 0; i < fieldsetCount; i++) {
    const fieldset = fieldsets.nth(i);
    const questionText = await fieldset.innerText().catch(() => '');
    const checkedCount = await fieldset.locator('input[type="checkbox"]:checked, input[type="radio"]:checked').count();
    if (checkedCount) continue;
    const checkboxes = fieldset.locator('input[type="checkbox"]');
    if (await checkboxes.count()) {
      const labels = await fieldset.locator('label').evaluateAll((els) =>
        els.map((el) => (el.textContent || '').trim()).filter(Boolean)
      );
      const picked = pickChoice(questionText, labels);
      if (picked) {
        const label = fieldset.locator('label').filter({ hasText: picked }).first();
        if (await label.count()) {
          await label.click();
          report.selected.push(`checkbox:${picked}`);
        }
      }
      continue;
    }
    const radios = fieldset.locator('input[type="radio"]');
    if (await radios.count()) {
      const labels = await fieldset.locator('label').evaluateAll((els) =>
        els.map((el) => (el.textContent || '').trim()).filter(Boolean)
      );
      const picked = pickChoice(questionText, labels);
      if (picked) {
        const label = fieldset.locator('label').filter({ hasText: picked }).first();
        if (await label.count()) {
          await label.click();
          report.selected.push(`radio:${picked}`);
        }
      }
    }
  }

  return report;
}

async function findUnknownRequired(dialog) {
  return dialog.evaluate(() => {
    const nodes = [...document.querySelectorAll('input, select, textarea')];
    const required = [];
    for (const node of nodes) {
      const isRequired =
        node.required ||
        node.getAttribute('aria-required') === 'true' ||
        !!node.closest('[data-test-form-element-error-messages]');
      if (!isRequired) continue;
      const tag = node.tagName.toLowerCase();
      const value = tag === 'select' ? node.value : (node.value || '');
      const uncheckedRadio = node.type === 'radio' && !document.querySelector(`input[type="radio"][name="${node.name}"]:checked`);
      const uncheckedCheckbox = node.type === 'checkbox' && !node.checked;
      const missing =
        (tag === 'select' && (!value || /select an option/i.test(value))) ||
        ((node.type === 'text' || node.type === 'tel' || tag === 'textarea') && !value) ||
        uncheckedRadio ||
        uncheckedCheckbox;
      if (!missing) continue;
      const container = node.closest('div, fieldset');
      required.push({
        id: node.id || '',
        type: node.type || tag,
        text: (container?.innerText || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      });
    }

    const fieldsets = [...document.querySelectorAll('fieldset')];
    for (const fieldset of fieldsets) {
      const requiredHint = fieldset.querySelector('[data-test-checkbox-form-required="true"], [data-test-radio-button-form-required="true"], .visually-hidden');
      const text = (fieldset.innerText || '').replace(/\s+/g, ' ').trim();
      if (!/required/i.test(text) && !(requiredHint && /required/i.test(requiredHint.textContent || ''))) continue;
      const checked = fieldset.querySelector('input[type="checkbox"]:checked, input[type="radio"]:checked');
      if (!checked) {
        required.push({
          id: fieldset.id || '',
          type: 'fieldset',
          text: text.slice(0, 300),
        });
      }
    }
    return required;
  });
}

async function clickContinue(dialog) {
  const buttons = [
    dialog.getByRole('button', { name: /continue to next step/i }),
    dialog.getByRole('button', { name: /^next$/i }),
    dialog.getByRole('button', { name: /review your application/i }),
    dialog.getByRole('button', { name: /submit application/i }),
  ];
  for (const locator of buttons) {
    if (await locator.count()) {
      const text = normalize(await locator.first().innerText().catch(() => ''));
      await locator.first().click();
      return text || 'clicked';
    }
  }
  return null;
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext();
  await context.addCookies(buildCookies());
  const page = await context.newPage();

  const directUrl = jobUrl.includes('/apply/') ? jobUrl : `${jobUrl.replace(/\/$/, '')}/apply/?openSDUIApplyFlow=true`;
  await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  const dialog = await getDialog(page);

  for (let step = 1; step <= 12; step++) {
    const stepText = await getProgress(dialog);
    const report = await fillStandardInputs(dialog);
    let unknown = await findUnknownRequired(dialog);

    // Fallback: retry unknown selects/fields by element ID
    if (unknown.length) {
      for (const u of unknown) {
        if (u.type === 'select-one' && u.id) {
          const sel = dialog.locator(`[id="${u.id}"]`);
          const count = await sel.count();
          if (count) {
            const opts = await sel.locator('option').evaluateAll((els) =>
              els.map((el) => el.textContent?.trim() || '').filter(Boolean)
            );
            const picked = pickOption(u.text, opts);
            if (picked) {
              try {
                await sel.selectOption({ label: picked });
              } catch (e1) {
                try { await sel.selectOption(picked); } catch (e2) {
                  console.error(JSON.stringify({ debug: 'select-failed', picked, error: e2.message?.slice(0, 100) }));
                }
              }
              report.selected.push(`fallback:${picked}`);
            }
          } else {
            const pageSel = page.locator(`select[id="${u.id}"]`);
            const pCount = await pageSel.count();
            if (pCount) {
              const opts = await pageSel.locator('option').evaluateAll((els) =>
                els.map((el) => el.textContent?.trim() || '').filter(Boolean)
              );
              const picked = pickOption(u.text, opts);
              if (picked) {
                await pageSel.selectOption({ label: picked }).catch(() => {});
                report.selected.push(`fallback-page:${picked}`);
              }
            }
          }
        } else if ((u.type === 'text' || u.type === 'textarea') && u.id) {
          const field = dialog.locator(`[id="${u.id}"]`);
          if (await field.count()) {
            const fill = fillTextForQuestion(u.text);
            if (fill) {
              await field.fill(fill);
              report.filled.push(`fallback:${fill.slice(0, 30)}`);
            }
          }
        }
      }
      await sleep(500);
      unknown = await findUnknownRequired(dialog);
    }

    console.log(JSON.stringify({ stage: 'step', step, progress: stepText, report, unknown }));
    if (unknown.length) {
      console.error(JSON.stringify({ stage: 'blocked', step, unknown }));
      await browser.close();
      process.exit(2);
    }

    const clicked = await clickContinue(dialog);
    if (!clicked) {
      console.error(JSON.stringify({ stage: 'blocked', step, reason: 'no-continue-button' }));
      await browser.close();
      process.exit(3);
    }

    await page.waitForTimeout(3000);
    const body = normalize(await page.locator('body').innerText().catch(() => ''));
    if (/application submitted|your application was sent|successfully submitted|application sent/.test(body)) {
      console.log(JSON.stringify({ stage: 'submitted', url: page.url(), title: await page.title() }));
      await browser.close();
      return;
    }
  }

  console.error(JSON.stringify({ stage: 'blocked', reason: 'step-limit-exceeded' }));
  await browser.close();
  process.exit(4);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
