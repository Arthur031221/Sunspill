import en from '../locales/en.json' with { type: 'json' }
import zhTW from '../locales/zh-TW.json' with { type: 'json' }
import zhCN from '../locales/zh-CN.json' with { type: 'json' }
import ja from '../locales/ja.json' with { type: 'json' }
import ko from '../locales/ko.json' with { type: 'json' }
import es from '../locales/es.json' with { type: 'json' }
import fr from '../locales/fr.json' with { type: 'json' }
import de from '../locales/de.json' with { type: 'json' }
import ptBR from '../locales/pt-BR.json' with { type: 'json' }

export const LOCALES = {
  en: { name: 'English', messages: en },
  'zh-TW': { name: '繁體中文', messages: zhTW },
  'zh-CN': { name: '简体中文', messages: zhCN },
  ja: { name: '日本語', messages: ja },
  ko: { name: '한국어', messages: ko },
  es: { name: 'Español', messages: es },
  fr: { name: 'Français', messages: fr },
  de: { name: 'Deutsch', messages: de },
  'pt-BR': { name: 'Português (Brasil)', messages: ptBR },
}

/** The best supported locale for a list of browser language tags. */
export function pickLocale(tags) {
  for (const tag of tags || []) {
    const lower = String(tag).toLowerCase()
    if (lower.startsWith('zh')) return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN'
    if (lower.startsWith('pt')) return 'pt-BR'
    const base = lower.split('-')[0]
    if (LOCALES[base]) return base
  }
  return 'en'
}

let current = 'en'
const listeners = new Set()

export const locale = () => current
export function setLocale(code) {
  if (!LOCALES[code]) return
  current = code
  document.documentElement.lang = code
  listeners.forEach((fn) => fn(code))
}
export const onLocale = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Look up a message, fill {name} placeholders, fall back to English and then to the key. */
export function t(key, vars) {
  let text = LOCALES[current].messages[key] ?? en[key] ?? key
  if (vars) text = text.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`))
  return text
}
