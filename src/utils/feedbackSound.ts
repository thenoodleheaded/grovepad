export function playCompletionTick(): void {
  if (localStorage.getItem('grovepad:sound') !== 'on') return
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(720, context.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.035)
  gain.gain.setValueAtTime(0.035, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.05)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.05)
  oscillator.addEventListener('ended', () => void context.close(), { once: true })
}
