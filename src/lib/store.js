import { atom, map } from 'nanostores'

export const settings = map({
  debug: false,
  theme: 'dark',
})

export const deviceConnection = atom(null)

export const audioState = map({
  isPlaying: false,
  bpm: 120,
})
