#!/usr/bin/env python3
"""Transcribe WAV audio to musical note events using Basic Pitch."""

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH


def estimate_tempo(note_events, min_bpm=50, max_bpm=200):
    """Estimate tempo from inter-onset intervals using weighted histogram."""
    if len(note_events) < 4:
        return 120

    starts = sorted([e[0] for e in note_events])
    intervals = []
    for i in range(1, len(starts)):
        d = starts[i] - starts[i - 1]
        if 0.05 < d < 2.0:
            intervals.append(d)

    if not intervals:
        return 120

    best_bpm = 120
    best_score = 0.0

    for bpm in range(min_bpm, max_bpm + 1):
        beat_sec = 60.0 / bpm
        score = 0.0
        for iv in intervals:
            ratio = iv / beat_sec
            nearest = round(ratio)
            if 1 <= nearest <= 8:
                error = abs(ratio - nearest)
                if error < 0.2:
                    score += 1.0 / (1.0 + 10.0 * error)
        if score > best_score:
            best_score = score
            best_bpm = bpm

    return best_bpm


def detect_key(note_events):
    """Detect best matching key signature using Krumhansl-Schmuckler profile.
    Returns: number of sharps (positive) or flats (negative), or 0 for C major.
    """
    if len(note_events) < 10:
        return 0

    pitch_classes = [e[2] % 12 for e in note_events]
    counts = Counter(pitch_classes)
    profile = np.array([counts.get(i, 0) for i in range(12)])

    # Krumhansl-Schmuckler major key profiles (for each pitch class as tonic)
    # Higher values for common pitches (the "tonal hierarchy")
    ks_major_profile = np.array([
        6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
        2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ])

    # Circle of fifths order: C G D A E B F# C# G# D# A# F
    # where # = +1 on sharp count, b = -1 on flat count
    keys_sharps = {
        0: 0,  # C
        7: 1,  # G
        2: 2,  # D
        9: 3,  # A
        4: 4,  # E
        11: 5, # B
        6: 6,  # F#
        8: -5, # Ab (= G# enharmonic)
        3: -4, # Eb
        10: -3, # Bb
        5: -2, # F
    }

    best_key = 0
    best_corr = -999

    for tonic, corr in keys_sharps.items():
        # Rotate KS profile to this key
        rotated = np.roll(ks_major_profile, tonic)
        correlation = np.corrcoef(profile, rotated)[0, 1]
        if correlation > best_corr:
            best_corr = correlation
            best_key = corr

    # Only return detected key if correlation is meaningful
    return best_key if best_corr > 0.3 else 0


def note_events_to_dict(note_events):
    """Convert raw note events to clean dict."""
    notes = []
    for start_time, end_time, pitch, velocity in note_events:
        duration_sec = end_time - start_time
        if duration_sec <= 0.0:
            continue
        notes.append({
            "pitch": int(pitch),
            "startTime": round(float(start_time), 4),
            "duration": round(float(duration_sec), 4),
            "velocity": int(velocity),
        })
    return notes


def transcribe(audio_path):
    """Transcribe audio file to note events with metadata."""
    print(f"Transcribing: {audio_path}", file=sys.stderr)

    if not os.path.exists(audio_path):
        print(f"Error: file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    model_output, midi_data, note_events = predict(audio_path)

    if not note_events:
        print("Warning: no notes detected.", file=sys.stderr)
        return {
            "sourceFile": os.path.basename(audio_path),
            "duration": 0.0,
            "numNotes": 0,
            "tempo": 120,
            "timeSignature": [4, 4],
            "keySignature": 0,
            "notes": [],
        }

    duration = round(max(e[1] for e in note_events), 2)
    tempo = estimate_tempo(note_events)
    key_sig = detect_key(note_events)
    notes = note_events_to_dict(note_events)

    print(f"  Detected {len(notes)} notes, {duration}s audio", file=sys.stderr)
    print(f"  Estimated tempo: {tempo} BPM", file=sys.stderr)
    print(f"  Key signature: {key_sig}", file=sys.stderr)

    return {
        "sourceFile": os.path.basename(audio_path),
        "duration": duration,
        "numNotes": len(notes),
        "tempo": tempo,
        "timeSignature": [4, 4],
        "keySignature": key_sig,
        "notes": notes,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe WAV audio to musical note events"
    )
    parser.add_argument("input", help="Path to WAV audio file")
    parser.add_argument(
        "-o", "--output",
        help="Output JSON path (default: <input>_notes.json)",
    )
    args = parser.parse_args()

    result = transcribe(args.input)

    output_path = args.output or (Path(args.input).stem + "_notes.json")
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Saved to: {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
