// Maps a manifest onto Remotion sequences. Scenes stay independent of the timeline.
import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { SCENE_REGISTRY } from './scenes'

export interface SceneSpec { id: string; name: string; startFrame: number; durationInFrames: number; component: string; props: Record<string, unknown>; assets: string[] }
export interface TimelineProps { background: string; scenes: SceneSpec[]; [k: string]: unknown }

export const Timeline: React.FC<TimelineProps> = ({ background, scenes }) => (
  <AbsoluteFill style={{ background }}>
    {scenes.map((scene) => {
      const C = SCENE_REGISTRY[scene.component]
      if (!C) throw new Error(`Unknown scene component "${scene.component}" in scene ${scene.id}`)
      return (
        <Sequence key={scene.id} name={scene.name} from={scene.startFrame} durationInFrames={scene.durationInFrames}>
          <C props={scene.props} />
        </Sequence>
      )
    })}
  </AbsoluteFill>
)
