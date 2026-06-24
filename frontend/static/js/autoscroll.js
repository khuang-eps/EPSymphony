let animationId = null;

function getScrollY(currentTime, times, positions) {
    for (let i = 0; i < times.length - 1; i++) {
        if (currentTime >= times[i] && currentTime < times[i + 1]) {
            let t0 = times[i], t1 = times[i + 1];
            let y0 = positions[i], y1 = positions[i + 1];

            let alpha = (currentTime - t0) / (t1 - t0);

            // smoothstep
            alpha = alpha * alpha * (3 - 2 * alpha);

            return y0 + alpha * (y1 - y0);
        }
    }
    return positions[positions.length - 1];
}

function startAutoScroll() {
    const times = window.sessionData.measure_times;
    const positions = window.sessionData.measure_positions;

    const start = performance.now();

    function step() {
        let currentTime = (performance.now() - start) / 1000;

        let y = getScrollY(currentTime, times, positions);
        scrollToY(y);

        animationId = requestAnimationFrame(step);
    }

    step();
}

function stopAutoScroll() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}
