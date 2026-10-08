import { useSyncExternalStore } from 'react';
import { DICT, PATTERNS, NO_FRAGMENT } from './uz.js';

const KEY = 'rac-lang';
const listeners = new Set();
let lang = localStorage.getItem(KEY) === 'uz' ? 'uz' : 'ru';

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (next === lang) return;
  lang = next;
  localStorage.setItem(KEY, next);
  document.documentElement.lang = next === 'uz' ? 'uz-Latn' : 'ru';
  retranslateAll();
  listeners.forEach((fn) => fn());
}

export function useLang() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, getLang);
}

const CYRILLIC = /[А-Яа-яЁё]/;
const LETTER = 'A-Za-zА-Яа-яЁё';

const fragmentKeys = Object.keys(DICT).filter((k) => k.length > 1 && !NO_FRAGMENT.has(k)).sort((a, b) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FRAGMENTS = new RegExp(`(?<![${LETTER}])(${fragmentKeys.map(escape).join('|')})(?![${LETTER}])`, 'g');

const cache = new Map();

function translateCore(s) {
  if (Object.prototype.hasOwnProperty.call(DICT, s)) return DICT[s];
  const tail = s.match(/^(.*?)([\s.:;,!?…*—]+)$/s);
  if (tail && Object.prototype.hasOwnProperty.call(DICT, tail[1])) return DICT[tail[1]] + tail[2];
  for (const [re, fn] of PATTERNS) {
    const m = s.match(re);
    if (m) return fn(m, translateCore);
  }
  return s.replace(FRAGMENTS, (w) => DICT[w]);
}

export function translate(text) {
  if (lang !== 'uz' || !text || !CYRILLIC.test(text)) return text;
  if (cache.has(text)) return cache.get(text);
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const out = m[1] + translateCore(m[2]) + m[3];
  cache.set(text, out);
  return out;
}

const originals = new WeakMap();
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);

function handleText(node) {
  const parent = node.parentNode;
  if (!parent || SKIP.has(parent.nodeName) || parent.closest?.('[data-no-translate]')) return;
  const saved = originals.get(node);
  if (saved && node.nodeValue === saved.shown) {
    if (lang === 'ru' && saved.shown !== saved.orig) setText(node, saved.orig, saved.orig);
    else if (lang === 'uz') setText(node, saved.orig, translate(saved.orig));
    return;
  }
  setText(node, node.nodeValue, translate(node.nodeValue));
}

function setText(node, orig, shown) {
  originals.set(node, { orig, shown });
  if (node.nodeValue !== shown) node.nodeValue = shown;
}

function handleAttrs(el) {
  for (const attr of ATTRS) {
    if (!el.hasAttribute(attr)) continue;
    const key = `__ru_${attr}`;
    const value = el.getAttribute(attr);
    if (el[key] === undefined || value !== el[`${key}_shown`]) el[key] = value;
    const shown = translate(el[key]);
    el[`${key}_shown`] = shown;
    if (value !== shown) el.setAttribute(attr, shown);
  }
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) return handleText(root);
  if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has(root.nodeName) || root.closest('[data-no-translate]')) return;
  handleAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = it.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) handleText(n);
    else handleAttrs(n);
    n = it.nextNode();
  }
}

function retranslateAll() {
  walk(document.body);
  document.title = translate(document.title);
}

let observer;

export function startTranslator() {
  document.documentElement.lang = lang === 'uz' ? 'uz-Latn' : 'ru';
  observer = new MutationObserver((mutations) => {
    if (lang !== 'uz') return;
    for (const m of mutations) {
      if (m.type === 'characterData') handleText(m.target);
      else if (m.type === 'attributes') handleAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS,
  });
  walk(document.body);

  const { alert, confirm, prompt } = window;
  window.alert = (msg) => alert.call(window, translate(String(msg ?? '')));
  window.confirm = (msg) => confirm.call(window, translate(String(msg ?? '')));
  window.prompt = (msg, def) => prompt.call(window, translate(String(msg ?? '')), def);
}
