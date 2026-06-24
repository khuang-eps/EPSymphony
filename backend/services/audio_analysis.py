# has bpm; no UI
import librosa
import numpy as np #abbr.
filename = librosa.example("nutcracker")
y, sr = librosa.load(filename)
beat_sums = [] #beat sums gives the length of the song as the last value in the list
total_sum = 0
tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
beat_times = librosa.frames_to_time(beats, sr=sr)
beat_intervals = np.diff(beat_times)
for i in range(len(beat_intervals) - 1):
    total_sum += beat_intervals[i]
    beat_sums.append(float(total_sum))

print("tempo:", tempo)
print("number of beats:", len(beats))
print("beat times:", beat_times)
print("beat intervals:", beat_intervals)

if len(beat_intervals) == 0:
    print("Not enough beats in this file.")
else:
    #split up the big array into smaller ones of six values
    #beat_intervals[i : i+6] for i in range(0, len(beat_intervals), 6) splits beat_intervals up into groups of six, using for loop to set spets of always be 6
    chunks = [beat_intervals[i : i+6].tolist() for i in range(0, len(beat_intervals), 6)]
    print((chunks))

    #find bpm of each chunk
    chunk_bpms = [round(float(np.mean(60 / np.array(chunk))), 2) for chunk in chunks]

    print(chunk_bpms)
