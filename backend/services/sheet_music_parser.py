from music21 import converter

def parse_sheet_with_timing(file_path):
    score = converter.parse(file_path)

    # get tempo
    tempos = score.metronomeMarkBoundaries()
    tempo = tempos[0][2].number if tempos else 120

    seconds_per_beat = 60 / tempo

    measures = []
    seen = set()

    for part in score.parts:
        for measure in part.getElementsByClass("Measure"):
            if measure.number in seen:
                continue
            seen.add(measure.number)
            
            measures.append({
                "measure_number": measure.number,
                "time_seconds": float(measure.offset * seconds_per_beat)
            })
    
    measures.sort(key=lambda m: m["measure_number"])

    return measures, tempo