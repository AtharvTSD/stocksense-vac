'use client';
import { useSyncExternalStore } from 'react';
type Theme = 'dark' | 'light';
let memory: Theme = 'dark';
function current(): Theme {
  try { const value = window.localStorage.getItem('stocksense-theme'); return value === 'light' || value === 'dark' ? value : memory; } catch { return memory; }
}
function subscribe(notify: () => void) {
  window.addEventListener('stocksense-theme', notify); window.addEventListener('storage', notify);
  return () => { window.removeEventListener('stocksense-theme', notify); window.removeEventListener('storage', notify); };
}
export function useTheme() { return useSyncExternalStore(subscribe, current, (): Theme => 'dark'); }
export function setTheme(value: Theme) {
  memory = value;
  try { window.localStorage.setItem('stocksense-theme', value); } catch { /* Theme remains available in memory. */ }
  window.dispatchEvent(new window.Event('stocksense-theme'));
}
