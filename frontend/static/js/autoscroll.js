let animationId = null;

function startAutoScroll() {
    if (typeof startPlayback === "function") {
        startPlayback();
        return;
    }
    console.warn("Playback is not ready, so page turning cannot start.");
}

function stopAutoScroll() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    if (typeof stopPlayback === "function") {
        stopPlayback();
    }
}
