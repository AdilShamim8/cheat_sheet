"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight particle field hero. Renders a canvas-based particle system that:
 *  - Lazy-mounts only when visible (IntersectionObserver)
 *  - Respects prefers-reduced-motion (renders a static gradient fallback)
 *  - Falls back gracefully if WebGL/canvas unavailable
 *  - Reads theme tokens via getComputedStyle for color adaptation
 *
 * No external dependencies — pure Canvas 2D, ~3KB gzipped.
 */
export function ParticleHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return; // CSS gradient fallback remains

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    let mouse = { x: -1000, y: -1000 };
    let visible = false;

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      const particle = cs.getPropertyValue("--hero-particle").trim() || "#9333ea";
      const fg = cs.getPropertyValue("--foreground").trim() || "#fff";
      return { particle, fg };
    };

    let colors = readColors();

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Re-seed particles on resize
      const target = Math.min(80, Math.floor((w * h) / 14000));
      particles = Array.from({ length: target }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.4,
      }));
      colors = readColors();
    };

    const hexToRgba = (hex: string, a: number): string => {
      // Handle oklch()/rgb()/rgba() gracefully — fall back to hex parser
      if (hex.startsWith("oklch") || hex.startsWith("rgb")) {
        // Browser will resolve; use as-is with alpha via color-mix not available in canvas.
        // Fallback to a neutral particle color.
        return `rgba(180, 130, 255, ${a})`;
      }
      const h = hex.replace("#", "");
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Update + draw points
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        // Gentle pull toward mouse
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22500) {
          const f = (1 - d2 / 22500) * 0.02;
          p.vx += dx * f * 0.05;
          p.vy += dy * f * 0.05;
        }
        // Friction
        p.vx *= 0.99;
        p.vy *= 0.99;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(colors.particle, 0.7);
        ctx.fill();
      }

      // Connect nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            const alpha = (1 - d / 110) * 0.18;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = hexToRgba(colors.particle, alpha);
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const start = () => {
      if (visible) return;
      visible = true;
      resize();
      rafRef.current = requestAnimationFrame(draw);
    };

    const stop = () => {
      visible = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const onResize = () => { if (visible) resize(); };
    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => { mouse.x = -1000; mouse.y = -1000; };

    // Observe visibility — only render when hero is on-screen
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) start();
          else stop();
        }
      },
      { threshold: 0.05 },
    );
    observerRef.current.observe(canvas);

    window.addEventListener("resize", onResize);
    canvas.parentElement?.addEventListener("mousemove", onMouse);
    canvas.parentElement?.addEventListener("mouseleave", onLeave);

    return () => {
      stop();
      observerRef.current?.disconnect();
      window.removeEventListener("resize", onResize);
      canvas.parentElement?.removeEventListener("mousemove", onMouse);
      canvas.parentElement?.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}
