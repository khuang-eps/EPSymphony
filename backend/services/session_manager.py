# to-do list feature
# manages practice session (start stop etc.)
# write + read storage files

from services.pdf_mapping import generate_linear_positions
from services.audio_analysis import analyze_audio

def create_session(audio_path, sheet_path):
    audio_data = analyze_audio(audio_path)
    measures, tempo = generate_linear_positions(sheet_path)
    measure_positions = generate_linear_positions(measures)
    beat_times = analyze_audio(audio_path)
    measure_times = [m["time_seconds"] for m in measures]

    session_data = {
        "audio_file": audio_path,
        "sheet_file": sheet_path,
        "beat_times": audio_data,
        "measure_times": measure_times,
        "tempo": tempo,
        "measure_positions": measure_positions
    }

    return session_data