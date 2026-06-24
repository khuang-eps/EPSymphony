alert("hehehehah")
let osmd;
let notes = [];
let bpm = 120;

async function loadScore() {
    const container = document.getElementById("score-container");

    osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
        autoResize: true,
        backend: "svg"
    });

    const musicPath = "../music/MozartPianoSonata.mxl";

    await osmd.load(musicPath);
    osmd.render();

    osmd.enableOrDisableCursor(true);
    osmd.cursor.show();
    window.osmd = osmd;

    notes = await parseMusicXML(musicPath);

    console.log("Loaded notes:", notes);
}

async function parseMusicXML(path) {
    const response = await fetch(path);
    const xmlText = await response.text();

    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");

    const parsedNotes = [];

    let divisions = 1;
    let currentTime = 0;
    let currentMeasure = 1;

    const measures = xml.querySelectorAll("part:first-of-type measure");

    measures.forEach(measure => {
        currentMeasure = Number(measure.getAttribute("number"));

        const newDivisions = measure.querySelector("attributes divisions");
        if (newDivisions) {
            divisions = Number(newDivisions.textContent);
        }

        const tempoTag = measure.querySelector("direction sound[tempo]");
        if (tempoTag) {
            bpm = Number(tempoTag.getAttribute("tempo"));
        }

        const measureNotes = measure.querySelectorAll("note");

        measureNotes.forEach(note => {
            const durationTag = note.querySelector("duration");
            if (!durationTag) return;

            const durationBeats = Number(durationTag.textContent) / divisions;
            const isRest = note.querySelector("rest");
            const isChord = note.querySelector("chord");

            if (!isRest) {
                const step = note.querySelector("pitch step")?.textContent;
                const octave = note.querySelector("pitch octave")?.textContent;
                const alter = note.querySelector("pitch alter")?.textContent;

                if (step && octave) {
                    let pitch = step;

                    if (alter === "1") pitch += "#";
                    if (alter === "-1") pitch += "b";

                    pitch += octave;

                    parsedNotes.push({
                        pitch: pitch,
                        time: currentTime,
                        duration: durationBeats,
                        measure: currentMeasure
                    });
                }
            }
            if (!isChord) {
                currentTime += durationBeats;
            }
        });
    });

    return parsedNotes;
}

async function startPlayback() {
    console.log("Play button clicked");

    await Tone.start();

    const synth = new Tone.PolySynth(Tone.Synth).toDestination();

    const secondsPerBeat = 60 / bpm;

    const score = window.osmd || osmd;

    const score = window.osmd;

    if (!score) {
        console.error("OSMD is not ready");
        return;
    }

    score.enableOrDisableCursor(true);
    score.cursor.show();
    score.cursor.reset();

    notes.forEach(note => {
        Tone.Transport.schedule(time => {
            synth.triggerAttackRelease(
                note.pitch,
                note.duration * secondsPerBeat,
                time
            );

            document.getElementById("measureDisplay").textContent =
                "Current Measure: " + note.measure;

            osmd.cursor.next();

        }, note.time * secondsPerBeat);
    });

    Tone.Transport.start();
}

loadScore();