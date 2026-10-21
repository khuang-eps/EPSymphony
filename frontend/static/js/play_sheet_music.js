let notes = [];
let bpm = 120;
const DEFAULT_SCORE = "../static/music/MozartPianoSonata.mxl";
const FALLBACK_SCORE = "../static/music/sample.musicxml";

function getIterator(cursor) {
    return cursor.Iterator || cursor.iterator;
}

function isIteratorDone(iterator) {
    return Boolean(iterator.EndReached || iterator.endReached);
}

function fractionValue(frac) {
    if (!frac) return 0;
    if (typeof frac.RealValue === "number") return frac.RealValue;
    if (typeof frac.realValue === "number") return frac.realValue;
    return 0;
}

function extractNotesFromOsmd(score) {
    const parsedNotes = [];
    if (!score?.cursor) return parsedNotes;

    if (typeof score.enableOrDisableCursors === "function") {
        score.enableOrDisableCursors(true);
    }
    score.cursor.show();
    score.cursor.reset();

    const iterator = getIterator(score.cursor);
    if (!iterator) return parsedNotes;

    let steps = 0;
    const maxSteps = 100000;

    while (!isIteratorDone(iterator) && steps < maxSteps) {
        const timeBeats = fractionValue(iterator.currentTimeStamp || iterator.CurrentTimeStamp) * 4;
        const measureIndex = iterator.CurrentMeasureIndex ?? iterator.currentMeasureIndex ?? 0;
        const sourceMeasures = score.Sheet?.SourceMeasures || [];
        const measureNumber = sourceMeasures[measureIndex]?.MeasureNumber ?? (measureIndex + 1);
        const voices = iterator.CurrentVoiceEntries || iterator.currentVoiceEntries || [];

        voices.forEach(voice => {
            (voice.Notes || voice.notes || []).forEach(note => {
                const isRest = note?.isRestFlag
                    || note?.IsRestFlag
                    || (typeof note?.isRest === "function" && note.isRest());
                if (!note || isRest || note.IsGraceNote || note.halfTone == null || note.halfTone === 0) {
                    return;
                }

                const lengthFrac = note.Length || note.length;
                    parsedNotes.push({
                        pitch: Tone.Frequency(note.halfTone + 12, "midi").toNote(),
                        time: timeBeats,
                        duration: lengthFrac ? fractionValue(lengthFrac) * 4 : 1,
                        measure: Number(measureNumber)
                    });
            });
        });

        if (typeof iterator.moveToNext === "function") {
            iterator.moveToNext();
        } else if (typeof iterator.MoveToNext === "function") {
            iterator.MoveToNext();
        } else {
            break;
        }
        steps += 1;
    }

    score.cursor.reset();
    return parsedNotes;
}

function readBpmFromScore(score) {
    const firstMeasure = score?.Sheet?.SourceMeasures?.[0];
    const tempo = firstMeasure?.TempoInBPM;
    if (tempo) {
        bpm = tempo;
        const bpmInput = document.getElementById("bpmInput");
        if (bpmInput) bpmInput.value = tempo;
    }
}

function prepareCursor(score) {
    if (typeof score.enableOrDisableCursors === "function") {
        score.enableOrDisableCursors(true);
    }
    score.cursor.show();
    score.cursor.reset();
}

async function loadScoreFromSource(source) {
    const container = document.getElementById("score-container");
    if (!container) {
        console.error("Missing #score-container");
        return;
    }

    container.innerHTML = "";
    window.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
        autoResize: false,
        backend: "svg",
        pageFormat: "Endless",
        pageBackgroundColor: "#FFFFFF",
        drawingParameters: "compacttight",
        drawTitle: false
    });
    window.osmd.FollowCursor = false;
    window.osmd.zoom = 1;

    await window.osmd.load(source);
    if (typeof sizeOsmdPageToContainer === "function") {
        sizeOsmdPageToContainer();
    }
    window.osmd.render();

    readBpmFromScore(window.osmd);
    notes = extractNotesFromOsmd(window.osmd);
    prepareCursor(window.osmd);

    if (typeof initScorePages === "function") {
        initScorePages();
    }

    if (typeof getMeasuresByPage === "function" && window.osmd.GraphicSheet) {
        console.log("Measures by page:", getMeasuresByPage());
    }

    console.log("Loaded notes:", notes);
}

async function loadScore() {
    try {
        await loadScoreFromSource(DEFAULT_SCORE);
    } catch (error) {
        console.warn("Default Mozart score not found, loading sample instead.", error);
        await loadScoreFromSource(FALLBACK_SCORE);
    }
}

function readPlaybackBpm() {
    const bpmInput = document.getElementById("bpmInput");
    const value = Number(bpmInput?.value);
    if (value > 0) bpm = value;
    return bpm;
}

function stopPlayback() {
    if (typeof Tone === "undefined") return;
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.seconds = 0;
    isPlaybackActive = false;
    if (window.osmd?.cursor) window.osmd.cursor.reset();
    if (typeof updatePageChrome === "function") {
        updatePageChrome();
    }
}

async function startPlayback() {
    console.log("Play button clicked");
    const score = window.osmd;

    if (!score) {
        console.error("OSMD is not ready");
        return;
    }

    await Tone.start();
    stopPlayback();

    if (notes.length === 0) {
        notes = extractNotesFromOsmd(score);
        console.log("Loaded notes:", notes);
    }

    if (notes.length === 0) {
        console.error("No playable notes found");
        return;
    }

    prepareCursor(score);
    followPlaybackPage = true;
    isPlaybackActive = true;
    if (typeof showScorePage === "function") {
        showScorePage(getPageForMeasure(notes[0].measure) || 1);
    }
    if (typeof updatePageChrome === "function") {
        updatePageChrome();
    }

    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    const secondsPerBeat = 60 / readPlaybackBpm();
    const cursorTimes = [...new Set(notes.map(note => note.time))].sort((a, b) => a - b);

    notes.forEach(note => {
        Tone.Transport.schedule(time => {
            synth.triggerAttackRelease(
                note.pitch,
                note.duration * secondsPerBeat,
                time
            );
        }, note.time * secondsPerBeat);
    });

    cursorTimes.forEach((entryTime, index) => {
        Tone.Transport.schedule(() => {
            const current = notes.find(note => note.time === entryTime);
            if (!current) return;

            document.getElementById("measureDisplay").textContent =
                "Current Measure: " + current.measure;

            if (isPlaybackActive && typeof showScorePage === "function") {
                const page = getPageForMeasure(current.measure);
                if (page && page !== currentScorePage) {
                    showScorePage(page);
                }
            }

            if (index === 0) score.cursor.reset();
            else score.cursor.next();
        }, entryTime * secondsPerBeat);
    });

    if (typeof lastPlaybackTimeByPage === "function") {
        lastPlaybackTimeByPage(notes).forEach((endBeats, page) => {
            if (page >= getScorePageCount()) return;
            Tone.Transport.schedule(() => {
                if (isPlaybackActive && currentScorePage === page) {
                    showScorePage(page + 1);
                }
            }, endBeats * secondsPerBeat);
        });
    }

    const lastEnd = Math.max(...notes.map(note => note.time + note.duration));
    Tone.Transport.schedule(() => {
        isPlaybackActive = false;
        if (typeof updatePageChrome === "function") {
            updatePageChrome();
        }
    }, lastEnd * secondsPerBeat);

    Tone.Transport.start();
}

loadScore();
