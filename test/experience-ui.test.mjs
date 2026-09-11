import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../public/experience.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../public/experience.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/experience.css', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../public/business-sw.js', import.meta.url), 'utf8');

test('business experience is multilingual, responsive, and directly usable', () => {
  assert.match(html, /<main id="app"/); assert.match(html, /business\.webmanifest/); assert.match(html, /experience-learning\.css/);
  assert.match(script, /Learn before you begin/); assert.match(script, /Aprenda antes de comenzar/); assert.match(script, /Connect with verified providers/); assert.match(script, /countryCode/);
  assert.match(styles, /@media\(max-width:800px\)/); assert.match(styles, /font:1rem/);
});

test('experience renders remote values as text and accepts only web links', () => {
  assert.match(script, /textContent=text/); assert.match(script, /url\.protocol==='https:'/);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|document\.write/);
});

test('offline cache is bounded to the experience shell and read-only API', () => {
  assert.match(serviceWorker, /event\.request\.method!==['"]GET['"]/);
  assert.match(serviceWorker, /\/api\/v1\/experiences\//);
  assert.doesNotMatch(serviceWorker, /operator|reports/);
});
