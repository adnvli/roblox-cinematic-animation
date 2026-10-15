// Trailer rhythm planner: sections, shot lengths (lognormal, accelerating), beat-snapped cuts, cards.
import { writeFileSync } from 'fs';

const USAGE = `usage: node trailerplan.mjs --length 60 [--bpm 120] [--offset 0] [--style indie|action|story] [--target youtube|steam|roblox-page]
       [--title "GAME NAME"] [--seed 7] [--out plan.json] [--cine shots.lua]
Plans a trailer edit from measured trailer structure: cold open, intro, escalation (shots shorten), climax,
stopdown + final hit, breath, title, button. Prints a table; --out writes JSON; --cine writes a Cine shot
skeleton (Luau) with durations, roles and suggested sizes/moves to fill in with subjects.`;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) { console.log(USAGE); process.exit(0); }
const opt = (n: string, d?: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const target = opt('--target', 'youtube')!;
const L = Number(opt('--length', target === 'roblox-page' ? '30' : '75'));
const bpm = opt('--bpm') ? Number(opt('--bpm')) : undefined; const offset = Number(opt('--offset', '0'));
const style = opt('--style', 'indie')!; const title = opt('--title', 'TITLE')!;
let seed = Number(opt('--seed', '7'));
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// Section ASLs (seconds per shot) start -> end, by style. Sources: Lieu game-trailer ASLs (Baba Is You 4.25 s,
// Papers Please 2.6 s, MWII 1.3 s), theatrical trailers ~1.9 s (blockbusters ~1.4 s), climax down to ~0.8 s.
const ASL: Record<string, Record<string, [number, number]>> = {
  indie: { cold: [2.2, 2.0], intro: [3.6, 3.0], escalation: [2.8, 1.6], climax: [1.2, 0.8] },
  action: { cold: [1.4, 1.2], intro: [2.2, 1.9], escalation: [1.6, 1.0], climax: [0.8, 0.5] },
  story: { cold: [3.0, 2.6], intro: [4.5, 3.8], escalation: [3.2, 2.0], climax: [1.6, 1.0] },
};
const asl = ASL[style] ?? ASL.indie;
const short = L <= 35;
// Fractions of the content time (before breath/title/button), from Lieu's beats and theatrical act shares.
const tail = { breath: short ? 0 : Math.min(5, 0.06 * L), title: short ? 2.0 : 2.5, button: short ? 0 : Math.min(5, Math.max(3, 0.05 * L)) };
const content = L - tail.breath - tail.title - tail.button;
const sections = short
  ? [{ name: 'hook', frac: 0.15, asl: asl.cold }, { name: 'core loop', frac: 0.45, asl: asl.intro }, { name: 'escalation', frac: 0.4, asl: asl.escalation }]
  : [{ name: 'cold open', frac: 0.08, asl: asl.cold }, { name: 'intro', frac: 0.22, asl: asl.intro }, { name: 'escalation A', frac: 0.2, asl: [asl.escalation[0], (asl.escalation[0] + asl.escalation[1]) / 2] as [number, number] },
     { name: 'escalation B', frac: 0.2, asl: [(asl.escalation[0] + asl.escalation[1]) / 2, asl.escalation[1]] as [number, number] }, { name: 'escalation C', frac: 0.14, asl: [asl.escalation[1], asl.climax[0]] as [number, number] }, { name: 'climax', frac: 0.16, asl: asl.climax }];
const beat = bpm ? 60 / bpm : 0;
const snap = (t: number, strength: number) => {
  if (!beat) return t; const k = (t - offset) / (beat / 2); const s = offset + Math.round(k) * beat / 2;
  return rnd() < strength ? s : t;
};
const SIZES_BY_POS = (u: number, section: string) => {
  if (section.startsWith('cold') || section === 'hook') return u < 0.5 ? 'CU' : 'MS';
  if (section === 'intro' || section === 'core loop') return u < 0.25 ? 'WS' : u < 0.6 ? 'MS' : 'MCU';
  if (section === 'climax') return ['CU', 'WS', 'ECU', 'MS', 'CU'][Math.floor(rnd() * 5)];
  return u < 0.15 ? 'WS' : ['MS', 'MCU', 'CU', 'ECU', 'MS', 'FS'][Math.floor(rnd() * 6)];
};
const MOVES = ['static', 'static', 'static', 'pushIn', 'orbit', 'track', 'crane', 'static'];
type Shot = { start: number; dur: number; section: string; role: string; size?: string; move?: string; note?: string; card?: string };
const shots: Shot[] = [];
let t = 0;
for (const sec of sections) {
  const secLen = sec.frac * content; const end = t + secLen; const s0 = t; let prev = -1;
  if (sec.name.startsWith('escalation') && !short && sec.name !== 'escalation A') {
    const card = { start: t, dur: 1.8, section: sec.name, role: 'card', card: '<BENEFIT, <= 5 WORDS>', note: 'title card resets the energy between escalation blocks (show it right after)' };
    shots.push(card); t += card.dur;
  }
  while (t < end - 0.3) {
    const u = (t - s0) / secLen; const target = sec.asl[0] + (sec.asl[1] - sec.asl[0]) * u;
    const sigma = sec.name === 'climax' ? 0.28 : sec.name.startsWith('cold') || sec.name === 'hook' ? 0.35 : 0.42;
    let d = target * Math.exp(sigma * gauss() - sigma * sigma / 2);
    d = Math.max(0.45, Math.min(2.2 * target, d));
    if (Math.abs(d - prev) < 0.08) d *= 1.25;
    let next = Math.min(end, t + d);
    next = snap(next, sec.name === 'climax' ? 0.85 : 0.6);
    if (next - t < 0.4) next = t + 0.4;
    if (end - next < 0.4) next = end;
    const size = SIZES_BY_POS(u, sec.name);
    const move = sec.name === 'climax' ? (rnd() < 0.3 ? 'pushIn' : 'static') : MOVES[Math.floor(rnd() * MOVES.length)];
    shots.push({ start: t, dur: next - t, section: sec.name, role: 'shot', size, move }); prev = next - t; t = next;
  }
}
// stopdown + final hit at the end of the climax
if (!short && shots.length) {
  const last = shots[shots.length - 1];
  last.note = `stopdown: music drops ~${beat ? beat.toFixed(2) : '0.5'} s (one beat) before the cut, then the final hit lands on the next cut`;
}
if (tail.breath) { shots.push({ start: t, dur: tail.breath, section: 'breath', role: 'shot', size: 'WS', move: 'crane', note: 'breathing room after the peak: one slow wide, music settles' }); t += tail.breath; }
shots.push({ start: t, dur: tail.title, section: 'title', role: 'card', card: title, note: 'title on a downbeat; platforms/date/one call to action' }); t += tail.title;
if (tail.button) { shots.push({ start: t, dur: tail.button, section: 'button', role: 'shot', size: 'MCU', move: 'static', note: 'button: a joke, a reaction or one last action beat after the title' }); t += tail.button; }

const contentShots = shots.filter((s) => s.role === 'shot');
const durs = contentShots.map((s) => s.dur); const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
const sorted = [...durs].sort((a, b) => a - b); const median = sorted[Math.floor(sorted.length / 2)];
const out = { length: Math.round(t * 100) / 100, style, target, bpm, shots: shots.map((s) => ({ ...s, start: Math.round(s.start * 1000) / 1000, dur: Math.round(s.dur * 1000) / 1000 })),
  stats: { shots: contentShots.length, asl: Math.round(mean * 100) / 100, median: Math.round(median * 100) / 100 },
  rules: [
    'Hook: something readable in the first 3-5 s, no logos or slow fades first (Steam: <10 s to make an impression; viewers may watch muted).',
    'Order mechanics simple -> striking; show similar things in threes or fewer, the third different.',
    'Cards: <= 5 words, 1.5-3 s; show what the card claims right after it.',
    'Cut on actions and accents; not every cut on a beat. One stopdown before the final hit; breath after the climax.',
    target === 'roblox-page' ? 'Roblox page video: real gameplay only, no voiceover, no music with lyrics, no misleading enhancement; keep it short.' : 'Record at 60+ fps with UI hidden (Ctrl+Shift+G/C/B/N); capture 3-5x more footage than you use.',
  ] };
console.log(`TRAILER PLAN ${L}s ${style} ${target}${bpm ? ` ${bpm} BPM` : ''}: ${contentShots.length} shots, ASL ${out.stats.asl}s, median ${out.stats.median}s`);
for (const s of out.shots) console.log(`${s.start.toFixed(2).padStart(6)}  ${s.dur.toFixed(2).padStart(5)}s  ${s.section.padEnd(13)} ${s.role === 'card' ? `CARD "${s.card}"` : `${(s.size ?? '').padEnd(4)} ${s.move ?? ''}`}${s.note ? `  - ${s.note}` : ''}`);
for (const r of out.rules) console.log(`* ${r}`);
if (opt('--out')) writeFileSync(opt('--out')!, JSON.stringify(out, null, 1));
if (opt('--cine')) {
  const lua = [`-- Cine shot skeleton from trailerplan (${L}s ${style}). Fill in subjects, framing and events.`, 'return {', `\tname = ${JSON.stringify(title)},`, `\tletterbox = ${target === 'roblox-page' ? 'nil' : '2.39'},`, bpm ? `\tmusic = { id = "rbxassetid://0", bpm = ${bpm}, offset = ${offset}, volume = 0.6 },` : '', '\tgrade = { contrast = 0.12, saturation = -0.05, tint = { 255, 240, 222 }, bloom = { intensity = 0.7, size = 56, threshold = 0.9 } },', '\tshots = {'];
  for (const s of out.shots) {
    if (s.role === 'card') lua.push(`\t\t{ name = ${JSON.stringify(`${s.section} card`)}, dur = ${s.dur}, role = "card", card = { text = ${JSON.stringify(s.card)} }, black = true },`);
    else {
      const mv = s.move === 'pushIn' ? `, to = { size = "${s.size === 'WS' ? 'MS' : 'CU'}" }` : s.move === 'orbit' ? ', orbit = 25' : s.move === 'crane' ? ', crane = 3' : s.move === 'track' ? ', follow = "track"' : '';
      lua.push(`\t\t{ name = ${JSON.stringify(`${s.section} ${s.size}`)}, dur = ${s.dur}, subject = "Workspace.<SUBJECT>", camera = { frame = { size = "${s.size}", yaw = 30, pitch = 0 }${mv} }, noise = "auto", dof = true },${s.note ? ` -- ${s.note}` : ''}`);
    }
  }
  lua.push('\t},', '}');
  writeFileSync(opt('--cine')!, lua.filter((l) => l !== '').join('\n') + '\n');
}
