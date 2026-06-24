def measure_at_time(t, bpm, beats_per_measure):
    return int(t / ((60 / bpm) * beats_per_measure))