window.osmd = null;
let currentMeasure = 1;
let currentScorePage = 1;
let scorePageScale = 1;
let scorePageRanges = [];
let pagingMode = "osmd";

let fittingScore = false;
let followPlaybackPage = true;
let isPlaybackActive = false;

window.addEventListener("resize", () => {
    if (!window.osmd || fittingScore) return;
    fittingScore = true;
    sizeOsmdPageToContainer();
    window.osmd.render();
    if (typeof prepareCursor === "function") prepareCursor(window.osmd);
    buildScorePageRanges();
    showScorePage(currentScorePage);
    fittingScore = false;
});

function getMeasuresByPage() {
    const pages = window.osmd.GraphicSheet.MusicPages;
    const result = [];

    pages.forEach((page, pageIndex) => {
        const measureNumbers = new Set();

        page.MusicSystems.forEach(system => {
            system.GraphicalMeasures.forEach(measureList => {
                measureList.forEach(gm => {
                    const source = gm.parentSourceMeasure;
                    const num = source?.MeasureNumber ?? source?.measureNumber;
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

    if (!fileInput.files.length) {
        alert("Please upload a MusicXML file.");
        return;
    }

    await loadScoreFromSource(fileInput.files[0]);
}

function getAllMeasureNumbers() {
    return (window.osmd?.Sheet?.SourceMeasures || []).map(measure => measure.MeasureNumber);
}

function osmdUnitToPx(value) {
    const rules = window.osmd?.EngravingRules;
    const unit = rules?.UnitInPixels || 10;
    return value * unit * (window.osmd?.zoom || 1);
}

function collectSystems() {
    const systems = [];
    const pages = window.osmd?.GraphicSheet?.MusicPages || [];
    pages.forEach((page, osmdPageIndex) => {
        (page.MusicSystems || []).forEach(system => {
            const shape = system.PositionAndShape;
            const absolute = shape?.AbsolutePosition || shape?.absolutePosition;
            const size = shape?.Size || shape?.size;
            const measures = new Set();
            (system.GraphicalMeasures || []).forEach(measureList => {
                (measureList || []).forEach(gm => {
                    const source = gm.parentSourceMeasure;
                    const printed = Number(source?.MeasureNumber ?? source?.measureNumber ?? gm.MeasureNumber);
                    const index = window.osmd?.Sheet?.SourceMeasures
                        ? window.osmd.Sheet.SourceMeasures.indexOf(source) + 1
                        : NaN;
                    if (Number.isFinite(printed)) measures.add(printed);
                    if (index > 0) measures.add(index);
                });
            });
            const borderTop = shape?.BorderTop ?? shape?.borderTop ?? 0;
            const borderBottom = shape?.BorderBottom ?? shape?.borderBottom ?? 0;
            systems.push({
                osmdPage: osmdPageIndex + 1,
                y: absolute?.y ?? 0,
                height: size?.height ?? 0,
                borderTop: borderTop < 0 ? borderTop : -Math.abs(borderTop || 4),
                borderBottom: Math.abs(borderBottom || 2),
                measures: Array.from(measures).sort((a, b) => a - b)
            });
        });
    });
    return systems;
}

function toPageRange(page, measures, extras) {
    const sorted = [...new Set(measures.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
    return {
        page,
        measures: sorted,
        from: sorted[0],
        to: sorted[sorted.length - 1],
        osmdPage: extras?.osmdPage || 1,
        offsetY: extras?.offsetY || 0,
        startY: extras?.startY || 0,
        endY: extras?.endY || 0
    };
}

function systemVisualTop(system) {
    return osmdUnitToPx(system.y + system.borderTop);
}

function systemVisualBottom(system) {
    return osmdUnitToPx(system.y + system.height + system.borderBottom);
}

function buildScorePageRanges() {
    pagingMode = "osmd";
    const numbers = getAllMeasureNumbers();
    const systems = collectSystems();
    const systemsPerPage = 2;
    const topPad = 40;
    const bottomPad = 28;

    if (!systems.length) {
        scorePageRanges = [toPageRange(1, numbers.length ? numbers : [1])];
        return;
    }

    scorePageRanges = [];
    for (let i = 0; i < systems.length; i += systemsPerPage) {
        const bucket = systems.slice(i, i + systemsPerPage);
        const measures = bucket.flatMap(system => system.measures);
        const startY = Math.max(0, systemVisualTop(bucket[0]) - topPad);
        const endY = systemVisualBottom(bucket[bucket.length - 1]) + bottomPad;
        scorePageRanges.push(toPageRange(scorePageRanges.length + 1, measures, {
            osmdPage: bucket[0].osmdPage,
            offsetY: startY,
            startY,
            endY
        }));
    }
}

function getScorePageCount() {
    if (scorePageRanges.length) return scorePageRanges.length;
    if (window.osmd?.GraphicSheet?.MusicPages?.length) {
        return window.osmd.GraphicSheet.MusicPages.length;
    }
    return document.querySelectorAll("#score-container [id^='osmdCanvasPage']").length || 1;
}

function updatePageChrome() {
    const total = getScorePageCount();
    const label = document.getElementById("pageDisplay");
    if (label) {
        label.textContent = "Page " + currentScorePage + " of " + total;
    }

    const prevBtn = document.getElementById("prevPageBtn");
    const nextBtn = document.getElementById("nextPageBtn");
    if (prevBtn) prevBtn.disabled = isPlaybackActive || currentScorePage <= 1;
    if (nextBtn) nextBtn.disabled = isPlaybackActive || currentScorePage >= total;
}

function sizeOsmdPageToContainer() {
    const container = document.getElementById("score-container");
    const osmd = window.osmd;
    if (!container || !osmd?.EngravingRules) return;

    const rules = osmd.EngravingRules;
    const unit = rules.UnitInPixels || 10;
    const zoom = osmd.zoom || 1;
    const padding = 8;
    rules.PageWidth = Math.max(40, (container.clientWidth - padding) / unit / zoom);
    rules.PageHeight = Math.max(40, (container.clientHeight - padding) / unit / zoom);
}

function showScorePage(pageNumber) {
    const total = getScorePageCount();
    if (total < 1) return;

    currentScorePage = Math.min(Math.max(pageNumber, 1), total);
    const range = scorePageRanges[currentScorePage - 1];
    const osmdPage = range?.osmdPage || currentScorePage;
    const canvases = document.querySelectorAll("#score-container [id^='osmdCanvasPage']");

    canvases.forEach((canvas, index) => {
        const pageIndex = index + 1;
        const visible = pageIndex === osmdPage;
        canvas.style.display = visible ? "block" : "none";
        if (!visible) {
            canvas.style.transform = "";
            canvas.style.clipPath = "";
            return;
        }

        const svg = canvas.querySelector("svg");
        const svgHeight = Number(svg?.getAttribute("height")) || canvas.scrollHeight || 0;
        const startY = range?.startY || 0;
        const endY = range?.endY || svgHeight;
        canvas.style.clipPath = `inset(${startY}px 0 ${Math.max(0, svgHeight - endY)}px 0)`;
        canvas.style.transform = `translateY(${-startY}px)`;
    });

    updatePageChrome();
}

function initScorePages() {
    buildScorePageRanges();
    currentScorePage = 0;
    showScorePage(1);
}

function nextPage() {
    if (isPlaybackActive) return;
    showScorePage(currentScorePage + 1);
}

function prevPage() {
    if (isPlaybackActive) return;
    showScorePage(currentScorePage - 1);
}

function getPageForMeasure(measureNumber) {
    const n = Number(measureNumber);
    const exact = scorePageRanges.find(page => page.measures.some(measure => Number(measure) === n));
    if (exact) return exact.page;

    const spanned = scorePageRanges.find(page => {
        const from = Number(page.from);
        const to = Number(page.to);
        return Number.isFinite(from) && Number.isFinite(to) && n >= from && n <= to;
    });
    return spanned ? spanned.page : 1;
}

function lastPlaybackTimeByPage(parsedNotes) {
    const ends = new Map();
    parsedNotes.forEach(note => {
        const page = getPageForMeasure(note.measure);
        const end = note.time + note.duration;
        if (!ends.has(page) || end > ends.get(page)) {
            ends.set(page, end);
        }
    });
    return ends;
}

function startPolling() {
    console.log("Start button clicked");
    startMicrophoneSync();
}

function scrollToMeasure(measureNumber) {
    currentMeasure = measureNumber;
    showScorePage(getPageForMeasure(measureNumber));

    document.getElementById("measureDisplay").innerText =
        "Current Measure: " + measureNumber;
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