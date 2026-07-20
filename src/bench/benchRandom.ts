/**
 * Deterministic PRNG (mulberry32) for the benchmark generator. Same seed →
 * identical board, so baseline and rewrite runs measure the same scene and
 * regressions are attributable to code, never to dice.
 */
export type BenchRandom = () => number

export function createBenchRandom(seed: number): BenchRandom {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Integer in [min, max] inclusive. */
export function randomInt(random: BenchRandom, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

/** Pick one entry from a non-empty list. */
export function randomPick<T>(random: BenchRandom, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]!
}

/** Pick an index from parallel weights (weights need not sum to 1). */
export function weightedIndex(random: BenchRandom, weights: readonly number[]): number {
  let total = 0
  for (const w of weights) total += w
  let roll = random() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return i
  }
  return weights.length - 1
}
