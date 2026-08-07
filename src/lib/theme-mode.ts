/**
 * Dark or light.
 *
 * Dark stays the default: this is a three-hour evening, usually with one screen
 * shared to a call, and a bright page in that setting is genuinely worse. The
 * point of shipping the other one is that dark becomes a DECISION rather than
 * a reflex — shipping only dark is, per the people who catalogue the signature
 * of generated interfaces, the most common tell there is.
 *
 * Deliberately NOT following `prefers-color-scheme` automatically. Everyone in
 * the room is looking at the same evening; having half the passengers on white
 * because their laptop is in light mode would make the night look inconsistent
 * in screenshots and on a shared screen. It is a choice you make, and it
 * sticks.
 */
const KEY = 'retrobus.theme'

export type ThemeMode = 'dark' | 'light'

export function currentTheme(): ThemeMode {
  return (localStorage.getItem(KEY) as ThemeMode | null) ?? 'dark'
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode
  localStorage.setItem(KEY, mode)
}

/** Called once before React mounts, so there is no flash of the wrong ground. */
export function initTheme() {
  document.documentElement.dataset.theme = currentTheme()
}
