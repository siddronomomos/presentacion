import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const TAU = Math.PI * 2;
const LEVY_BETA = 1.5;
const LEVY_SIGMA = levySigma(LEVY_BETA);

const OBJECTIVE_FUNCTIONS = {
  rastrigin: {
    name: "Rastrigin",
    fn: (x, y) => 20 + x * x + y * y - 10 * (Math.cos(TAU * x) + Math.cos(TAU * y)),
  },
  ackley: {
    name: "Ackley",
    fn: (x, y) => {
      const a = -0.2 * Math.sqrt(0.5 * (x * x + y * y));
      const b = 0.5 * (Math.cos(TAU * x) + Math.cos(TAU * y));
      return -20 * Math.exp(a) - Math.exp(b) + Math.E + 20;
    },
  },
  sphere: {
    name: "Sphere",
    fn: (x, y) => x * x + y * y,
  },
};

const state = {
  bounds: { min: -5, max: 5 },
  nestsCount: 28,
  pa: 0.25,
  alpha: 0.7,
  fnKey: "rastrigin",
  fn: OBJECTIVE_FUNCTIONS.rastrigin.fn,
  range: { min: 0, max: 1 },
  nests: [],
  best: null,
  iter: 0,
  running: false,
  speedMs: 140,
  lastStepTime: 0,
  needsRender2D: true,
  needsUpdate3D: true,
  heatmapCanvas: null,
  canvas2d: null,
  ctx2d: null,
  three: null,
  planeSize: 10,
  heightScale: 4,
};

const didacticState = {
  bounds: { min: -5, max: 5 },
  nestsCount: 24,
  pa: 0.25,
  alpha: 0.7,
  fnKey: "rastrigin",
  fn: OBJECTIVE_FUNCTIONS.rastrigin.fn,
  range: { min: 0, max: 1 },
  nests: [],
  best: null,
  iter: 0,
  phaseIndex: 0,
  running: false,
  speedMs: 220,
  lastStepTime: 0,
  needsRender2D: true,
  heatmapCanvas: null,
  canvas2d: null,
  ctx2d: null,
  candidates: [],
  moves: [],
};

const DIDACTIC_PHASES = [
  { key: "generate", label: "Huevos nuevos" },
  { key: "select", label: "Seleccion aleatoria" },
  { key: "abandon", label: "Abandonar fraccion" },
  { key: "update", label: "Actualizar mejor" },
];

const ui = {};
const slideState = {
  slides: [],
  currentIndex: 0,
};

function init() {
  cacheUI();
  setupSlides();
  setupObservers();
  setup2D();
  setup3D();
  setupDidactic();
  bindUI();
  resetSimulation();
  resetDidactic();
  requestAnimationFrame(renderLoop);
}

function cacheUI() {
  ui.fnSelect = document.getElementById("fn-select");
  ui.nestsInput = document.getElementById("nests-input");
  ui.paInput = document.getElementById("pa-input");
  ui.alphaInput = document.getElementById("alpha-input");
  ui.speedInput = document.getElementById("speed-input");
  ui.speedValue = document.getElementById("speed-value");
  ui.startBtn = document.getElementById("start-btn");
  ui.resetBtn = document.getElementById("reset-btn");
  ui.iterValue = document.getElementById("iter-value");
  ui.bestValue = document.getElementById("best-value");
  ui.canvas2d = document.getElementById("canvas2d");
  ui.threeContainer = document.getElementById("three-container");
  ui.fnSelectDidactic = document.getElementById("fn-select-didactic");
  ui.nestsInputDidactic = document.getElementById("nests-input-didactic");
  ui.paInputDidactic = document.getElementById("pa-input-didactic");
  ui.alphaInputDidactic = document.getElementById("alpha-input-didactic");
  ui.speedInputDidactic = document.getElementById("speed-input-didactic");
  ui.speedValueDidactic = document.getElementById("speed-value-didactic");
  ui.stepBtnDidactic = document.getElementById("step-btn-didactic");
  ui.toggleBtnDidactic = document.getElementById("toggle-btn-didactic");
  ui.resetBtnDidactic = document.getElementById("reset-btn-didactic");
  ui.iterValueDidactic = document.getElementById("iter-value-didactic");
  ui.bestValueDidactic = document.getElementById("best-value-didactic");
  ui.phaseValueDidactic = document.getElementById("phase-value-didactic");
  ui.canvas2dDidactic = document.getElementById("canvas2d-didactic");
  ui.prevSlide = document.getElementById("prev-slide");
  ui.nextSlide = document.getElementById("next-slide");
  ui.slideCurrent = document.getElementById("slide-current");
  ui.slideTotal = document.getElementById("slide-total");
}

function setupSlides() {
  slideState.slides = Array.from(document.querySelectorAll(".slide"));
  if (!slideState.slides.length) return;

  if (ui.slideTotal) {
    ui.slideTotal.textContent = String(slideState.slides.length);
  }

  if (ui.prevSlide) {
    ui.prevSlide.addEventListener("click", () => showSlide(slideState.currentIndex - 1));
  }

  if (ui.nextSlide) {
    ui.nextSlide.addEventListener("click", () => showSlide(slideState.currentIndex + 1));
  }

  document.addEventListener("keydown", handleSlideKeys);
  window.addEventListener("hashchange", () => showSlideByHash(false));

  const slideLinks = document.querySelectorAll('a[href^="#"]');
  slideLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = link.getAttribute("href");
      if (!target || target === "#") return;
      const id = target.replace("#", "");
      const index = findSlideIndexById(id);
      if (index !== -1) {
        event.preventDefault();
        showSlide(index);
      }
    });
  });

  showSlideByHash(true);
}

function showSlideByHash(isInitial) {
  const hash = window.location.hash;
  const id = hash ? hash.replace("#", "") : "";
  const index = id ? findSlideIndexById(id) : 0;
  showSlide(index === -1 ? 0 : index, { updateHash: !isInitial && Boolean(id) });
}

function findSlideIndexById(id) {
  return slideState.slides.findIndex((slide) => slide.id === id);
}

function showSlide(index, options = {}) {
  if (!slideState.slides.length) return;
  const nextIndex = clampInt(index, 0, slideState.slides.length - 1, 0);
  slideState.currentIndex = nextIndex;

  slideState.slides.forEach((slide, i) => {
    const isActive = i === nextIndex;
    slide.classList.toggle("active", isActive);
    slide.setAttribute("aria-hidden", isActive ? "false" : "true");
  });

  if (ui.slideCurrent) {
    ui.slideCurrent.textContent = String(nextIndex + 1);
  }

  if (ui.prevSlide) {
    ui.prevSlide.disabled = nextIndex === 0;
  }

  if (ui.nextSlide) {
    ui.nextSlide.disabled = nextIndex === slideState.slides.length - 1;
  }

  const activeSlide = slideState.slides[nextIndex];
  if (options.updateHash !== false && activeSlide && activeSlide.id) {
    history.replaceState(null, "", `#${activeSlide.id}`);
  }

  requestAnimationFrame(() => activateSlide(activeSlide));
}

function activateSlide(slide) {
  if (!slide) return;
  slide.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));

  const hasDemo = slide.contains(ui.canvas2d) || slide.contains(ui.threeContainer);
  if (hasDemo) {
    resize2D();
    resize3D();
    if (state.canvas2d) {
      buildHeatmap();
    }
    state.needsRender2D = true;
    state.needsUpdate3D = true;
  }

  const hasDidactic = slide.contains(ui.canvas2dDidactic);
  if (hasDidactic) {
    resize2DDidactic();
    buildHeatmapDidactic();
    didacticState.needsRender2D = true;
  }
}

function handleSlideKeys(event) {
  if (isEditableTarget(event.target)) return;

  if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
    event.preventDefault();
    showSlide(slideState.currentIndex + 1);
  }

  if (event.key === "ArrowLeft" || event.key === "PageUp") {
    event.preventDefault();
    showSlide(slideState.currentIndex - 1);
  }
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag);
}

function setupObservers() {
  const revealItems = document.querySelectorAll(".reveal");
  if (!revealItems.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function setup2D() {
  if (!ui.canvas2d) return;
  state.canvas2d = ui.canvas2d;
  state.ctx2d = state.canvas2d.getContext("2d", { alpha: false });
  resize2D();
}

function setup3D() {
  if (!ui.threeContainer) return;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1c1d);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(10, 9, 12);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  ui.threeContainer.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  const directional = new THREE.DirectionalLight(0xffffff, 0.7);
  directional.position.set(6, 10, 8);

  scene.add(ambient, directional);

  state.three = {
    scene,
    camera,
    renderer,
    controls,
    surfaceMesh: null,
    points: null,
    bestMesh: null,
  };

  resize3D();
}

function setupDidactic() {
  if (!ui.canvas2dDidactic) return;
  didacticState.canvas2d = ui.canvas2dDidactic;
  didacticState.ctx2d = didacticState.canvas2d.getContext("2d", { alpha: false });
  resize2DDidactic();
}

function bindDidacticUI() {
  if (!ui.fnSelectDidactic) return;

  ui.stepBtnDidactic?.addEventListener("click", () => {
    setDidacticRunning(false);
    stepDidactic();
  });

  ui.toggleBtnDidactic?.addEventListener("click", () => {
    setDidacticRunning(!didacticState.running);
  });

  ui.resetBtnDidactic?.addEventListener("click", () => {
    setDidacticRunning(false);
    resetDidactic();
  });

  ui.speedInputDidactic?.addEventListener("input", () => {
    didacticState.speedMs = Number(ui.speedInputDidactic.value);
    if (ui.speedValueDidactic) {
      ui.speedValueDidactic.textContent = `${didacticState.speedMs} ms`;
    }
  });

  [ui.fnSelectDidactic, ui.nestsInputDidactic, ui.paInputDidactic, ui.alphaInputDidactic].forEach((input) => {
    if (!input) return;
    input.addEventListener("change", () => {
      setDidacticRunning(false);
      resetDidactic();
    });
  });
}

function setDidacticRunning(isRunning) {
  didacticState.running = isRunning;
  if (isRunning) {
    didacticState.lastStepTime = 0;
  }
  if (ui.toggleBtnDidactic) {
    ui.toggleBtnDidactic.textContent = isRunning ? "Pausar" : "Auto";
  }
}

function resetDidactic() {
  if (!ui.fnSelectDidactic) return;
  didacticState.fnKey = ui.fnSelectDidactic.value;
  didacticState.fn = OBJECTIVE_FUNCTIONS[didacticState.fnKey].fn;
  didacticState.nestsCount = clampInt(ui.nestsInputDidactic.value, 10, 60, 24);
  didacticState.pa = clampFloat(ui.paInputDidactic.value, 0.05, 0.5, 0.25);
  didacticState.alpha = clampFloat(ui.alphaInputDidactic.value, 0.1, 1.5, 0.7);
  didacticState.speedMs = Number(ui.speedInputDidactic?.value || didacticState.speedMs);
  if (ui.speedValueDidactic) {
    ui.speedValueDidactic.textContent = `${didacticState.speedMs} ms`;
  }

  didacticState.range = computeRange(didacticState.fn, 120);
  didacticState.iter = 0;
  didacticState.lastStepTime = 0;
  didacticState.phaseIndex = 0;
  didacticState.nests = createInitialNestsDidactic(didacticState.nestsCount);
  didacticState.best = findBest(didacticState.nests);
  didacticState.candidates = [];
  didacticState.moves = [];

  buildHeatmapDidactic();
  updateDidacticReadout();
  didacticState.needsRender2D = true;
}

function createInitialNestsDidactic(count) {
  const nests = [];
  for (let i = 0; i < count; i += 1) {
    nests.push(createRandomNestDidactic());
  }
  return nests;
}

function createRandomNestDidactic() {
  const { min, max } = didacticState.bounds;
  const x = randomInRange(min, max);
  const y = randomInRange(min, max);
  return { x, y, fitness: didacticState.fn(x, y) };
}

function levyNestDidactic(nest) {
  const stepX = levyStep() * didacticState.alpha;
  const stepY = levyStep() * didacticState.alpha;
  let x = nest.x + stepX;
  let y = nest.y + stepY;

  x = clampFloat(x, didacticState.bounds.min, didacticState.bounds.max, x);
  y = clampFloat(y, didacticState.bounds.min, didacticState.bounds.max, y);

  return { x, y, fitness: didacticState.fn(x, y) };
}

function stepDidactic() {
  if (!didacticState.nests.length) return;
  const phase = didacticState.phaseIndex;

  if (phase === 0) {
    generateDidacticCandidates();
  } else if (phase === 1) {
    selectDidacticCandidates();
  } else if (phase === 2) {
    abandonDidacticNests();
  } else {
    finalizeDidacticIteration();
  }

  updateDidacticReadout();
  didacticState.needsRender2D = true;
}

function generateDidacticCandidates() {
  const nests = didacticState.nests;
  const candidates = nests.map((nest) => levyNestDidactic(nest));
  const moves = candidates.map((candidate, i) => ({
    from: { x: nests[i].x, y: nests[i].y },
    to: { x: candidate.x, y: candidate.y },
    type: "levy",
  }));

  didacticState.candidates = candidates;
  didacticState.moves = moves;
  didacticState.phaseIndex = 1;
}

function selectDidacticCandidates() {
  const nests = didacticState.nests;
  const total = nests.length;
  const moves = [];

  didacticState.candidates.forEach((candidate) => {
    const j = Math.floor(Math.random() * total);
    moves.push({
      from: { x: nests[j].x, y: nests[j].y },
      to: { x: candidate.x, y: candidate.y },
      type: "select",
    });
    if (candidate.fitness < nests[j].fitness) {
      nests[j] = candidate;
    }
  });

  didacticState.moves = moves;
  didacticState.phaseIndex = 2;
}

function abandonDidacticNests() {
  const nests = didacticState.nests;
  const total = nests.length;
  const moves = [];
  const abandonCount = Math.floor(didacticState.pa * total);

  if (abandonCount > 0) {
    nests.sort((a, b) => b.fitness - a.fitness);
    for (let i = 0; i < abandonCount; i += 1) {
      const oldNest = nests[i];
      const fresh = createRandomNestDidactic();
      moves.push({
        from: { x: oldNest.x, y: oldNest.y },
        to: { x: fresh.x, y: fresh.y },
        type: "abandon",
      });
      nests[i] = fresh;
    }
  }

  didacticState.candidates = [];
  didacticState.moves = moves;
  didacticState.phaseIndex = 3;
}

function finalizeDidacticIteration() {
  didacticState.best = findBest(didacticState.nests);
  didacticState.iter += 1;
  didacticState.moves = [];
  didacticState.candidates = [];
  didacticState.phaseIndex = 0;
}

function updateDidacticReadout() {
  if (ui.iterValueDidactic) {
    ui.iterValueDidactic.textContent = String(didacticState.iter);
  }
  if (ui.bestValueDidactic) {
    ui.bestValueDidactic.textContent = formatNumber(didacticState.best ? didacticState.best.fitness : null);
  }
  if (ui.phaseValueDidactic) {
    ui.phaseValueDidactic.textContent = getDidacticPhaseLabel();
  }
}

function getDidacticPhaseLabel() {
  const phase = DIDACTIC_PHASES[didacticState.phaseIndex];
  return phase ? phase.label : "";
}

function buildHeatmapDidactic() {
  if (!didacticState.canvas2d) return;
  const width = didacticState.canvas2d.width;
  const height = didacticState.canvas2d.height;
  if (!width || !height) return;
  const { min, max } = didacticState.range;
  const heatmap = document.createElement("canvas");
  heatmap.width = width;
  heatmap.height = height;

  const ctx = heatmap.getContext("2d");
  const image = ctx.createImageData(width, height);
  const data = image.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / (width - 1);
      const ny = 1 - y / (height - 1);
      const value = didacticState.fn(
        lerp(didacticState.bounds.min, didacticState.bounds.max, nx),
        lerp(didacticState.bounds.min, didacticState.bounds.max, ny)
      );
      const t = normalize(value, min, max);
      const color = colorMap(1 - t);
      const idx = (y * width + x) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  didacticState.heatmapCanvas = heatmap;
}

function render2DDidactic() {
  if (!didacticState.ctx2d || !didacticState.canvas2d) return;
  const ctx = didacticState.ctx2d;
  const width = didacticState.canvas2d.width;
  const height = didacticState.canvas2d.height;

  ctx.clearRect(0, 0, width, height);
  if (didacticState.heatmapCanvas) {
    ctx.drawImage(didacticState.heatmapCanvas, 0, 0, width, height);
  }

  drawDidacticMoves(ctx, width, height);
  drawDidacticCandidates(ctx, width, height);

  const dpr = window.devicePixelRatio || 1;
  const radius = 4 * dpr;
  const bestRadius = radius * 1.6;

  ctx.save();
  ctx.fillStyle = "rgba(42, 157, 143, 0.9)";
  ctx.strokeStyle = "rgba(17, 36, 34, 0.6)";
  ctx.lineWidth = 1 * dpr;

  didacticState.nests.forEach((nest) => {
    const [cx, cy] = toCanvasByBounds(nest.x, nest.y, width, height, didacticState.bounds);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
  });

  if (didacticState.best) {
    const [bx, by] = toCanvasByBounds(didacticState.best.x, didacticState.best.y, width, height, didacticState.bounds);
    ctx.fillStyle = "rgba(212, 119, 28, 0.95)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.arc(bx, by, bestRadius, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawDidacticCandidates(ctx, width, height) {
  if (!didacticState.candidates.length) return;
  const dpr = window.devicePixelRatio || 1;
  const radius = 3.2 * dpr;

  ctx.save();
  ctx.fillStyle = "rgba(31, 92, 140, 0.9)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 1 * dpr;

  didacticState.candidates.forEach((candidate) => {
    const [cx, cy] = toCanvasByBounds(candidate.x, candidate.y, width, height, didacticState.bounds);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
}

function drawDidacticMoves(ctx, width, height) {
  if (!didacticState.moves.length) return;
  const dpr = window.devicePixelRatio || 1;
  const colors = {
    levy: "rgba(31, 92, 140, 0.85)",
    select: "rgba(31, 92, 140, 0.85)",
    abandon: "rgba(138, 155, 152, 0.8)",
  };

  ctx.save();
  ctx.lineWidth = 1.4 * dpr;

  didacticState.moves.forEach((move) => {
    if (move.type === "select") {
      ctx.setLineDash([6 * dpr, 6 * dpr]);
    } else {
      ctx.setLineDash([]);
    }
    const [fx, fy] = toCanvasByBounds(move.from.x, move.from.y, width, height, didacticState.bounds);
    const [tx, ty] = toCanvasByBounds(move.to.x, move.to.y, width, height, didacticState.bounds);
    const color = colors[move.type] || colors.levy;
    drawArrow(ctx, fx, fy, tx, ty, color, dpr);
  });

  ctx.restore();
}

function drawArrow(ctx, fromX, fromY, toX, toY, color, dpr) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLength = 8 * dpr;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function resize2DDidactic() {
  const canvas = didacticState.canvas2d || ui.canvas2dDidactic;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  didacticState.canvas2d = canvas;
  didacticState.needsRender2D = true;
}

function bindUI() {
  ui.startBtn.addEventListener("click", () => {
    state.running = !state.running;
    ui.startBtn.textContent = state.running ? "Pausar" : "Iniciar";
  });

  ui.resetBtn.addEventListener("click", () => {
    state.running = false;
    ui.startBtn.textContent = "Iniciar";
    resetSimulation();
  });

  ui.speedInput.addEventListener("input", () => {
    state.speedMs = Number(ui.speedInput.value);
    ui.speedValue.textContent = `${state.speedMs} ms`;
  });

  [ui.fnSelect, ui.nestsInput, ui.paInput, ui.alphaInput].forEach((input) => {
    input.addEventListener("change", () => {
      state.running = false;
      ui.startBtn.textContent = "Iniciar";
      resetSimulation();
    });
  });

  window.addEventListener("resize", () => {
    resize2D();
    resize3D();
    resize2DDidactic();
    state.needsRender2D = true;
    state.needsUpdate3D = true;
    didacticState.needsRender2D = true;
    rebuildSurface();
    buildHeatmapDidactic();
  });

  bindDidacticUI();
}

function resetSimulation() {
  state.fnKey = ui.fnSelect.value;
  state.fn = OBJECTIVE_FUNCTIONS[state.fnKey].fn;
  state.nestsCount = clampInt(ui.nestsInput.value, 10, 60, 28);
  state.pa = clampFloat(ui.paInput.value, 0.05, 0.5, 0.25);
  state.alpha = clampFloat(ui.alphaInput.value, 0.1, 1.5, 0.7);

  state.range = computeRange(state.fn, 120);
  state.iter = 0;
  state.nests = createInitialNests(state.nestsCount);
  state.best = findBest(state.nests);

  buildHeatmap();
  rebuildSurface();
  rebuildPoints();

  updateReadout();
  state.needsRender2D = true;
  state.needsUpdate3D = true;
}

function createInitialNests(count) {
  const nests = [];
  for (let i = 0; i < count; i += 1) {
    nests.push(createRandomNest());
  }
  return nests;
}

function createRandomNest() {
  const { min, max } = state.bounds;
  const x = randomInRange(min, max);
  const y = randomInRange(min, max);
  return { x, y, fitness: state.fn(x, y) };
}

function stepSimulation() {
  const nests = state.nests;
  const total = nests.length;

  for (let i = 0; i < total; i += 1) {
    const newNest = levyNest(nests[i]);
    const j = Math.floor(Math.random() * total);
    if (newNest.fitness < nests[j].fitness) {
      nests[j] = newNest;
    }
  }

  const abandonCount = Math.floor(state.pa * total);
  if (abandonCount > 0) {
    nests.sort((a, b) => b.fitness - a.fitness);
    for (let i = 0; i < abandonCount; i += 1) {
      nests[i] = createRandomNest();
    }
  }

  state.best = findBest(nests);
  state.iter += 1;
  updateReadout();
  state.needsRender2D = true;
  state.needsUpdate3D = true;
}

function levyNest(nest) {
  const stepX = levyStep() * state.alpha;
  const stepY = levyStep() * state.alpha;
  let x = nest.x + stepX;
  let y = nest.y + stepY;

  x = clampFloat(x, state.bounds.min, state.bounds.max, x);
  y = clampFloat(y, state.bounds.min, state.bounds.max, y);

  return { x, y, fitness: state.fn(x, y) };
}

function findBest(nests) {
  return nests.reduce((best, current) => (current.fitness < best.fitness ? current : best), nests[0]);
}

function updateReadout() {
  ui.iterValue.textContent = String(state.iter);
  ui.bestValue.textContent = formatNumber(state.best ? state.best.fitness : null);
}

function buildHeatmap() {
  const width = state.canvas2d.width;
  const height = state.canvas2d.height;
  const { min, max } = state.range;
  const heatmap = document.createElement("canvas");
  heatmap.width = width;
  heatmap.height = height;

  const ctx = heatmap.getContext("2d");
  const image = ctx.createImageData(width, height);
  const data = image.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / (width - 1);
      const ny = 1 - y / (height - 1);
      const value = state.fn(lerp(state.bounds.min, state.bounds.max, nx), lerp(state.bounds.min, state.bounds.max, ny));
      const t = normalize(value, min, max);
      const color = colorMap(1 - t);
      const idx = (y * width + x) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  state.heatmapCanvas = heatmap;
}

function render2D() {
  const ctx = state.ctx2d;
  const width = state.canvas2d.width;
  const height = state.canvas2d.height;

  ctx.clearRect(0, 0, width, height);
  if (state.heatmapCanvas) {
    ctx.drawImage(state.heatmapCanvas, 0, 0, width, height);
  }

  const radius = 4 * (window.devicePixelRatio || 1);
  const bestRadius = radius * 1.6;

  ctx.save();
  ctx.fillStyle = "rgba(42, 157, 143, 0.9)";
  ctx.strokeStyle = "rgba(17, 36, 34, 0.6)";
  ctx.lineWidth = 1 * (window.devicePixelRatio || 1);

  state.nests.forEach((nest) => {
    const [cx, cy] = toCanvas(nest.x, nest.y, width, height);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
  });

  if (state.best) {
    const [bx, by] = toCanvas(state.best.x, state.best.y, width, height);
    ctx.fillStyle = "rgba(212, 119, 28, 0.95)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.2 * (window.devicePixelRatio || 1);
    ctx.beginPath();
    ctx.arc(bx, by, bestRadius, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function rebuildSurface() {
  if (!state.three) return;

  const { scene } = state.three;
  if (state.three.surfaceMesh) {
    scene.remove(state.three.surfaceMesh);
    state.three.surfaceMesh.geometry.dispose();
  }

  const segments = 100;
  const size = state.planeSize;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const gridX = i % (segments + 1);
    const gridY = Math.floor(i / (segments + 1));
    const nx = gridX / segments;
    const ny = gridY / segments;
    const x = lerp(state.bounds.min, state.bounds.max, nx);
    const y = lerp(state.bounds.min, state.bounds.max, ny);
    const value = state.fn(x, y);
    positions.setY(i, mapHeight(value));
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x184c58,
    metalness: 0.1,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  state.three.surfaceMesh = mesh;
}

function rebuildPoints() {
  if (!state.three) return;

  const { scene } = state.three;
  if (state.three.points) {
    scene.remove(state.three.points);
    state.three.points.geometry.dispose();
  }

  if (state.three.bestMesh) {
    scene.remove(state.three.bestMesh);
    state.three.bestMesh.geometry.dispose();
  }

  const positions = new Float32Array(state.nests.length * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x2a9d8f,
    size: 0.18,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const bestGeometry = new THREE.SphereGeometry(0.25, 24, 16);
  const bestMaterial = new THREE.MeshStandardMaterial({ color: 0xd4771c });
  const bestMesh = new THREE.Mesh(bestGeometry, bestMaterial);
  scene.add(bestMesh);

  state.three.points = points;
  state.three.bestMesh = bestMesh;

  update3DPoints();
}

function update3DPoints() {
  if (!state.three || !state.three.points) return;

  const positions = state.three.points.geometry.attributes.position.array;
  for (let i = 0; i < state.nests.length; i += 1) {
    const nest = state.nests[i];
    const idx = i * 3;
    positions[idx] = mapToWorld(nest.x);
    positions[idx + 1] = mapHeight(state.fn(nest.x, nest.y)) + 0.05;
    positions[idx + 2] = mapToWorld(nest.y);
  }

  state.three.points.geometry.attributes.position.needsUpdate = true;

  if (state.best && state.three.bestMesh) {
    state.three.bestMesh.position.set(
      mapToWorld(state.best.x),
      mapHeight(state.best.fitness) + 0.25,
      mapToWorld(state.best.y)
    );
  }
}

function renderLoop(time) {
  if (state.running && time - state.lastStepTime >= state.speedMs) {
    stepSimulation();
    state.lastStepTime = time;
  }

  if (didacticState.running && time - didacticState.lastStepTime >= didacticState.speedMs) {
    stepDidactic();
    didacticState.lastStepTime = time;
  }

  if (state.needsRender2D) {
    render2D();
    state.needsRender2D = false;
  }

  if (didacticState.needsRender2D) {
    render2DDidactic();
    didacticState.needsRender2D = false;
  }

  if (state.needsUpdate3D) {
    update3DPoints();
    state.needsUpdate3D = false;
  }

  if (state.three) {
    state.three.controls.update();
    state.three.renderer.render(state.three.scene, state.three.camera);
  }

  requestAnimationFrame(renderLoop);
}

function resize2D() {
  const canvas = state.canvas2d || ui.canvas2d;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  state.canvas2d = canvas;
  state.needsRender2D = true;
}

function resize3D() {
  if (!state.three) return;
  if (!ui.threeContainer) return;
  const rect = ui.threeContainer.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  state.three.camera.aspect = rect.width / rect.height;
  state.three.camera.updateProjectionMatrix();
  state.three.renderer.setSize(rect.width, rect.height, false);
}

function mapToWorld(value) {
  const { min, max } = state.bounds;
  const t = (value - min) / (max - min);
  return (t - 0.5) * state.planeSize;
}

function mapHeight(value) {
  const { min, max } = state.range;
  return normalize(value, min, max) * state.heightScale;
}

function toCanvas(x, y, width, height) {
  const { min, max } = state.bounds;
  const nx = (x - min) / (max - min);
  const ny = (y - min) / (max - min);
  return [nx * width, (1 - ny) * height];
}

function toCanvasByBounds(x, y, width, height, bounds) {
  const nx = (x - bounds.min) / (bounds.max - bounds.min);
  const ny = (y - bounds.min) / (bounds.max - bounds.min);
  return [nx * width, (1 - ny) * height];
}

function computeRange(fn, samples) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < samples; i += 1) {
    const x = lerp(state.bounds.min, state.bounds.max, i / (samples - 1));
    for (let j = 0; j < samples; j += 1) {
      const y = lerp(state.bounds.min, state.bounds.max, j / (samples - 1));
      const value = fn(x, y);
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }

  if (min === max) {
    return { min, max: min + 1 };
  }

  return { min, max };
}

function colorMap(t) {
  const stops = [
    { t: 0, c: [14, 42, 48] },
    { t: 0.35, c: [38, 126, 140] },
    { t: 0.7, c: [223, 186, 122] },
    { t: 1, c: [246, 231, 206] },
  ];

  for (let i = 0; i < stops.length - 1; i += 1) {
    const left = stops[i];
    const right = stops[i + 1];
    if (t >= left.t && t <= right.t) {
      const local = (t - left.t) / (right.t - left.t);
      return [
        lerp(left.c[0], right.c[0], local),
        lerp(left.c[1], right.c[1], local),
        lerp(left.c[2], right.c[2], local),
      ];
    }
  }

  return stops[stops.length - 1].c;
}

function levyStep() {
  const u = randn() * LEVY_SIGMA;
  const v = randn();
  return u / Math.pow(Math.abs(v), 1 / LEVY_BETA);
}

function levySigma(beta) {
  const numerator = gamma(1 + beta) * Math.sin(Math.PI * beta / 2);
  const denominator = gamma((1 + beta) / 2) * beta * Math.pow(2, (beta - 1) / 2);
  return Math.pow(numerator / denominator, 1 / beta);
}

function gamma(z) {
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    0.000009984369578019572,
    0.00000015056327351493116,
  ];

  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }

  z -= 1;
  let x = p[0];
  for (let i = 1; i < p.length; i += 1) {
    x += p[i] / (z + i);
  }

  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function normalize(value, min, max) {
  return clampFloat((value - min) / (max - min), 0, 1, 0);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function clampFloat(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.min(max, Math.max(min, number)));
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) < 0.001 || Math.abs(value) > 10000) {
    return value.toExponential(2);
  }
  return value.toFixed(4);
}

document.addEventListener("DOMContentLoaded", init);
