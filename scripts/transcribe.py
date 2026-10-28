#!/usr/bin/env python3
"""Transcrição local (faster-whisper, sem serviço pago). Uso: transcribe.py <audio-ou-video> [prompt] > JSON
Saída: {"duration": s, "words": [{"w": "texto", "s": início, "e": fim}]}"""
import json, os, subprocess, sys
import numpy as np
from faster_whisper import WhisperModel

FFMPEG = os.environ.get("FFMPEG") or os.path.expanduser("~/.local/opt/ffmpeg/ffmpeg")
# Decodifica com o ffmpeg (a decodificação via PyAV do faster-whisper quebra com av 19 no Python 3.14).
raw = subprocess.run([FFMPEG, "-v", "error", "-i", sys.argv[1], "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], check=True, capture_output=True).stdout
audio = np.frombuffer(raw, dtype=np.float32)

model_dir = os.environ.get("WHISPER_MODEL_DIR", os.path.expanduser("~/.local/opt/whisper-models"))
model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="cpu", compute_type="int8", download_root=model_dir)
segs, info = model.transcribe(audio, language="pt", word_timestamps=True, vad_filter=True,
                              initial_prompt=sys.argv[2] if len(sys.argv) > 2 else None, condition_on_previous_text=False)
words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for s in segs for w in (s.words or []) if w.word.strip()]
json.dump({"duration": round(len(audio) / 16000, 3), "words": words}, sys.stdout, ensure_ascii=False)
