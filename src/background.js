// Blueprint background: a slowly drifting grid, a few crosshair marks, and drifting nodes that link up when they are close. The nodes lean toward the pointer.
export function startBackground(canvas) {
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const nodes = Array.from({ length: 42 }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.00012,
    vy: (Math.random() - 0.5) * 0.00012,
  }));
  const marks = [
    [0.1, 0.18],
    [0.88, 0.12],
    [0.72, 0.7],
    [0.16, 0.8],
  ];
  const pointer = { x: 0.5, y: 0.5 };
  let width = 0;
  let height = 0;
  let colors = { ink: "#777", accent: "#2b6a4e" };

  function readColors() {
    const style = getComputedStyle(canvas);
    colors = {
      ink: style.getPropertyValue("--ink-3").trim() || colors.ink,
      accent: style.getPropertyValue("--accent").trim() || colors.accent,
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readColors();
  }

  function draw(time) {
    const motion = reduceMotion.matches ? 0 : 1;
    ctx.clearRect(0, 0, width, height);

    // Grid, drifting slowly so the page feels alive without moving content.
    const spacing = 56;
    const shift = (time * 0.006 * motion) % spacing;
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -spacing + shift; x < width + spacing; x += spacing) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
    }
    for (let y = -spacing + shift; y < height + spacing; y += spacing) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
    }
    ctx.stroke();

    // Crosshair marks, the kind you see on drawings.
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = colors.accent;
    for (const [mx, my] of marks) {
      const cx = mx * width;
      const cy = my * height;
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy);
      ctx.lineTo(cx + 9, cy);
      ctx.moveTo(cx, cy - 9);
      ctx.lineTo(cx, cy + 9);
      ctx.stroke();
    }

    // Nodes: move, lean toward the pointer, and link up when close.
    const points = nodes.map((node) => {
      node.x = (node.x + node.vx * motion * 16 + 1) % 1;
      node.y = (node.y + node.vy * motion * 16 + 1) % 1;
      return {
        x: node.x * width + (pointer.x - 0.5) * 24,
        y: node.y * height + (pointer.y - 0.5) * 24,
      };
    });
    ctx.lineWidth = 1;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const distance = Math.hypot(dx, dy);
        if (distance < 120) {
          ctx.globalAlpha = (1 - distance / 120) * 0.22;
          ctx.strokeStyle = colors.accent;
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = colors.accent;
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(time) {
    draw(time);
    if (!reduceMotion.matches) {
      requestAnimationFrame(loop);
    }
  }

  window.addEventListener("resize", () => {
    resize();
    draw(performance.now());
  });
  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX / window.innerWidth;
    pointer.y = event.clientY / window.innerHeight;
  });
  reduceMotion.addEventListener("change", () => requestAnimationFrame(loop));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);

  resize();
  requestAnimationFrame(loop);
}
