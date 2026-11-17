'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mic, Square, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CopilotLanguage = 'en' | 'hi';

// ---------- language preference (kept in this browser) ----------

const LANG_KEY = 'omniscope.copilot.language';
const listeners = new Set<() => void>();

function readLanguage(): CopilotLanguage {
  try {
    return localStorage.getItem(LANG_KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

export function setCopilotLanguage(lang: CopilotLanguage) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Private mode or blocked storage: the choice simply lasts for this page.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** The Copilot language; English on the server, the saved choice after hydration. */
export function useCopilotLanguage(): CopilotLanguage {
  return useSyncExternalStore(subscribe, readLanguage, () => 'en');
}

const noSubscribe = () => () => {};

// ---------- speech recognition (voice input) ----------

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Browser speech-to-text (Web Speech API) in Indian English or Hindi. Calls `onInterim` with the
 * words heard so far and `onFinal` once the speaker stops.
 */
export function useVoiceInput(lang: CopilotLanguage, onInterim: (text: string) => void, onFinal: (text: string) => void) {
  const supported = useSyncExternalStore(noSubscribe, () => recognitionCtor() != null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef('');
  const callbacks = useRef({ onInterim, onFinal });
  useEffect(() => {
    callbacks.current = { onInterim, onFinal };
  });

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    rec.current?.abort();
    const r = new Ctor();
    r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    finalText.current = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      callbacks.current.onInterim((finalText.current + interim).trim());
    };
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Microphone permission was denied.' : e.error === 'no-speech' ? 'No speech heard. Try again.' : `Voice input error: ${e.error}`);
    };
    r.onend = () => {
      setListening(false);
      const text = finalText.current.trim();
      if (text) callbacks.current.onFinal(text);
    };
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  }, [lang]);

  const stop = useCallback(() => rec.current?.stop(), []);
  useEffect(() => () => rec.current?.abort(), []);
  return { supported, listening, error, start, stop };
}

export function MicButton({ listening, onStart, onStop, disabled, lang }: { listening: boolean; onStart: () => void; onStop: () => void; disabled?: boolean; lang: CopilotLanguage }) {
  return (
    <button
      type="button"
      onClick={listening ? onStop : onStart}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? 'Stop listening' : lang === 'hi' ? 'Speak your question in Hindi' : 'Speak your question'}
      className={cn(
        'relative flex size-9 items-center justify-center rounded-full transition-colors disabled:opacity-50',
        listening ? 'bg-danger text-white' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {listening && <span className="absolute inset-0 animate-ping rounded-full bg-danger/40" aria-hidden />}
      {listening ? <Square className="relative size-3.5" /> : <Mic className="size-4" />}
    </button>
  );
}

// ---------- text-to-speech (read answers aloud) ----------

/** Markdown to plain speakable text. */
export function speakable(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#`>|~]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function SpeakButton({ text }: { text: string }) {
  const supported = useSyncExternalStore(noSubscribe, () => 'speechSynthesis' in window, () => false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => {
    if (speaking) window.speechSynthesis.cancel();
  }, [speaking]);
  if (!supported || !text) return null;
  const hindi = /[ऀ-ॿ]/.test(text);

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text));
    u.lang = hindi ? 'hi-IN' : 'en-IN';
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(hindi ? 'hi' : 'en-in')) ?? synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(hindi ? 'hi' : 'en'));
    if (voice) u.voice = voice;
    u.rate = hindi ? 0.95 : 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {speaking ? <Square className="size-3" /> : <Volume2 className="size-3.5" />}
      {speaking ? 'Stop' : hindi ? 'सुनें' : 'Listen'}
    </button>
  );
}
