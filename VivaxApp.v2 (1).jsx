import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Sun, Moon, Upload, Sparkles, Send, RotateCcw, CheckCircle2,
  AlertTriangle, Target, Gauge, Volume2, Crown, FileText,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* VOICE ENGINE: Cartesia first, browser speech as fallback.           */
/* playVoice NEVER rejects and ALWAYS resolves, so the UI can't hang.  */
/* ------------------------------------------------------------------ */
let voiceToken = 0;
let activeAudio = null;
let activeController = null;
let releaseActive = null;

function stopVoice() {
  voiceToken += 1; // invalidates any in-flight playVoice call
  try { if (activeController) activeController.abort(); } catch (e) { console.error(e); }
  try { if (activeAudio) activeAudio.pause(); } catch (e) { console.error(e); }
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
  } catch (e) { console.error(e); }
  activeAudio = null;
  activeController = null;
  if (releaseActive) { const r = releaseActive; releaseActive = null; r(); }
}

function speakFallback(text) {
  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
        resolve();
        return;
      }
      let done = false;
      const finish = () => { if (!done) { done = true; releaseActive = null; resolve(); } };
      releaseActive = finish;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
      setTimeout(finish, 30000); // hard safety net
    } catch (e) {
      console.error('Fallback voice failed:', e);
      resolve();
    }
  });
}

async function playVoice(text) {
  const myToken = ++voiceToken;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  activeController = controller;
  const timer = setTimeout(() => { try { if (controller) controller.abort(); } catch (e) { /* ignore */ } }, 8000);
  try {
    const CARTESIA_API_KEY = 'sk_car_hwPdZ3JLnoRoFKkzKoHZNk';
    const VOICE_ID = 'a0e99841-438c-4a64-b6a9-ae0f17769084';
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: { 'Cartesia-Version': '2024-06-10', 'X-API-Key': CARTESIA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: 'sonic-english', transcript: text, voice: { mode: 'id', id: VOICE_ID }, output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 } }),
      signal: controller ? controller.signal : undefined,
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error('Cartesia request failed with status ' + response.status);
    const audioBlob = await response.blob();
    if (myToken !== voiceToken) return; // a newer question or a stop came first
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    activeAudio = audio;
    await new Promise((resolve, reject) => {
      releaseActive = resolve;
      audio.onended = resolve;
      audio.onerror = () => reject(new Error('Audio playback error'));
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(reject);
    });
    releaseActive = null;
    URL.revokeObjectURL(audioUrl);
  } catch (error) {
    clearTimeout(timer);
    console.error('Cartesia voice failed, switching to browser voice:', error);
    if (myToken !== voiceToken) return;
    await speakFallback(text);
  }
}

/* ------------------------------------------------------------------ */
/* DATA                                                                */
/* ------------------------------------------------------------------ */
const QUESTIONS = [
  'Tell me about yourself and what drives your career.',
  'Describe a difficult project you delivered and what you learned from it.',
  'Where do you see yourself in three years, and how will this role help?',
];

const METRICS = [
  { label: 'Confidence', value: 90 },
  { label: 'Clarity', value: 88 },
  { label: 'Pacing', value: 82 },
  { label: 'Answer structure', value: 79 },
];

const SKILLS = [
  { label: 'Communication', value: 88 },
  { label: 'Problem solving', value: 84 },
  { label: 'Role relevance', value: 86 },
];

const STRENGTHS = [
  'Clear, steady delivery with a confident tone.',
  'Relevant examples tied to the role.',
  'Strong opening that frames your background fast.',
];

const WEAKNESSES = [
  'Answers need measurable results and numbers.',
  'Filler words slow down key points.',
  'The closing answer needs a sharper takeaway.',
];

const GRID_DARK = {
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
};

/* ------------------------------------------------------------------ */
/* ERROR BOUNDARY: a render error can never produce a blank screen     */
/* ------------------------------------------------------------------ */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error('Vivax crashed:', error);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <h1 className="mt-4 text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 max-w-sm text-sm text-slate-400">Vivax hit an unexpected error. Reload to start a fresh session.</p>
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="mt-6 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* APP                                                                 */
/* ------------------------------------------------------------------ */
function VivaxApp() {
  const [appState, setAppState] = useState('setup'); // 'setup' | 'loading' | 'interview' | 'report'
  const [dark, setDark] = useState(true);
  const [pro, setPro] = useState(false);
  const [resumeAttached, setResumeAttached] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [answers, setAnswers] = useState([]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [micError, setMicError] = useState('');

  const recRef = useRef(null);
  const baseRef = useRef('');

  const t = dark
    ? {
        page: 'bg-slate-950 text-slate-100',
        header: 'bg-slate-950/80 border-slate-800',
        card: 'bg-slate-900/70 border-slate-800',
        inner: 'bg-slate-800/60 border-slate-700',
        muted: 'text-slate-400',
        input: 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500',
        track: 'bg-slate-800',
        ring: '#1e293b',
        ghost: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700',
      }
    : {
        page: 'bg-slate-50 text-slate-900',
        header: 'bg-white/80 border-slate-200',
        card: 'bg-white border-slate-200 shadow-sm',
        inner: 'bg-slate-50 border-slate-200',
        muted: 'text-slate-500',
        input: 'bg-white border-slate-300 text-slate-900 placeholder-slate-400',
        track: 'bg-slate-200',
        ring: '#e2e8f0',
        ghost: 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300',
      };

  const primaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400';

  /* ---------- loading: exactly 3 seconds, then FORCE interview ---------- */
  useEffect(() => {
    if (appState !== 'loading') return undefined;
    const id = setTimeout(() => setAppState('interview'), 3000);
    return () => clearTimeout(id);
  }, [appState]);

  /* ---------- speak each question ---------- */
  useEffect(() => {
    if (appState !== 'interview') return undefined;
    let active = true;
    setSpeaking(true);
    playVoice(QUESTIONS[qIndex])
      .catch((e) => console.error(e))
      .then(() => { if (active) setSpeaking(false); });
    return () => { active = false; stopVoice(); };
  }, [appState, qIndex]);

  /* ---------- cleanup on unmount ---------- */
  useEffect(() => () => {
    stopVoice();
    try { if (recRef.current) recRef.current.stop(); } catch (e) { /* ignore */ }
  }, []);

  /* ---------- handlers ---------- */
  const startInterview = () => {
    setQIndex(0);
    setAnswer('');
    setAnswers([]);
    setMicError('');
    setAppState('loading');
  };

  const stopMic = () => {
    try { if (recRef.current) recRef.current.stop(); } catch (e) { /* ignore */ }
    setListening(false);
  };

  const toggleMic = () => {
    const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!SR) {
      setMicError('Voice input is not supported in this browser. Type your answer instead.');
      return;
    }
    if (listening) { stopMic(); return; }
    try {
      stopVoice(); // don't record the interviewer's own voice
      setSpeaking(false);
      const rec = new SR();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      baseRef.current = answer;
      rec.onresult = (e) => {
        let txt = '';
        for (let i = 0; i < e.results.length; i += 1) txt += e.results[i][0].transcript;
        setAnswer((baseRef.current + ' ' + txt).trim());
      };
      rec.onerror = (e) => {
        setMicError(
          e.error === 'not-allowed'
            ? 'Microphone access is blocked. Allow it in your browser, or type your answer.'
            : 'Voice input stopped. You can keep typing your answer.'
        );
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
      setMicError('');
    } catch (err) {
      console.error('Mic start failed:', err);
      setMicError('Could not start the microphone. Type your answer instead.');
      setListening(false);
    }
  };

  const submitAnswer = () => {
    const text = answer.trim() || '(No answer provided)';
    stopMic();
    stopVoice();
    setSpeaking(false);
    setAnswers((prev) => [...prev, text]);
    setAnswer('');
    if (qIndex >= QUESTIONS.length - 1) {
      setAppState('report'); // forced: no API validation, no waiting
    } else {
      setQIndex((i) => i + 1);
    }
  };

  const restart = () => {
    stopVoice();
    setAppState('setup');
    setQIndex(0);
    setAnswer('');
    setAnswers([]);
    setMicError('');
  };

  /* ---------- small pieces ---------- */
  const Bar = ({ value }) => (
    <div className={`h-2.5 w-full overflow-hidden rounded-full ${t.track}`}>
      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-500" style={{ width: `${value}%` }} />
    </div>
  );

  const ScoreRing = ({ value }) => {
    const r = 52;
    const c = 2 * Math.PI * r;
    return (
      <div className="relative mx-auto h-48 w-48">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`Overall score ${value} percent`}>
          <defs>
            <linearGradient id="vx-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r={r} fill="none" stroke={t.ring} strokeWidth="10" />
          <circle
            cx="60" cy="60" r={r} fill="none" stroke="url(#vx-ring)" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-extrabold tracking-tight">{value}%</span>
          <span className={`mt-1 text-xs font-medium ${t.muted}`}>Overall score</span>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /* LOADING SCREEN (pure CSS)                                         */
  /* ================================================================ */
  if (appState === 'loading') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-slate-950 px-6" style={GRID_DARK}>
        <div className="relative flex h-64 w-64 items-center justify-center sm:h-96 sm:w-96">
          <div className="absolute inset-0 rounded-full border-2 border-cyan-400/40 animate-ping motion-reduce:animate-none" />
          <div
            className="absolute inset-3 rounded-full border-4 border-cyan-400 animate-pulse motion-reduce:animate-none"
            style={{ boxShadow: '0 0 60px rgba(34,211,238,0.7), inset 0 0 60px rgba(34,211,238,0.3)' }}
          />
          <div
            className="absolute inset-10 rounded-full border-4 border-purple-500 animate-pulse motion-reduce:animate-none"
            style={{ boxShadow: '0 0 60px rgba(168,85,247,0.7), inset 0 0 60px rgba(168,85,247,0.3)', animationDelay: '0.6s' }}
          />
          <div className="absolute inset-20 rounded-full border-4 border-transparent border-t-cyan-300 border-b-purple-400 animate-spin motion-reduce:animate-none" />
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-cyan-300 to-purple-500" style={{ boxShadow: '0 0 40px rgba(34,211,238,0.9)' }} />
        </div>
        <p className="mt-10 text-center text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Initializing AI Neural Network...
        </p>
        <p className="mt-2 text-center text-sm text-cyan-300 animate-pulse motion-reduce:animate-none">
          Connecting to Cartesia Voice Engine...
        </p>
      </div>
    );
  }

  /* ================================================================ */
  /* MAIN LAYOUT                                                       */
  /* ================================================================ */
  return (
    <div className={`flex min-h-screen flex-col ${t.page}`} style={dark ? GRID_DARK : undefined}>
      <header className={`sticky top-0 z-40 border-b backdrop-blur ${t.header}`}>
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2"><div className="p-2 bg-gradient-to-br from-cyan-400 to-purple-600 rounded-lg"><Mic className="w-6 h-6 text-white" /></div><span className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 tracking-tight">Vivax</span></div>
            {pro && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                <Crown className="h-3 w-3" /> PRO
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${t.ghost}`}
          >
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
        {/* ------------------------- SETUP ------------------------- */}
        {appState === 'setup' && (
          <section className="grid items-center gap-10 lg:grid-cols-2">
            <div className="min-w-0">
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                Practice interviews that talk back.
              </h1>
              <p className={`mt-5 max-w-lg text-base leading-relaxed ${t.muted}`}>
                Vivax asks three focused questions out loud, listens to your answers, and
                gives you a scored report on what to keep and what to sharpen.
              </p>
              <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
                {[
                  { icon: Volume2, text: 'Spoken questions' },
                  { icon: Mic, text: 'Voice answers' },
                  { icon: Target, text: 'Scored report' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className={`flex flex-col items-start gap-2 rounded-xl border p-3 ${t.card}`}>
                    <Icon className="h-5 w-5 text-cyan-400" />
                    <span className="text-sm font-medium">{text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`min-w-0 rounded-2xl border p-6 sm:p-8 ${t.card}`}>
              <h2 className="text-xl font-semibold">Set up your interview</h2>

              <div className={`mt-6 flex items-center justify-between gap-4 rounded-xl border p-4 ${t.inner}`}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Crown className="h-4 w-4 text-purple-400" /> PRO mode
                  </p>
                  <p className={`mt-1 text-xs ${t.muted}`}>Resume upload and deeper report insights.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pro}
                  aria-label="Toggle PRO mode"
                  onClick={() => setPro((p) => !p)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${pro ? 'bg-gradient-to-r from-cyan-500 to-purple-600' : dark ? 'bg-slate-700' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${pro ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              {pro && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setResumeAttached(true)}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${t.ghost}`}
                  >
                    <Upload className="h-4 w-4" /> Upload Resume
                  </button>
                  {resumeAttached && (
                    <p className={`mt-2 flex items-center gap-2 text-xs ${t.muted}`}>
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-all">resume.pdf attached (demo)</span>
                    </p>
                  )}
                </div>
              )}

              <button type="button" onClick={startInterview} className={`${primaryBtn} mt-8 w-full`}>
                <Sparkles className="h-4 w-4" /> Start Interview
              </button>
            </div>
          </section>
        )}

        {/* ----------------------- INTERVIEW ----------------------- */}
        {appState === 'interview' && (
          <section className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium">Question {qIndex + 1} of {QUESTIONS.length}</p>
              <p className={`text-sm ${t.muted}`}>{Math.round((qIndex / QUESTIONS.length) * 100)}% complete</p>
            </div>
            <div className="mt-3"><Bar value={((qIndex + 1) / QUESTIONS.length) * 100} /></div>

            <div className={`mt-6 rounded-2xl border p-6 sm:p-8 ${t.card}`}>
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-purple-600">
                  <Volume2 className={`h-5 w-5 text-white ${speaking ? 'animate-pulse' : ''}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${t.muted}`}>{speaking ? 'Interviewer is speaking' : 'Your turn to answer'}</p>
                  <p className="mt-1 break-words text-xl font-semibold leading-snug">{QUESTIONS[qIndex]}</p>
                </div>
              </div>

              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={6}
                placeholder="Speak with the mic or type your answer here"
                className={`mt-6 w-full resize-none rounded-xl border p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-cyan-400 ${t.input}`}
              />

              {listening && (
                <p className="mt-3 flex items-center gap-2 text-sm text-cyan-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Listening...
                </p>
              )}
              {micError && (
                <p className="mt-3 flex items-start gap-2 text-sm text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span className="min-w-0">{micError}</span>
                </p>
              )}

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${listening ? 'border-red-500 bg-red-500/10 text-red-400' : t.ghost}`}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {listening ? 'Stop recording' : 'Answer with voice'}
                </button>
                <button type="button" onClick={submitAnswer} className={primaryBtn}>
                  <Send className="h-4 w-4" />
                  {qIndex === QUESTIONS.length - 1 ? 'Submit and see report' : 'Submit answer'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ------------------------- REPORT ------------------------ */}
        {appState === 'report' && (
          <section>
            <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Your interview report</h1>
                <p className={`mt-2 text-sm ${t.muted}`}>3 questions answered</p>
              </div>
              <button type="button" onClick={restart} className={`${primaryBtn} w-full sm:w-auto`}>
                <RotateCcw className="h-4 w-4" /> New interview
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className={`min-w-0 rounded-2xl border p-6 ${t.card}`}>
                <ScoreRing value={85} />
                <p className={`mt-4 text-center text-sm ${t.muted}`}>Strong performance with room to sharpen.</p>
              </div>

              <div className={`min-w-0 rounded-2xl border p-6 lg:col-span-2 ${t.card}`}>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Gauge className="h-5 w-5 text-cyan-400" /> Confidence metrics
                </h2>
                <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                  {METRICS.map((m) => (
                    <div key={m.label} className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
                      <span className="min-w-0 text-sm">{m.label}</span>
                      <span className="text-sm font-semibold">{m.value}%</span>
                      <div className="col-span-2"><Bar value={m.value} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className={`min-w-0 rounded-2xl border p-6 ${t.card}`}>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" /> Strengths
                </h2>
                <ul className="mt-4 grid gap-3 text-sm">
                  {STRENGTHS.map((s) => (
                    <li key={s} className={`break-words rounded-xl border p-3 ${t.inner}`}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className={`min-w-0 rounded-2xl border p-6 ${t.card}`}>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <AlertTriangle className="h-5 w-5 text-amber-400" /> Weaknesses
                </h2>
                <ul className="mt-4 grid gap-3 text-sm">
                  {WEAKNESSES.map((s) => (
                    <li key={s} className={`break-words rounded-xl border p-3 ${t.inner}`}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>

            {pro && (
              <div className={`mt-4 min-w-0 rounded-2xl border p-6 ${t.card}`}>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Crown className="h-5 w-5 text-purple-400" /> PRO insights
                </h2>
                <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="grid gap-4">
                    {SKILLS.map((s) => (
                      <div key={s.label} className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
                        <span className="min-w-0 text-sm">{s.label}</span>
                        <span className="text-sm font-semibold">{s.value}%</span>
                        <div className="col-span-2"><Bar value={s.value} /></div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {QUESTIONS.map((q, i) => {
                      const a = answers[i] || '';
                      const words = a === '(No answer provided)' ? 0 : a.split(/\s+/).filter(Boolean).length;
                      return (
                        <div key={q} className={`flex min-w-0 flex-col items-center justify-center rounded-xl border p-3 text-center ${t.inner}`}>
                          <span className="text-2xl font-bold">{words}</span>
                          <span className={`mt-1 text-xs ${t.muted}`}>words in Q{i + 1}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <VivaxApp />
    </ErrorBoundary>
  );
}
