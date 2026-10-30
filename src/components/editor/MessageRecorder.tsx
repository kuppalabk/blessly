'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/components/api';
import { useT } from '@/components/I18n';

export type Recording = { id: string; url: string; kind: 'audio' | 'video'; durationSec: number };
const MAX_SECONDS = 120;

function pickType(kind: 'audio' | 'video') {
  const options = kind === 'audio' ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'] : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return options.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
}

/** Record a voice or video message (up to 2 minutes) that plays on the wish page. */
export function MessageRecorder({ value, onChange }: { value: Recording | null; onChange: (r: Recording | null) => void }) {
  const { t: tr } = useT();
  const [kind, setKind] = useState<'audio' | 'video'>('audio');
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'uploading'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<{ b: Blob; url: string; duration: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const stopTracks = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => () => { stopTracks(); if (timer.current) clearInterval(timer.current); }, []);
  useEffect(() => () => { if (blob) URL.revokeObjectURL(blob.url); }, [blob]);

  async function start() {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: true } : { audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } });
    } catch {
      setError(kind === 'audio' ? tr("Allow the microphone to record a voice message.") : tr("Allow the camera and microphone to record a video."));
      return;
    }
    if (kind === 'video' && live.current) { live.current.srcObject = stream.current; void live.current.play().catch(() => undefined); }
    const type = pickType(kind);
    const r = new MediaRecorder(stream.current, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 64_000, ...(kind === 'video' ? { videoBitsPerSecond: 900_000 } : {}) });
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stopTracks();
      if (timer.current) clearInterval(timer.current);
      const duration = Math.max(1, Math.round((Date.now() - started.current) / 1000));
      const b = new Blob(chunks, { type: (r.mimeType || type || (kind === 'audio' ? 'audio/webm' : 'video/webm')).split(';')[0] });
      setBlob({ b, url: URL.createObjectURL(b), duration });
      setState('review');
    };
    rec.current = r;
    started.current = Date.now();
    setSeconds(0);
    r.start(1000);
    setState('recording');
    timer.current = setInterval(() => {
      const s = Math.round((Date.now() - started.current) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS && r.state === 'recording') r.stop();
    }, 250);
  }

  async function upload() {
    if (!blob) return;
    setState('uploading'); setError(null);
    try {
      const form = new FormData();
      const kindType = blob.b.type.startsWith('video/') && kind === 'audio' ? blob.b.type.replace('video/', 'audio/') : blob.b.type;
      form.append('media', new File([blob.b], `message.${kindType.includes('mp4') ? 'mp4' : 'webm'}`, { type: kindType }));
      form.append('duration', String(blob.duration));
      const res = await fetch('/api/recordings', { method: 'POST', body: form, credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, json.error ?? tr('Upload failed'));
      onChange(json.recording as Recording);
      setBlob(null); setState('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Upload failed")); setState('review');
    }
  }

  if (!supported) return <p className="muted small">{tr("Recording isn’t available in this browser.")}</p>;

  if (value) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        {value.kind === 'video' ? <video src={value.url} controls playsInline style={{ width: '100%', maxWidth: 360, borderRadius: 12 }} /> : <audio src={value.url} controls style={{ width: '100%' }} />}
        <div className="row-wrap"><span className="muted small">{value.kind === 'video' ? tr("Video message · {time}", { time: fmt(value.durationSec) }) : tr("Voice message · {time}", { time: fmt(value.durationSec) })}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>{tr("Remove")}</button></div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {state === 'idle' && (
        <div className="row-wrap" role="group" aria-label={tr("Message type")}>
          <button type="button" className="chip" aria-pressed={kind === 'audio'} onClick={() => setKind('audio')}>{tr("Voice")}</button>
          <button type="button" className="chip" aria-pressed={kind === 'video'} onClick={() => setKind('video')}>{tr("Video")}</button>
        </div>
      )}
      {kind === 'video' && state === 'recording' && <video ref={live} muted playsInline style={{ width: '100%', maxWidth: 360, borderRadius: 12, transform: 'scaleX(-1)' }} />}
      {kind === 'video' && state !== 'recording' && <video ref={live} hidden muted playsInline />}
      {state === 'review' && blob && (kind === 'video' ? <video src={blob.url} controls playsInline style={{ width: '100%', maxWidth: 360, borderRadius: 12 }} /> : <audio src={blob.url} controls style={{ width: '100%' }} />)}
      <div className="row-wrap">
        {state === 'idle' && <button type="button" className="btn btn-ghost btn-sm" onClick={start}>{kind === 'audio' ? tr("● Record voice message") : tr("● Record video message")}</button>}
        {state === 'recording' && <><button type="button" className="btn btn-danger btn-sm" onClick={() => rec.current?.stop()}>{tr("■ Stop")}</button><span role="timer" aria-live="off" className="muted small">{fmt(seconds)} / 2:00</span></>}
        {(state === 'review' || state === 'uploading') && <>
          <button type="button" className="btn btn-sm" onClick={upload} disabled={state === 'uploading'}>{state === 'uploading' ? tr("Saving…") : tr("Use this message")}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={state === 'uploading'} onClick={() => { setBlob(null); setState('idle'); }}>{tr("Record again")}</button>
        </>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
