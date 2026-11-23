// Client entry: registers the sidebar row and the main panel.
import React from 'react'
import { Panel } from './Panel'

const PANEL_ID = 'video-direction'

function Icon({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="13" height="14" rx="2.5" />
      <path d="M16 10.5 21 7.5v9l-5-3" />
      <path d="M8 9.5v5l4-2.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function MainPanel() {
  return <div style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}><Panel /></div>
}

type Ctx = {
  slots: {
    inject(key: string, cb: () => unknown): () => void
    register(options: Record<string, unknown>, component: unknown): unknown
  }
}

export const inject = ['slots']
export function apply(ctx: Ctx) {
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: 'Video Direction' }, Icon))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, MainPanel))
}
