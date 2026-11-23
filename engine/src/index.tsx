// Remotion entry: one composition whose metadata comes from the project manifest (inputProps).
import React from 'react'
import { Composition, registerRoot } from 'remotion'
import { Timeline, type TimelineProps } from './Timeline'

interface Input extends TimelineProps { width: number; height: number; fps: number; durationInFrames: number }

const Root: React.FC = () => (
  <Composition
    id="VideoDirection"
    component={Timeline as React.FC<Record<string, unknown>>}
    width={1080} height={1920} fps={30} durationInFrames={300}
    defaultProps={{ background: '#0b0d12', scenes: [] } as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const p = props as unknown as Input
      return { width: p.width ?? 1080, height: p.height ?? 1920, fps: p.fps ?? 30, durationInFrames: p.durationInFrames ?? 300 }
    }}
  />
)

registerRoot(Root)
