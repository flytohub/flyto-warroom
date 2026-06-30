/**
 * LocalePicker — Language switcher with search, scroll, and flag icons.
 *
 * Dropdown renders via React Portal to <body> so it's never clipped
 * by parent overflow:hidden (e.g., Fuse toolbar).
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Check } from 'lucide-react'
import { setLocale, getLocaleFlagUrl, t, type Locale } from '@lib/i18n'
import { useLocale, useAvailableLocales } from '@hooks/useLocale'

export function LocalePicker() {
  const currentLocale = useLocale()
  const locales = useAvailableLocales()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Position dropdown relative to trigger
  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    })
  }, [])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (dropdownRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus search + position when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      updatePos()
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, updatePos])

  const filtered = useMemo(() => {
    if (!query.trim()) return locales
    const q = query.toLowerCase().trim()
    return locales.filter(l =>
      l.native.toLowerCase().includes(q) ||
      l.name.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q)
    )
  }, [locales, query])

  const currentInfo = locales.find(l => l.code === currentLocale)

  if (locales.length === 0) return null

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`lp-trigger ${open ? 'lp-trigger--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Language: ${currentInfo?.native ?? currentLocale}`}
      >
        <img
          src={getLocaleFlagUrl(currentLocale)} alt=""
          className="lp-flag"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <ChevronDown size={12} className={`lp-chevron ${open ? 'lp-chevron--open' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="lp-dropdown"
          role="listbox"
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
        >
          <div className="lp-search">
            <Search size={14} className="lp-search-icon" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('common.search') || 'Search...'}
              onClick={e => e.stopPropagation()}
              className="lp-search-input"
            />
          </div>

          <div className="lp-list">
            {filtered.map(l => (
              <button
                key={l.code}
                onClick={() => { void setLocale(l.code as Locale); setOpen(false) }}
                role="option"
                aria-selected={l.code === currentLocale}
                className={`lp-option ${l.code === currentLocale ? 'lp-option--active' : ''}`}
              >
                <img
                  src={getLocaleFlagUrl(l.code)} alt=""
                  className="lp-flag"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <div className="lp-option-text">
                  <span className="lp-option-native">{l.native}</span>
                  {l.name !== l.native && <span className="lp-option-name">{l.name}</span>}
                </div>
                {l.code === currentLocale && <Check size={14} className="lp-check" />}
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="lp-empty">{t('common.noResults') || 'No languages found'}</div>
            )}
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .lp-trigger {
          display: flex; align-items: center; gap: 4px;
          padding: 6px 10px;
          background: var(--mui-palette-action-hover, rgba(0,0,0,0.04));
          border: 1px solid var(--mui-palette-divider, rgba(0,0,0,0.12));
          border-radius: 8px;
          color: var(--mui-palette-text-primary, inherit);
          cursor: pointer; transition: all 0.2s;
        }
        .lp-trigger:hover {
          background: var(--mui-palette-action-selected, rgba(0,0,0,0.08));
          border-color: var(--mui-palette-text-disabled, rgba(0,0,0,0.2));
        }
        .lp-trigger--open {
          background: rgba(139,92,246,0.12);
          border-color: rgba(139,92,246,0.4);
        }

        .lp-flag {
          width: 20px; height: 20px; border-radius: 50%;
          object-fit: cover; flex-shrink: 0;
        }

        .lp-chevron { color: var(--mui-palette-text-secondary, #64748b); transition: transform 0.2s; }
        .lp-chevron--open { transform: rotate(180deg); }

        .lp-dropdown {
          width: 260px;
          background: var(--mui-palette-background-paper, #fff);
          border: 1px solid var(--mui-palette-divider, rgba(0,0,0,0.12));
          border-radius: 12px; overflow: hidden; z-index: 99999;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15);
          animation: lp-in 0.2s ease-out;
        }

        .lp-search {
          position: relative; padding: 10px;
          border-bottom: 1px solid var(--mui-palette-divider, rgba(0,0,0,0.12));
        }
        .lp-search-icon {
          position: absolute; left: 20px; top: 50%;
          transform: translateY(-50%); color: var(--mui-palette-text-secondary, #64748b);
          pointer-events: none; z-index: 1;
        }
        .lp-search-input {
          width: 100%; padding: 8px 10px 8px 32px;
          background: var(--mui-palette-action-hover, rgba(0,0,0,0.04));
          border: 1px solid var(--mui-palette-divider, rgba(0,0,0,0.12));
          border-radius: 8px; color: var(--mui-palette-text-primary, inherit);
          font-size: 13px; outline: none;
        }
        .lp-search-input:focus { border-color: #8b5cf6; }
        .lp-search-input::placeholder { color: var(--mui-palette-text-secondary, #94a3b8); }

        .lp-list { max-height: 280px; overflow-y: auto; padding: 6px; }
        .lp-list::-webkit-scrollbar { width: 6px; }
        .lp-list::-webkit-scrollbar-track { background: transparent; }
        .lp-list::-webkit-scrollbar-thumb { background: var(--mui-palette-divider, rgba(0,0,0,0.12)); border-radius: 3px; }

        .lp-option {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 10px 12px;
          background: transparent; border: none; border-radius: 8px;
          color: var(--mui-palette-text-secondary, inherit);
          font-size: 13px; cursor: pointer; text-align: left; transition: all 0.15s;
        }
        .lp-option:hover { background: var(--mui-palette-action-hover, rgba(0,0,0,0.04)); }
        .lp-option--active {
          background: rgba(139,92,246,0.12);
          color: var(--mui-palette-text-primary, inherit);
        }

        .lp-option-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .lp-option-native { font-weight: 500; color: var(--mui-palette-text-primary, inherit); }
        .lp-option-name { font-size: 12px; color: var(--mui-palette-text-secondary, #64748b); }

        .lp-check { color: #8b5cf6; flex-shrink: 0; }

        .lp-empty { padding: 20px; text-align: center; color: var(--mui-palette-text-secondary, #64748b); font-size: 13px; }

        @keyframes lp-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  )
}
