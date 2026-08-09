/* ============================================================
   Topbar chrome: dark mode and the device preview.

   Dark mode writes data-theme="dark" on <html> — the palette swap lives in
   assets/app.css. The first visit follows the operating system; once the
   reader picks a side, that choice is kept and the system stops deciding.

   Device preview loads this same page inside a 390 × 844 iframe so real CSS
   breakpoints apply — a transform-scaled copy would lie about them. The framed
   copy is told it is framed with ?frame=1 and hides the device toggle, so you
   cannot open a phone inside a phone.
   ============================================================ */

import { h } from '../lib/ui.js';

const THEME_KEY = 'cartline.theme.v1';
const THEME_COLOR = { light: '#C24A1C', dark: '#141517' };

/* sun with rays / crescent moon — one glyph each, no emoji */
const SUN_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 2v2M10 16v2M18 10h-2M4 10H2M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4M15.7 15.7l-1.4-1.4M5.7 5.7L4.3 4.3"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.2 12.3A6.8 6.8 0 0 1 7.7 3.8a6.8 6.8 0 1 0 8.5 8.5z"/></svg>';
const DESKTOP_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="15" height="10" rx="1.6"/><path d="M7.5 17h5M10 14v3"/></svg>';
const PHONE_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="2.5" width="8" height="15" rx="2"/><path d="M8.8 4.6h2.4M9.2 15.4h1.6"/></svg>';

/* ---------- theme ---------- */

const readStored = () => {
  try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; }
};
const store = (v) => { try { localStorage.setItem(THEME_KEY, v); } catch (_) {} };

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(theme) {
  const dark = theme === 'dark';
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[dark ? 'dark' : 'light']);
}

/** The bell's neighbour: one button that flips the whole palette. */
export function createThemeButton() {
  let theme = readStored() || 'light';
  const btn = h('button', { class: 'btn btn--ghost btn--icon', type: 'button' });

  const sync = () => {
    applyTheme(theme);
    const dark = theme === 'dark';
    btn.innerHTML = dark ? SUN_ICON : MOON_ICON;
    const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(dark));
  };

  btn.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    store(theme);
    sync();
  });

  /* until the reader chooses, the operating system keeps deciding */
  systemDark.addEventListener('change', (e) => {
    if (readStored()) return;
    theme = e.matches ? 'dark' : 'light';
    sync();
  });

  sync();
  return btn;
}

/* ---------- device preview ---------- */

export const isFramed = () => new URLSearchParams(location.search).get('frame') === '1';

const PHONE_W = 390;
const PHONE_H = 844;
const BEZEL = 13;

/**
 * Two icon buttons in the topbar. Phone mode covers the page with a terracotta
 * surround holding one iframe of this app at exactly 390 × 844.
 * Returns null when this copy is already the framed one.
 */
export function createDeviceSwitch({ appName = 'Cartline' } = {}) {
  if (isFramed()) return null;

  const group = h('div', { class: 'faceswitch devicesw', role: 'group', 'aria-label': 'Preview this app on a phone or on the desktop' });
  const deskBtn = h('button', {
    type: 'button', class: 'is-on', 'aria-pressed': 'true',
    title: 'Desktop view', 'aria-label': 'Desktop view',
    html: `${DESKTOP_ICON}<span>Desktop</span>`,
  });
  const phoneBtn = h('button', {
    type: 'button', 'aria-pressed': 'false',
    title: 'Preview on a phone', 'aria-label': 'Preview on a phone',
    html: `${PHONE_ICON}<span>Phone</span>`,
  });
  group.appendChild(deskBtn);
  group.appendChild(phoneBtn);

  let host = null;
  let scrollLock = '';

  const setPressed = (phone) => {
    phoneBtn.classList.toggle('is-on', phone);
    phoneBtn.setAttribute('aria-pressed', String(phone));
    deskBtn.classList.toggle('is-on', !phone);
    deskBtn.setAttribute('aria-pressed', String(!phone));
  };

  function exit() {
    if (!host) return;
    window.removeEventListener('resize', fit);
    document.removeEventListener('keydown', onKey);
    host.remove();
    host = null;
    document.body.style.overflow = scrollLock;
    setPressed(false);
    phoneBtn.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); exit(); }
  }

  let stage;
  function fit() {
    if (!stage) return;
    const w = PHONE_W + BEZEL * 2;
    const hgt = PHONE_H + BEZEL * 2;
    const k = Math.min(1, (window.innerWidth - 32) / w, (window.innerHeight - 132) / hgt);
    stage.style.transform = k < 1 ? `scale(${k.toFixed(3)})` : 'none';
    stage.parentElement.style.height = `${Math.round(hgt * k)}px`;
    stage.parentElement.style.width = `${Math.round(w * k)}px`;
  }

  function enter() {
    if (host) return;
    /* carry whatever screen you are on into the frame */
    const src = `${location.pathname}?frame=1${location.hash || '#/shop'}`;
    const frame = h('iframe', {
      class: 'phone__screen', src, title: `${appName} at 390 by 844 pixels`,
      width: String(PHONE_W), height: String(PHONE_H),
    });
    stage = h('div', { class: 'phone' },
      h('span', { class: 'phone__speaker', 'aria-hidden': 'true' }),
      frame,
      h('span', { class: 'phone__bar', 'aria-hidden': 'true' }));

    const back = h('button', {
      class: 'btn', type: 'button', onclick: exit,
      html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10H4M8.5 5.5L4 10l4.5 4.5"/></svg><span>Back to desktop</span>',
    });

    host = h('div', { class: 'devicepv', role: 'dialog', 'aria-label': `${appName} phone preview`, 'aria-modal': 'true' },
      h('div', { class: 'devicepv__bar' },
        h('div', { class: 'devicepv__id' },
          h('span', { class: 'devicepv__name' }, appName),
          h('span', { class: 'devicepv__size mono' }, `${PHONE_W} × ${PHONE_H}`)),
        back),
      h('p', { class: 'devicepv__note' }, 'A live copy of the app in a phone-sized frame — the real layout at the real width, not a picture of it. Everything in it works, and it shares this browser\'s data.'),
      h('div', { class: 'devicepv__fit' }, stage));

    document.body.appendChild(host);
    scrollLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('resize', fit);
    document.addEventListener('keydown', onKey);
    fit();
    setPressed(true);
    back.focus();
  }

  phoneBtn.addEventListener('click', enter);
  deskBtn.addEventListener('click', exit);
  return group;
}
