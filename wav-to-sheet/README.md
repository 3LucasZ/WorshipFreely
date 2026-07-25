Python → browser pipeline: transcribes a WAV file to note events, then renders as standard sheet music with playback.

Usage

cd wav-to-sheet
pip install -r requirements.txt

# Transcribe the piano stem

python transcribe.py ../separated/htdemucs_6s/Center_Bethel/piano.wav

# Outputs: piano_notes.json

# Then open index.html in your browser and drag piano_notes.json onto it

What you get

- Sheet music rendered on a standard staff (handles chords, rests, ties across measures, accidentals)
- Playback — click play to hear the transcribed notes
- BPM estimation from inter-onset intervals
- Key detection via Krumhansl-Schmuckler profile correlation
- Shows note count, tempo, duration, key, time signature, measure count

Limitations (intentional for POC)

- Quantizes to a 16th-note grid (no swing, no grace notes)
- Voices are merged into chord events per grid tick (no voice separation)
- 4/4 time assumed unless overridden
- Works best on harmonic/pad stems or clear monophonic lines — piano with fast runs will look dense but will be rhythmically accurate
