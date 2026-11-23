// Scene components: pure functions of the current frame (no wall clock, no randomness).
import React from 'react'
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

type P = Record<string, unknown>
const s = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const font = 'Inter, "Segoe UI", system-ui, sans-serif'

export const TitleCard: React.FC<{ props: P }> = ({ props }) => {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const accent = s(props.accent, '#5b8cff')
  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.8 } })
  const bar = interpolate(frame, [6, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 0.8, 0.2, 1) })
  const sub = interpolate(frame, [18, 36], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', fontFamily: font, color: '#fff' }}>
      <div style={{ fontSize: width * 0.1, fontWeight: 800, letterSpacing: -2, transform: `scale(${0.8 + 0.2 * pop}) translateY(${(1 - pop) * 60}px)`, opacity: pop, textAlign: 'center', padding: '0 6%' }}>
        {s(props.title, 'Title')}
      </div>
      <div style={{ height: 10, width: width * 0.5 * bar, background: accent, borderRadius: 5, margin: '40px 0' }} />
      <div style={{ fontSize: width * 0.045, opacity: sub, transform: `translateY(${(1 - sub) * 30}px)`, color: '#c9d1e3' }}>{s(props.subtitle, '')}</div>
    </AbsoluteFill>
  )
}

export const KineticText: React.FC<{ props: P }> = ({ props }) => {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const words = s(props.text, 'Kinetic text').split(/\s+/)
  const accent = s(props.accent, '#5b8cff')
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'flex-start', padding: '0 9%', fontFamily: font, flexDirection: 'column' }}>
      {words.map((w, i) => {
        const p = spring({ frame: frame - i * 6, fps, config: { damping: 200 } })
        return (
          <div key={i} style={{ fontSize: width * 0.13, fontWeight: 800, lineHeight: 1.05, color: i === words.length - 1 ? accent : '#fff', opacity: p, transform: `translateX(${(1 - p) * -120}px)` }}>{w}</div>
        )
      })}
    </AbsoluteFill>
  )
}

export const StatReveal: React.FC<{ props: P }> = ({ props }) => {
  const frame = useCurrentFrame()
  const { durationInFrames, width } = useVideoConfig()
  const target = n(props.value, 100)
  const t = interpolate(frame, [0, Math.max(1, durationInFrames * 0.6)], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
  const accent = s(props.accent, '#3ddc97')
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', fontFamily: font, color: '#fff' }}>
      <div style={{ fontSize: width * 0.26, fontWeight: 900, color: accent, fontVariantNumeric: 'tabular-nums' }}>{Math.round(target * t)}{s(props.suffix, '')}</div>
      <div style={{ fontSize: width * 0.05, color: '#c9d1e3', opacity: t }}>{s(props.label, '')}</div>
    </AbsoluteFill>
  )
}

export const Outro: React.FC<{ props: P }> = ({ props }) => {
  const frame = useCurrentFrame()
  const { durationInFrames, width } = useVideoConfig()
  const inO = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })
  const outO = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const r = interpolate(frame, [0, durationInFrames], [0, 1])
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', fontFamily: font, opacity: inO * outO }}>
      <div style={{ width: width * 0.3, height: width * 0.3, borderRadius: '50%', border: `12px solid ${s(props.accent, '#5b8cff')}`, transform: `rotate(${r * 180}deg) scale(${0.9 + r * 0.1})`, borderRightColor: 'transparent' }} />
      <div style={{ marginTop: 60, fontSize: width * 0.06, fontWeight: 700, color: '#fff' }}>{s(props.text, 'The end')}</div>
    </AbsoluteFill>
  )
}

export const SCENE_REGISTRY: Record<string, React.FC<{ props: P }>> = {
  'title-card': TitleCard,
  'kinetic-text': KineticText,
  'stat-reveal': StatReveal,
  outro: Outro,
}
