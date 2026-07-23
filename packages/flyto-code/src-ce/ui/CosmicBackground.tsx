import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const HERO_HEIGHT = 650;

/**
 * Public-safe rendering primitive extracted from the Flyto2 product shell.
 * It contains no product data, entitlement, provider, or hosted control-plane logic.
 */
export function CosmicBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const productCanvas: HTMLCanvasElement = canvas;
    const productWrap: HTMLDivElement = wrap;
    const drawingContext: CanvasRenderingContext2D = context;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let particles: Particle[] = [];
    let frameID = 0;
    let running = true;

    function resize() {
      width = productWrap.clientWidth;
      productCanvas.width = Math.floor(width * dpr);
      productCanvas.height = Math.floor(HERO_HEIGHT * dpr);
      productCanvas.style.width = `${width}px`;
      productCanvas.style.height = `${HERO_HEIGHT}px`;
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.round((width * HERO_HEIGHT) / 14_000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * HERO_HEIGHT,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        radius: Math.random() * 1.6 + 0.7,
      }));
    }

    function draw() {
      drawingContext.clearRect(0, 0, width, HERO_HEIGHT);
      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < -20) particle.x = width + 20;
        else if (particle.x > width + 20) particle.x = -20;
        if (particle.y < -20) particle.y = HERO_HEIGHT + 20;
        else if (particle.y > HERO_HEIGHT + 20) particle.y = -20;
      }

      for (let left = 0; left < particles.length; left += 1) {
        for (let right = left + 1; right < particles.length; right += 1) {
          const first = particles[left];
          const second = particles[right];
          const dx = first.x - second.x;
          const dy = first.y - second.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < 132 * 132) {
            const opacity = (1 - Math.sqrt(distanceSquared) / 132) * 0.5;
            drawingContext.strokeStyle = `rgba(139,92,246,${opacity.toFixed(3)})`;
            drawingContext.lineWidth = 0.7;
            drawingContext.beginPath();
            drawingContext.moveTo(first.x, first.y);
            drawingContext.lineTo(second.x, second.y);
            drawingContext.stroke();
          }
        }
      }

      for (const particle of particles) {
        const glow = drawingContext.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          particle.radius * 4,
        );
        glow.addColorStop(
          0,
          `rgba(${particle.radius > 1.6 ? "59,130,246" : "139,92,246"},0.9)`,
        );
        glow.addColorStop(1, "rgba(139,92,246,0)");
        drawingContext.fillStyle = glow;
        drawingContext.beginPath();
        drawingContext.arc(particle.x, particle.y, particle.radius * 4, 0, Math.PI * 2);
        drawingContext.fill();
      }

      if (running && !reduced) frameID = requestAnimationFrame(draw);
    }

    resize();
    draw();
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frameID);
      } else if (!reduced) {
        running = true;
        frameID = requestAnimationFrame(draw);
      }
    };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(frameID);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="cosmic-background" ref={wrapRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
