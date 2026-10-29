import { Leaf, Cross, Capsule, Ring, Swoosh } from '../landing/Shapes';

// The Suwela palette used by the public pages' cards, one gradient + wash +
// emblem shape per tone. Kept apart from Cards.tsx so Fast Refresh can
// hot-swap the components.

export type Tone = 'green' | 'blue' | 'purple' | 'orange' | 'deep';

export const TONES: Record<Tone, { from: string; to: string; wash: string; Shape: typeof Leaf }> = {
  green:  { from: '#5EDDB0', to: '#13A58F', wash: '#EAFBF4', Shape: Leaf },
  blue:   { from: '#5CC6FF', to: '#1598E9', wash: '#EAF6FF', Shape: Cross },
  purple: { from: '#A68BF0', to: '#6A4DB6', wash: '#F3EEFF', Shape: Capsule },
  orange: { from: '#FFB36B', to: '#EF7B2D', wash: '#FFF4EA', Shape: Ring },
  deep:   { from: '#31B0F7', to: '#0279D1', wash: '#E8F3FC', Shape: Swoosh },
};

// Cycles through the palette so a list of cards never repeats a colour side by side.
export const TONE_CYCLE: Tone[] = ['green', 'blue', 'purple', 'orange', 'deep'];
