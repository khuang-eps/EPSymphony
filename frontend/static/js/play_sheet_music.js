let notes = [];
let bpm = 120;
let cursorStartIndex = 0;
let cursorStartTime = 0;
let cursorStartMeasure = 1;
let playbackSynth = null;
let playbackMuted = false;
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
    if (!score?.cursor) return;
    if (typeof score.enableOrDisableCursors === "function") {
        score.enableOrDisableCursors(true);
    }
    score.cursor.show();
    score.cursor.reset();
}

function getCursorTimeBeats(score) {
    const iterator = getIterator(score?.cursor);
    if (!iterator) return 0;
    return fractionValue(iterator.currentTimeStamp || iterator.CurrentTimeStamp) * 4;
}

function resetCursorStart() {
    cursorStartIndex = 0;
    cursorStartTime = 0;
    cursorStartMeasure = notes[0]?.measure || 1;
    if (typeof setPlaceCursorMode === "function") {
        setPlaceCursorMode(false);
    }
}

function seekCursorToTime(targetBeats) {
    const score = window.osmd;
    if (!score?.cursor) return;
    prepareCursor(score);
    if (targetBeats <= 1e-6) return;

    const iterator = getIterator(score.cursor);
    let steps = 0;
    while (!isIteratorDone(iterator) && steps < 100000) {
        if (getCursorTimeBeats(score) >= targetBeats - 1e-4) break;
        if (typeof score.cursor.next !== "function") break;
        score.cursor.next();
        steps += 1;
    }
}

function seekCursorToStart() {
    seekCursorToTime(cursorStartTime);
}

function graphicalNoteElement(gNote) {
    if (!gNote) return null;
    try {
        if (typeof gNote.getSVGGElement === "function") {
            const el = gNote.getSVGGElement();
            if (el) return el;
        }
    } catch (error) {
        return null;
    }
    return gNote.vfnote?.attrs?.el || null;
}

function collectCursorHitTargets() {
    const score = window.osmd;
    const targets = [];
    if (!score?.cursor) return targets;

    prepareCursor(score);
    const iterator = getIterator(score.cursor);
    if (!iterator) {
        seekCursorToStart();
        return targets;
    }

    let lastTime = null;
    let uniqueIndex = -1;
    let steps = 0;

    while (!isIteratorDone(iterator) && steps < 100000) {
        const timeBeats = getCursorTimeBeats(score);
        const measureIndex = iterator.CurrentMeasureIndex ?? iterator.currentMeasureIndex ?? 0;
        const sourceMeasures = score.Sheet?.SourceMeasures || [];
        const measureNumber = Number(sourceMeasures[measureIndex]?.MeasureNumber ?? (measureIndex + 1));
        const voices = iterator.CurrentVoiceEntries || iterator.currentVoiceEntries || [];
        let hasPlayable = false;

        voices.forEach(voice => {
            (voice.Notes || voice.notes || []).forEach(note => {
                const isRest = note?.isRestFlag
                    || note?.IsRestFlag
                    || (typeof note?.isRest === "function" && note.isRest());
                if (note && !isRest && !note.IsGraceNote && note.halfTone) {
                    hasPlayable = true;
                }
            });
        });

        const gNotes = typeof score.cursor.GNotesUnderCursor === "function"
            ? (score.cursor.GNotesUnderCursor() || [])
            : [];
        const rects = [];
        gNotes.forEach(gNote => {
            const el = graphicalNoteElement(gNote);
            if (!el || typeof el.getBoundingClientRect !== "function") return;
            const box = el.getBoundingClientRect();
            if (box.width > 0 && box.height > 0) {
                rects.push({
                    left: box.left,
                    right: box.right,
                    top: box.top,
                    bottom: box.bottom
                });
            }
        });

        if (hasPlayable) {
            if (lastTime === null || Math.abs(timeBeats - lastTime) > 1e-6) {
                uniqueIndex += 1;
                lastTime = timeBeats;
                targets.push({
                    index: uniqueIndex,
                    time: timeBeats,
                    measure: measureNumber,
                    rects
                });
            } else if (targets.length) {
                targets[targets.length - 1].rects.push(...rects);
            }
        }

        if (typeof score.cursor.next !== "function") break;
        score.cursor.next();
        steps += 1;
    }

    seekCursorToStart();
    return targets;
}

function setPlaceCursorMode(on) {
    if (isPlaybackActive && on) return;
    isPlacingCursor = Boolean(on);
    document.body.classList.toggle("is-placing-cursor", isPlacingCursor);
    if (typeof updatePageChrome === "function") {
        updatePageChrome();
    }
    if (isPlacingCursor && typeof showStudioNotice === "function") {
        showStudioNotice("Click a note to place the start cursor.");
    }
}

function togglePlaceCursorMode() {
    if (isPlaybackActive) return;
    setPlaceCursorMode(!isPlacingCursor);
}

function placeCursorFromClick(clientX, clientY) {
    const targets = collectCursorHitTargets();
    let best = null;
    let bestDist = Infinity;

    targets.forEach(target => {
        (target.rects || []).forEach(box => {
            let dist = 0;
            if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) {
                const nearestX = Math.min(Math.max(clientX, box.left), box.right);
                const nearestY = Math.min(Math.max(clientY, box.top), box.bottom);
                dist = (clientX - nearestX) ** 2 + (clientY - nearestY) ** 2;
            }
            if (dist < bestDist) {
                bestDist = dist;
                best = target;
            }
        });
    });

    if (!best || bestDist > 90 * 90) {
        if (typeof showStudioNotice === "function") {
            showStudioNotice("Click closer to a note.");
        }
        seekCursorToStart();
        return;
    }

    cursorStartIndex = best.index;
    cursorStartTime = best.time;
    cursorStartMeasure = best.measure;
    seekCursorToStart();

    const measureLabel = document.getElementById("measureDisplay");
    if (measureLabel) measureLabel.textContent = "Measure " + best.measure;
    if (typeof showScorePage === "function") {
        showScorePage(getPageForMeasure(best.measure) || currentScorePage);
    }

    setPlaceCursorMode(false);
    if (typeof showStudioNotice === "function") {
        showStudioNotice("Start set at measure " + best.measure + ". Press Play.");
    }
}

function sheetText(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value.text || value.Text || "";
}

function publishScoreMeta(score) {
    const sheet = score?.Sheet;
    const title = sheetText(sheet?.Title) || sheetText(sheet?.TitleString);
    const composer = sheetText(sheet?.Composer) || sheetText(sheet?.ComposerString);
    const titleEl = document.getElementById("pieceTitle");
    const bylineEl = document.getElementById("pieceByline");
    if (titleEl) titleEl.textContent = title || "Score";
    if (bylineEl) bylineEl.textContent = composer || "Ready to practice";
    document.body.classList.add("score-ready");
}

async function loadScoreFromSource(source) {
    const container = document.getElementById("score-container");
    if (!container) {
        console.error("Missing #score-container");
        return;
    }

    document.body.classList.remove("score-ready");
    container.innerHTML = "";
    window.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
        autoResize: false,
        backend: "svg",
        pageFormat: "Endless",
        pageBackgroundColor: "#f6f1e6",
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
    resetCursorStart();
    prepareCursor(window.osmd);

    if (typeof initScorePages === "function") {
        initScorePages();
    }

    if (typeof getMeasuresByPage === "function" && window.osmd.GraphicSheet) {
        console.log("Measures by page:", getMeasuresByPage());
    }

    publishScoreMeta(window.osmd);
    console.log("Loaded notes:", notes);
}

async function loadScore() {
    try {
        await loadScoreFromSource(DEFAULT_SCORE);
    } catch (error) {
        console.warn("Default Mozart score not found, loading sample instead.", error);
        try {
            await loadScoreFromSource(FALLBACK_SCORE);
        } catch (fallbackError) {
            console.error(fallbackError);
            document.body.classList.add("score-ready");
            if (typeof showStudioNotice === "function") {
                showStudioNotice("Could not open the score.");
            }
        }
    }
}

function readPlaybackBpm() {
    const bpmInput = document.getElementById("bpmInput");
    const value = Number(bpmInput?.value);
    if (value > 0) bpm = value;
    return bpm;
}

function getPlaybackSynth() {
    if (typeof Tone === "undefined") return null;
    if (!playbackSynth) {
        playbackSynth = new Tone.PolySynth(Tone.Synth).toDestination();
    }
    playbackSynth.volume.value = playbackMuted ? -Infinity : 0;
    return playbackSynth;
}

function applyPlaybackMute() {
    if (playbackSynth) {
        playbackSynth.volume.value = playbackMuted ? -Infinity : 0;
    }
    document.body.classList.toggle("is-sound-muted", playbackMuted);
    const btn = document.getElementById("muteSoundBtn");
    if (!btn) return;
    btn.classList.toggle("is-muted", playbackMuted);
    btn.setAttribute("aria-pressed", playbackMuted ? "true" : "false");
    btn.setAttribute("aria-label", playbackMuted ? "Unmute sound" : "Mute sound");
    btn.title = playbackMuted ? "Sound off" : "Sound on";
}

function togglePlaybackSound() {
    playbackMuted = !playbackMuted;
    applyPlaybackMute();
}

function stopPlayback(options = {}) {
    const restoreView = options.restoreView !== false;
    if (typeof Tone !== "undefined") {
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.seconds = 0;
        if (playbackSynth && typeof playbackSynth.releaseAll === "function") {
            playbackSynth.releaseAll();
        }
    }
    isPlaybackActive = false;
    if (restoreView) {
        seekCursorToStart();
        const startMeasure = cursorStartMeasure || notes[0]?.measure || 1;
        const measureLabel = document.getElementById("measureDisplay");
        if (measureLabel) measureLabel.textContent = "Measure " + startMeasure;
        if (typeof showScorePage === "function") {
            showScorePage(getPageForMeasure(startMeasure) || 1);
        }
    }
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
    stopPlayback({ restoreView: false });
    setPlaceCursorMode(false);

    if (notes.length === 0) {
        notes = extractNotesFromOsmd(score);
        console.log("Loaded notes:", notes);
    }

    if (notes.length === 0) {
        console.error("No playable notes found");
        return;
    }

    seekCursorToStart();
    followPlaybackPage = true;
    isPlaybackActive = true;
    const startMeasure = cursorStartMeasure || notes[0].measure;
    if (typeof showScorePage === "function") {
        showScorePage(getPageForMeasure(startMeasure) || 1);
    }
    if (typeof updatePageChrome === "function") {
        updatePageChrome();
    }

    const synth = getPlaybackSynth();
    const secondsPerBeat = 60 / readPlaybackBpm();
    const startBeats = cursorStartTime;
    const cursorTimes = [...new Set(notes.map(note => note.time))].sort((a, b) => a - b);

    notes.forEach(note => {
        if (note.time + 1e-6 < startBeats) return;
        Tone.Transport.schedule(time => {
            if (!synth) return;
            synth.triggerAttackRelease(
                note.pitch,
                note.duration * secondsPerBeat,
                time
            );
        }, note.time * secondsPerBeat);
    });

    cursorTimes.forEach(entryTime => {
        if (entryTime + 1e-6 < startBeats) return;
        Tone.Transport.schedule(() => {
            const current = notes.find(note => note.time === entryTime);
            if (!current) return;

            const measureLabel = document.getElementById("measureDisplay");
            if (measureLabel) measureLabel.textContent = "Measure " + current.measure;

            if (isPlaybackActive && typeof showScorePage === "function") {
                const page = getPageForMeasure(current.measure);
                if (page && page !== currentScorePage) {
                    showScorePage(page);
                }
            }

            if (entryTime > startBeats + 1e-6) score.cursor.next();
        }, entryTime * secondsPerBeat);
    });

    if (typeof lastPlaybackTimeByPage === "function") {
        lastPlaybackTimeByPage(notes).forEach((endBeats, page) => {
            if (page >= getScorePageCount() || endBeats + 1e-6 < startBeats) return;
            Tone.Transport.schedule(() => {
                if (isPlaybackActive && currentScorePage === page) {
                    showScorePage(page + 1);
                }
            }, endBeats * secondsPerBeat);
        });
    }

    const remaining = notes.filter(note => note.time + 1e-6 >= startBeats);
    const lastEnd = remaining.length
        ? Math.max(...remaining.map(note => note.time + note.duration))
        : startBeats;
    Tone.Transport.schedule(() => {
        isPlaybackActive = false;
        if (typeof updatePageChrome === "function") {
            updatePageChrome();
        }
    }, lastEnd * secondsPerBeat);

    const startSeconds = Math.max(0, startBeats * secondsPerBeat);
    Tone.Transport.start("+0.05", startSeconds);
}

applyPlaybackMute();

document.getElementById("score-stage")?.addEventListener("click", (event) => {
    if (!isPlacingCursor || isPlaybackActive) return;
    if (!event.target.closest("#score-container, .sheet")) return;
    placeCursorFromClick(event.clientX, event.clientY);
});

loadScore();
