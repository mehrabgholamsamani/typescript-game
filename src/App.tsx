import { Pause, Play, RotateCcw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SeedColor = 'rose' | 'lime' | 'sky' | 'gold';
type Orbital = {
  id: number;
  lane: number;
  angle: number;
  speed: number;
  color: SeedColor;
  pulse: number;
};
type Burst = { id: number; x: number; y: number; color: SeedColor; age: number };
type GameState = 'ready' | 'playing' | 'paused' | 'over';

const LANES = [86, 128, 170];
const SEED_COLORS: SeedColor[] = ['rose', 'lime', 'sky', 'gold'];
const COLOR_HEX: Record<SeedColor, string> = {
  rose: '#ff5d8f',
  lime: '#9df45f',
  sky: '#55d6ff',
  gold: '#ffd45a',
};

function randomSeed(id: number, score: number): Orbital {
  return {
    id,
    lane: Math.floor(Math.random() * LANES.length),
    angle: Math.random() * 360,
    speed: 0.32 + Math.random() * 0.34 + Math.min(score / 900, 0.42),
    color: SEED_COLORS[Math.floor(Math.random() * SEED_COLORS.length)],
    pulse: Math.random() * 100,
  };
}

function pointOnOrbit(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: 50 + Math.cos(rad) * radius,
    y: 50 + Math.sin(rad) * radius,
  };
}

export function App() {
  const [state, setState] = useState<GameState>('ready');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [energy, setEnergy] = useState(100);
  const [sound, setSound] = useState(true);
  const [activeColor, setActiveColor] = useState<SeedColor>('rose');
  const [orbitals, setOrbitals] = useState<Orbital[]>(() =>
    Array.from({ length: 8 }, (_, id) => randomSeed(id, 0)),
  );
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(20);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const best = Number(localStorage.getItem('orbit-orchard-best') ?? 0);
  const progress = Math.min(100, Math.round((score / 1800) * 100));

  const playTone = useCallback(
    (frequency: number, duration = 0.08) => {
      if (!sound) return;
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioRef.current ??= new AudioCtor();
      const ctx = audioRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'triangle';
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration);
    },
    [sound],
  );

  const reset = useCallback(() => {
    setScore(0);
    setCombo(0);
    setEnergy(100);
    setActiveColor('rose');
    setBursts([]);
    setOrbitals(Array.from({ length: 8 }, (_, id) => randomSeed(id, 0)));
    nextId.current = 20;
    setState('playing');
  }, []);

  const collect = useCallback(
    (seed: Orbital) => {
      if (state !== 'playing') return;
      const radius = LANES[seed.lane] / 4.2;
      const pos = pointOnOrbit(seed.angle, radius);
      const match = seed.color === activeColor;
      const comboBoost = match ? combo + 1 : 0;
      const scoreGain = match ? 40 + comboBoost * 8 : -25;
      setScore((value) => Math.max(0, value + scoreGain));
      setCombo(comboBoost);
      setEnergy((value) => Math.max(0, Math.min(100, value + (match ? 7 : -16))));
      setBursts((items) => [...items.slice(-14), { id: seed.id, x: pos.x, y: pos.y, color: seed.color, age: 0 }]);
      setOrbitals((items) =>
        items.map((item) => (item.id === seed.id ? randomSeed(nextId.current++, score + Math.max(scoreGain, 0)) : item)),
      );
      playTone(match ? 420 + comboBoost * 26 : 130, match ? 0.09 : 0.16);
    },
    [activeColor, combo, playTone, score, state],
  );

  useEffect(() => {
    if (state !== 'playing') return;
    let animationFrame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(32, now - last);
      last = now;
      setOrbitals((items) =>
        items.map((seed) => ({
          ...seed,
          angle: (seed.angle + seed.speed * delta * 0.075) % 360,
          pulse: seed.pulse + delta,
        })),
      );
      setBursts((items) => items.map((burst) => ({ ...burst, age: burst.age + delta })).filter((burst) => burst.age < 620));
      setEnergy((value) => {
        const next = Math.max(0, value - delta * 0.0045);
        if (next <= 0) setState('over');
        return next;
      });
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [state]);

  useEffect(() => {
    if (state === 'over' && score > best) {
      localStorage.setItem('orbit-orchard-best', String(score));
    }
  }, [best, score, state]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        event.preventDefault();
        setState((value) => (value === 'playing' ? 'paused' : value === 'paused' ? 'playing' : value));
      }
      const index = Number(event.key) - 1;
      if (index >= 0 && index < SEED_COLORS.length) setActiveColor(SEED_COLORS[index]);
      if (event.key.toLowerCase() === 'r') reset();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reset]);

  const statusText = useMemo(() => {
    if (state === 'ready') return 'Tune the comet to a seed color, then harvest matching orbitals before the orchard fades.';
    if (state === 'paused') return 'Paused';
    if (state === 'over') return 'The orchard went dark';
    return combo > 4 ? 'Harmonic streak' : 'Keep the orbit alive';
  }, [combo, state]);

  return (
    <main className="app-shell">
      <section className="game-layout" aria-label="Orbit Orchard game">
        <div className="hud">
          <div>
            <span className="eyebrow">Orbit Orchard</span>
            <h1>Harvest the right starlight.</h1>
          </div>
          <div className="score-strip">
            <div>
              <span>Score</span>
              <strong>{score}</strong>
            </div>
            <div>
              <span>Combo</span>
              <strong>x{combo}</strong>
            </div>
            <div>
              <span>Best</span>
              <strong>{Math.max(best, score)}</strong>
            </div>
          </div>
        </div>

        <div className="stage-wrap">
          <div className={`stage ${state}`} ref={stageRef}>
            <div className="starfield" />
            {LANES.map((_, index) => (
              <div className={`orbit orbit-${index}`} key={index} />
            ))}
            <button
              className={`core core-${activeColor}`}
              type="button"
              aria-label="Start or pause"
              onClick={() => setState((value) => (value === 'playing' ? 'paused' : 'playing'))}
            >
              <Sparkles size={32} />
            </button>

            {orbitals.map((seed) => {
              const radius = LANES[seed.lane] / 4.2;
              const pos = pointOnOrbit(seed.angle, radius);
              const size = 34 + Math.sin(seed.pulse / 130) * 3;
              return (
                <button
                  className={`seed seed-${seed.color}`}
                  key={seed.id}
                  type="button"
                  onClick={() => collect(seed)}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    width: size,
                    height: size,
                  }}
                  aria-label={`Collect ${seed.color} seed`}
                />
              );
            })}

            {bursts.map((burst) => (
              <span
                className={`burst burst-${burst.color}`}
                key={`${burst.id}-${burst.age}`}
                style={{
                  left: `${burst.x}%`,
                  top: `${burst.y}%`,
                  ['--age' as string]: burst.age,
                }}
              />
            ))}

            {state !== 'playing' && (
              <div className="veil">
                <strong>{state === 'over' ? 'Orbit lost' : state === 'paused' ? 'Suspended orbit' : 'Ready to bloom'}</strong>
                <span>{statusText}</span>
                <button type="button" onClick={reset}>
                  <Play size={18} />
                  {state === 'over' ? 'Play again' : 'Start'}
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="control-panel">
          <div className="meter-row">
            <span>Orchard glow</span>
            <strong>{Math.round(energy)}%</strong>
          </div>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${energy}%` }} />
          </div>

          <div className="meter-row">
            <span>Bloom target</span>
            <strong>{progress}%</strong>
          </div>
          <div className="meter bloom" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>

          <div className="palette" aria-label="Color tuner">
            {SEED_COLORS.map((color, index) => (
              <button
                className={`swatch swatch-${color} ${activeColor === color ? 'active' : ''}`}
                key={color}
                type="button"
                onClick={() => setActiveColor(color)}
                title={`Tune to ${color} (${index + 1})`}
                aria-label={`Tune to ${color}`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <div className="actions">
            <button type="button" onClick={() => setState((value) => (value === 'playing' ? 'paused' : 'playing'))}>
              {state === 'playing' ? <Pause size={18} /> : <Play size={18} />}
              {state === 'playing' ? 'Pause' : 'Resume'}
            </button>
            <button type="button" onClick={reset}>
              <RotateCcw size={18} />
              Reset
            </button>
            <button type="button" className="icon-button" onClick={() => setSound((value) => !value)} aria-label="Toggle sound">
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
