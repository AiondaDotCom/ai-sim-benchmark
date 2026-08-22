"""Beat-aware assembly of the score.

Decodes each Suno stem to mono PCM, finds a strong onset near the desired cut
point, snaps to it, and renders one continuous track whose dramaturgy follows
the choreography:  calm tense pulse -> hard drop -> sustained action -> outro.
"""
import array
import json
import math
import subprocess
import sys

SR = 8000
HOP = 80  # 10 ms

DROP_AT = 11.0        # story seconds, must match BEAT.radioLunge
OUTRO_AT = 33.6       # story seconds, must match BEAT.windDown + 0.6
TOTAL = 49.0


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR),
         "-f", "s16le", "-"],
        capture_output=True, check=True).stdout
    a = array.array("h")
    a.frombytes(raw)
    return a


def envelope(pcm):
    env = []
    for i in range(0, len(pcm) - HOP, HOP):
        s = 0
        for k in range(i, i + HOP, 4):
            v = pcm[k]
            s += v * v
        env.append(math.sqrt(s / (HOP / 4)))
    return env


def onset_strength(env):
    return [max(0.0, env[i] - env[i - 1]) for i in range(1, len(env))] + [0.0]


def best_onset(onsets, target_s, window_s=2.5):
    c = int(target_s * 100)
    w = int(window_s * 100)
    lo, hi = max(1, c - w), min(len(onsets) - 1, c + w)
    best, bi = -1, c
    for i in range(lo, hi):
        if onsets[i] > best:
            best, bi = onsets[i], i
    return bi / 100.0


def tempo(onsets, lo_bpm=90, hi_bpm=170):
    lo = int(60.0 / hi_bpm * 100)
    hi = int(60.0 / lo_bpm * 100)
    best, blag = -1, lo
    n = min(len(onsets), 60 * 100)
    for lag in range(lo, hi):
        s = 0.0
        for i in range(lag, n):
            s += onsets[i] * onsets[i - lag]
        if s > best:
            best, blag = s, lag
    return 60.0 / (blag / 100.0), blag / 100.0


report = {}

# --- action stem: find tempo and a clean downbeat to cut in on -------------
act = decode("assets/music/raw/action_0.mp3")
act_on = onset_strength(envelope(act))
bpm, beat = tempo(act_on)
start = best_onset(act_on, 62.0, 3.0)
action_len = OUTRO_AT - DROP_AT
action_len = round(action_len / beat) * beat  # whole number of beats
report["action"] = {"bpm": round(bpm, 2), "beat_s": round(beat, 4),
                    "cut_in_s": round(start, 3), "length_s": round(action_len, 3)}

# --- calm stem: an eleven second bed that ends right on the drop ------------
calm = decode("assets/music/raw/calm_0.mp3")
calm_on = onset_strength(envelope(calm))
calm_start = best_onset(calm_on, 34.0, 4.0)
report["calm"] = {"cut_in_s": round(calm_start, 3), "length_s": DROP_AT}

outro_start = 24.0
outro_len = TOTAL - (DROP_AT + action_len)
report["outro"] = {"cut_in_s": outro_start, "length_s": round(outro_len, 3)}

XF = 1.1  # crossfade into the outro only; the drop itself is a hard cut

cmd = [
    "ffmpeg", "-y", "-v", "error",
    "-ss", f"{calm_start}", "-t", f"{DROP_AT}", "-i", "assets/music/raw/calm_0.mp3",
    "-ss", f"{start}", "-t", f"{action_len + XF}", "-i", "assets/music/raw/action_0.mp3",
    "-ss", f"{outro_start}", "-t", f"{outro_len + XF}", "-i", "assets/music/raw/outro_0.mp3",
    "-filter_complex",
    # calm: gentle fade in, then cut dead on the drop
    "[0:a]afade=t=in:st=0:d=2.0,afade=t=out:st=%.3f:d=0.18,volume=0.85[a];"
    "[1:a]afade=t=in:st=0:d=0.02,volume=1.0[b];"
    "[2:a]volume=0.9[c];"
    "[a][b]concat=n=2:v=0:a=1[ab];"
    "[ab][c]acrossfade=d=%.2f:c1=tri:c2=tri[mix];"
    "[mix]afade=t=out:st=%.2f:d=2.4,alimiter=limit=0.95[out]"
    % (DROP_AT - 0.18, XF, TOTAL - 2.6),
    "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100",
    "assets/music/score.mp3",
]
subprocess.run(cmd, check=True)

dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                      "-of", "csv=p=0", "assets/music/score.mp3"],
                     capture_output=True, text=True).stdout.strip()
report["output"] = {"file": "assets/music/score.mp3", "duration_s": float(dur),
                    "drop_at_s": DROP_AT, "outro_at_s": round(DROP_AT + action_len, 3)}
json.dump(report, open("assets/music/score.json", "w"), indent=2)
print(json.dumps(report, indent=2))
