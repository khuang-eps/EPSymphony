// debugging
alert("analysis.js loaded");
console.log("analysis.js loaded")

window.osmd = null; //to avoid conflict with let osmd
let currentMeasure = 1;

function getMeasuresByPage() {
    const pages = window.osmd.GraphicSheet.MusicPages;
    const result = [];

    pages.forEach((page, pageIndex) => {
        const measureNumbers = new Set();

        page.MusicSystems.forEach(system => {
            system.GraphicalMeasures.forEach(measureList => {
                measureList.forEach(gm => {
                    const num = gm.parentSourceMeasure?.measureNumber;
                    if (num !== undefined) {
                        measureNumbers.add(num);
                    }
                });
            });
        });

        result.push({
            page: pageIndex + 1,
            measures: Array.from(measureNumbers)
        });
    });

    return result;
}

async function loadUploadedScore() {
    const fileInput = document.getElementById("fileInput");

    if (!fileInput.isDefaultNamespace.length) {
        alert("please upload a musicXML file.");
        return;
    }

    const file = fileInput.files[0];

    const container = document.getElementById("score-container");

    window.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
        autoResize: true,
        backend: "svg"
    });

    await window.osmd.load("../static/music/MozartPianoSonata.mxl");
    window.osmd.render();

    console.log(window.osmd.GraphicSheet);
    console.log(window.osmd.GraphicSheet.MusicPages);

    const pages = getMeasuresByPage();
    console.log(pages);
}

loadScore();

function startPolling() {
    console.log("Start button clicked");
    startMicrophoneSync();
}

function nextPage() {
    if (osmd) osmd.next();
}

function prevPage() {
    if (osmd) osmd.previous();
}

function scrollToMeasure(measureNumber) {
    const container = document.getElementById("score-container");

    // will fix later
    const scrollAmount = measureNumber * 100;
    container.scrollTop = scrollAmount;

    document.getElementById("measureDisplay").innerText =
        "current measure: " + measureNumber;
}

async function startMicrophoneSync() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const mic = audioContext.createMediaStreamSource(stream);

    const analyser = audioContext.createAnalyser();
    mic.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function analyzeAudio() {
        analyser.getByteFrequencyData(dataArray);

        // VERY BASIC "activity detection"
        let volume = dataArray.reduce((a, b) => a + b) / dataArray.length;

        if (volume > 50) {
            currentMeasure++;
            scrollToMeasure(currentMeasure);
        }

        requestAnimationFrame(analyzeAudio);
    }

    analyzeAudio();
}

async function analyze() {
    const res = await fetch("/analyze", { method: "POST", body: formData });
    const data = await res.json();

    window.sessionData = data;
}

async function loadSession() {
    const res = await fetch("/session");
    const data = await res.json();

    window.sessionData = data;
}