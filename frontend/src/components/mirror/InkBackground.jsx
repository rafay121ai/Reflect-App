import { useEffect, useRef } from "react";

/**
 * Animated ink-in-water SVG-style background. Slow, organic, not distracting.
 * Each slide passes its own colors via props.
 */
export default function InkBackground({ color1, color2, inkColor, isActive }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const blobsRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    blobsRef.current = Array.from({ length: 5 }, (_, i) => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      radius: 80 + Math.random() * 120,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      opacity: 0.3 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.003 + Math.random() * 0.005,
    }));

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, color1);
      grad.addColorStop(1, color2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      blobsRef.current.forEach((blob) => {
        blob.x += blob.vx;
        blob.y += blob.vy;
        blob.phase += blob.phaseSpeed;

        if (blob.x < -blob.radius) blob.x = w + blob.radius;
        if (blob.x > w + blob.radius) blob.x = -blob.radius;
        if (blob.y < -blob.radius) blob.y = h + blob.radius;
        if (blob.y > h + blob.radius) blob.y = -blob.radius;

        const r = blob.radius + Math.sin(blob.phase) * 20;

        const baseRgba = inkColor.replace(/[\d.]+\)$/, `${blob.opacity})`);
        const blobGrad = ctx.createRadialGradient(
          blob.x,
          blob.y,
          0,
          blob.x,
          blob.y,
          r
        );
        blobGrad.addColorStop(0, baseRgba);
        blobGrad.addColorStop(1, "transparent");

        ctx.beginPath();
        ctx.arc(blob.x, blob.y, r, 0, Math.PI * 2);
        ctx.fillStyle = blobGrad;
        ctx.fill();
      });

      animFrameRef.current = requestAnimationFrame(draw);
    };

    if (isActive) {
      draw();
    }

    return () => {
      window.removeEventListener("resize", resize);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [color1, color2, inkColor, isActive]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
      }}
    />
  );
}
