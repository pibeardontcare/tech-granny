
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gsap } from 'gsap';

console.log('Starting app...');
console.log(THREE);

const API_URL = '/.netlify/functions/articles';
const NANA_ROUTE = '/.netlify/functions/nana_explain';

let scene, camera, renderer, raycaster, mouse, mixer, granny, newspaper;
let shouldStop = false;
let isSpeaking = false;
let useElevenLabs = true;
let currentAudio = null;
let currentSpeakingId = 0;

let isPlaying = false;
let currentArticleIndex = 0;

let playMode = 'articles';
let nanaItems = [];          // [{ title, url, md, source }]
let currentNanaIndex = 0;
let nanaIsPlaying = false;
let nanaIsPreparing = false;

let articles = [];

// Preload browser voices early
speechSynthesis.getVoices();
speechSynthesis.onvoiceschanged = () => {};

// ---------- Netlify daily blob helpers ----------
async function upsertTodayNana(urls, values = []) {
  // Appends any NEW urls to today’s blob (server de-dupes). Sequential on server.
  const res = await fetch(NANA_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, values })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { date, count, items, doc }
}

async function fetchTodayNanaDoc() {
  const res = await fetch(NANA_ROUTE); // GET today’s blob
  if (!res.ok) return null;
  return res.json(); // { date, items, doc }
}


// --- Nana cache helpers (GET first, POST only if needed) ---

async function getCachedNana({ force = false } = {}) {
  const url = force ? `${NANA_ROUTE}?force=true` : NANA_ROUTE;
  const res = await fetch(url);
  if (res.status === 404) return null;   // nothing cached yet
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { source, date?, items, doc, ... }
}

async function seedNanaWithArticles(urls, values = []) {
  // Create/refresh today’s blob on the server with your URLs
  const res = await fetch(NANA_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, values })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { source:'fresh', items, doc, ... } or your shape
}

// ---------- Scene ----------
init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(-0.13027635446298505, 0.1107977817900695, 3.9082043960702997);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x111111, 5.6);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
  dirLight.position.set(3, 10, 5);
  scene.add(dirLight);

  new OrbitControls(camera, renderer.domElement);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Newspaper plane
  const paperW = 0.34, paperH = 0.24;
  const newspaperGeo = new THREE.PlaneGeometry(paperW, paperH, 1, 1);
  const newspaperMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  newspaper = new THREE.Mesh(newspaperGeo, newspaperMat);
  newspaper.position.set(0, 0, 0.8);
  newspaper.rotation.set(-0.15, 0, 0);
  scene.add(newspaper);

  // Models
  const treeLoader = new GLTFLoader();
  treeLoader.load('/models/tree.glb', (gltf) => {
    const tree = gltf.scene;
    tree.scale.set(0.7, 0.7, 0.7);
    tree.position.set(-1.5, -1.5, -0.5);
    scene.add(tree);
  }, undefined, (e) => console.error('Error loading tree model:', e));

  const benchLoader = new GLTFLoader();
  benchLoader.load('/models/park_bench.glb', (gltf) => {
    const bench = gltf.scene;
    bench.scale.set(1, 1, 1);
    bench.position.set(0, -1, 0);
    bench.rotation.y = Math.PI;
    scene.add(bench);
  }, undefined, (e) => console.error('Error loading bench model:', e));

  const loader = new GLTFLoader();
  loader.load('/models/nana.glb', (gltf) => {
    granny = gltf.scene;
    gltf.scene.traverse((node) => {
      if (node.isMesh) {
        const mat = node.material;
        if (mat && mat.isMeshBasicMaterial) {
          node.material = new THREE.MeshStandardMaterial({
            color: mat.color,
            roughness: 0.8,
            metalness: 0.1,
          });
        }
        if (mat && mat.emissive) {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
        if (mat && mat.color) mat.color.multiplyScalar(0.8);
        mat.needsUpdate = true;
      }
    });
    granny.scale.set(1, 1, 1);
    granny.position.set(0, -1, .45);
    scene.add(granny);

    mixer = new THREE.AnimationMixer(granny);
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
  }, undefined, (e) => console.error('Error loading granny model:', e));

  // Floor
  const floorGeometry = new THREE.CircleGeometry(2.5, 64);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 1, metalness: 0 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  scene.add(floor);

  // Resize
  window.addEventListener('resize', onWindowResize);
}

function animate() {
  requestAnimationFrame(animate);
  if (mixer) mixer.update(0.016);
  placeShowBtnAtPaper();
  renderer.render(scene, camera);
}

// ---------- 2D helpers (panel <-> paper) ----------
function worldToScreen(vec3, camera, renderer) {
  const v = vec3.clone().project(camera);
  const halfW = renderer.domElement.clientWidth / 2;
  const halfH = renderer.domElement.clientHeight / 2;
  return { x: (v.x * halfW) + halfW, y: (-v.y * halfH) + halfH };
}

function getPlaneScreenRect(mesh, w, h) {
  const hw = w/2, hh = h/2;
  const corners = [
    new THREE.Vector3(-hw,  hh, 0),
    new THREE.Vector3( hw,  hh, 0),
    new THREE.Vector3( hw, -hh, 0),
    new THREE.Vector3(-hw, -hh, 0),
  ];
  const pts = corners.map(v => mesh.localToWorld(v.clone()))
                     .map(v => worldToScreen(v, camera, renderer));
  const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y);
  const left = Math.min(...xs), right = Math.max(...xs);
  const top  = Math.min(...ys), bottom= Math.max(...ys);
  return { left, top, width: right-left, height: bottom-top, cx:(left+right)/2, cy:(top+bottom)/2 };
}

function placeShowBtnAtPaper() {
  const btn = document.getElementById('showNewsPanel');
  const panelHidden = document.getElementById('newsPanel')?.classList.contains('is-hidden');
  if (!btn || !panelHidden || !newspaper) return;

  const r = getPlaneScreenRect(newspaper, 0.34, 0.24);
  btn.style.position = 'fixed';
  btn.style.left   = `${r.left}px`;
  btn.style.top    = `${r.top}px`;
  btn.style.width  = `${r.width}px`;
  btn.style.height = `${r.height}px`;
  btn.style.display = 'block';
}

async function morphPanelToButton() {
  const panel = document.getElementById('newsPanel');
  const btn   = document.getElementById('showNewsPanel');
  const rect  = panel.getBoundingClientRect();
  const target= getPlaneScreenRect(newspaper, 0.34, 0.24);

  panel.style.willChange = 'transform,opacity';
  panel.style.transformOrigin = 'top left';
  panel.style.position='fixed';
  panel.style.left = rect.left+'px';
  panel.style.top  = rect.top +'px';
  panel.style.width= rect.width+'px';
  panel.style.height=rect.height+'px';

  btn.style.display = 'block';
  placeShowBtnAtPaper();
  btn.style.opacity = 0;

  await Promise.all([
    gsap.to(panel, {
      duration:.45, ease:'power2.inOut', opacity:0,
      onUpdate(){
        const tX = target.cx - (rect.left + rect.width/2);
        const tY = target.cy - (rect.top  + rect.height/2);
        const sX = target.width/rect.width, sY = target.height/rect.height;
        panel.style.transform = `translate(${tX}px,${tY}px) scale(${sX},${sY})`;
      },
      onComplete(){
        panel.classList.add('is-hidden');
        panel.style.transform=''; panel.style.opacity='';
        panel.style.position=''; panel.style.left=''; panel.style.top='';
        panel.style.width=''; panel.style.height=''; panel.style.willChange='';
      }
    }),
    gsap.to(btn, { duration:.45, ease:'power2.inOut', opacity:1 })
  ]);
}

function showMenuFromButton() {
  const panel = document.getElementById('newsPanel');
  const btn   = document.getElementById('showNewsPanel');
  const target= getPlaneScreenRect(newspaper, 0.34, 0.24);

  const full = panel.getBoundingClientRect();
  panel.classList.remove('is-hidden');
  panel.style.position='fixed';
  panel.style.left=full.left+'px'; panel.style.top=full.top+'px';
  panel.style.width=full.width+'px'; panel.style.height=full.height+'px';
  panel.style.transformOrigin='top left';
  const sX = target.width/full.width, sY = target.height/full.height;
  const tX = target.cx - (full.left + full.width/2);
  const tY = target.cy - (full.top  + full.height/2);
  panel.style.transform = `translate(${tX}px,${tY}px) scale(${sX},${sY})`;
  panel.style.opacity = 0;

  gsap.to(panel, { duration:.45, opacity:1, clearProps:'transform', ease:'power2.out',
    onComplete(){ panel.style.position=''; panel.style.left=''; panel.style.top='';
                  panel.style.width=''; panel.style.height=''; }});
  gsap.to(btn,   { duration:.3,  opacity:0, onComplete(){ btn.style.display='none'; }});
}

// ---------- DOM wiring ----------
window.addEventListener('DOMContentLoaded', () => {
  console.log("[DOM] ready, wiring show/hide & Nana");

  const newsPanel    = document.getElementById("newsPanel");
  const showNewsBtn  = document.getElementById("showNewsPanel");
  const hideNewsBtn  = document.getElementById("hideNewsPanel");
  const nanaBtn      = document.getElementById('nanaExplainBtn');
  const nanaOut      = document.getElementById('nanaExplainOut');

  if (!newsPanel || !showNewsBtn || !hideNewsBtn) {
    console.error("[DOM] Missing one or more elements — check IDs: #newsPanel, #showNewsPanel, #hideNewsPanel");
    return;
  }

  // Start CLOSED
  newsPanel.classList.add("is-hidden");
  showNewsBtn.style.display = "block";

  hideNewsBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); morphPanelToButton(); });
  showNewsBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showMenuFromButton(); });

//   




// ----- “Nana’s Take” button: cache-first with optional force refresh -----
setNanaBtnLabel();

// Guard: make sure the button exists
if (!nanaBtn) {
  console.warn('[Nana] #nanaExplainBtn not found in DOM.');
} else {
  nanaBtn.addEventListener('click', async (ev) => {
    // If currently speaking Nana, toggle to pause/stop
    if (nanaIsPlaying) {
      console.log('[Nana] Button clicked while playing → stopping.');
      stopNana();
      return;
    }

    stopAllAudio(); // stop headline playback if any

    // Hold ⌥ (Alt) or ⌘ (Meta) to force-refresh today’s take
    const forceRefresh = !!(ev.altKey || ev.metaKey);
    const status = document.getElementById('status');

    if (nanaIsPreparing) {
      console.log('[Nana] Already preparing; click ignored.');
      return;
    }

    nanaIsPreparing = true;
    setNanaBtnLabel();
    if (status) status.textContent = forceRefresh ? 'Forcing a fresh Nana…' : 'Checking today’s Nana…';

    try {
      // 1) Try to read today’s doc from cache (your function should respect 24h freshness)
      let today = null;
      try {
        const url = forceRefresh ? `${NANA_ROUTE}?force=true` : NANA_ROUTE;
        const res = await fetch(url);
        if (res.ok) {
          today = await res.json();
          console.log('[Nana] Cache check result:', today?.source || 'unknown', today);
        } else if (res.status !== 404) {
          console.warn('[Nana] GET failed:', res.status, await res.text());
        }
      } catch (e) {
        console.warn('[Nana] GET threw:', e);
      }

      // 2) If no items yet (first run today), seed with current articles then read again
      if (!today || !today.items?.length) {
        const urls = (articles || []).map(a => a.url).filter(Boolean);
        if (!urls.length) {
          if (status) status.textContent = 'No articles to analyze yet.';
          nanaIsPreparing = false; setNanaBtnLabel();
          return;
        }

        if (status) status.textContent = 'Nana is reading and thinking…';
        console.log('[Nana] Seeding with URLs:', urls.slice(0, 3));

        // Keep it small; your server can de-dupe/append internally
        await upsertTodayNana(urls.slice(0, 3), [
          'human-centered design',
          'rapid prototyping',
          'storytelling impact',
          'ethics & attribution',
          'open formats',
          'accessibility & performance',
        ]);

        // Read back
        const res2 = await fetch(NANA_ROUTE);
        if (!res2.ok) {
          throw new Error(`After seed, GET failed: ${res2.status} ${await res2.text()}`);
        }
        today = await res2.json();
      }

      // 3) Use items/doc for playback + optional preview
      nanaItems = today.items || [];
      if (!nanaItems.length) {
        if (status) status.textContent = 'No Nana analysis available.';
        nanaIsPreparing = false; setNanaBtnLabel();
        return;
      }

      if (nanaOut && today.doc) {
        nanaOut.textContent = today.doc;
      }

      currentNanaIndex = 0;
      nanaIsPreparing = false;
      setNanaBtnLabel();
      startNanaPlayback();
    } catch (err) {
      console.error('[Nana] Error:', err);
      if (status) status.textContent = 'Failed to synthesize Nana.';
      nanaIsPreparing = false;
      setNanaBtnLabel();
    }
  });
}


// Click on the 3D newspaper to open the panel
renderer?.domElement.addEventListener('pointerdown', (ev) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(newspaper, true);

  if (hits.length) {
    ev.preventDefault();
    ev.stopPropagation();
    const panel = document.getElementById('newsPanel');
    if (panel && panel.classList.contains('is-hidden')) showMenuFromButton();
  }
});

// ---------- Articles UI ----------
async function fetchArticles() {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    return data || [];
  } catch (err) {
    console.error("❌ Error fetching articles:", err);
    return [];
  }
}

async function renderArticles() {
  const headlinesDiv = document.getElementById("headlines");
  const status = document.getElementById("status");

  if (!headlinesDiv || !status) {
    console.error("Missing #headlines or #status");
    return;
  }

  status.textContent = "🕐 Loading articles...";
  articles = await fetchArticles();
  headlinesDiv.innerHTML = "";

  if (!articles.length) {
    status.textContent = "No articles today, dear.";
    speakText("Sorry honey, no XR or AI news today.");
    return;
  }

  status.textContent = `Click a headline to hear it.`;

  for (const article of articles) {
    const title = article.title || "No title";
    const content = article.content || "No summary available.";

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "10px";
    wrapper.style.marginBottom = "0.75rem";

    const el = document.createElement("div");
    el.innerHTML = `<strong>${title}</strong><br><small>${article.source || ''}</small>`;
    el.style.cursor = "pointer";
    el.style.flex = "1";

    const linkBtn = document.createElement("button");
    linkBtn.textContent = "🔗 Read";
    linkBtn.style.padding = "4px 10px";
    linkBtn.style.fontSize = "0.9rem";
    linkBtn.style.cursor = "pointer";

    linkBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.open(article.url, '_blank');
    });

    el.addEventListener("click", async () => {
      cancelSpeaking();
      setPlaybackActive();
      const fullText = await fetchFullArticleText(article.url);
      const textToRead = fullText || `${title}. ${content}`;
      await speakText(`Headline: ${title}. ${textToRead}`);
    });

    wrapper.appendChild(el);
    wrapper.appendChild(linkBtn);
    headlinesDiv.appendChild(wrapper);
  }
}

window.addEventListener('load', async () => {
  try {
    await renderArticles();
  } catch (err) {
    console.error("🔥 Failed to render articles:", err);
  }
});

// ---------- Headline autoplay ----------
function setPlaybackActive() {
  isPlaying = true;
  shouldStop = false;
  const btn = document.getElementById("togglePlayBtn");
  if (btn) btn.textContent = "⏸️ Pause";
}

async function togglePlayPause() {
  if (!articles.length) return;

  if (nanaIsPlaying) {
    stopNana();
    const btn = document.getElementById("togglePlayBtn");
    if (btn) btn.textContent = "▶️ Play";
  }

  const btn = document.getElementById("togglePlayBtn");
  if (!btn) return;

  if (!isPlaying) {
    setPlaybackActive();
    playArticlesFrom(currentArticleIndex);
  } else {
    shouldStop = true;
    isPlaying = false;
    speechSynthesis.cancel();
    btn.textContent = "▶️ Play";
  }
}

async function playArticlesFrom(index) {
  for (; index < articles.length; index++) {
    if (shouldStop) break;
    const a = articles[index];
    const text = `Headline: ${a.title}. ${a.content}`;
    currentArticleIndex = index;
    await speakText(text);
  }

  if (!shouldStop) {
    isPlaying = false;
    currentArticleIndex = 0;
    const btn = document.getElementById("togglePlayBtn");
    if (btn) btn.textContent = "▶️ Play";
    const status = document.getElementById('status');
    if (status) status.textContent = `✔️ All articles played. Click a headline to hear again.`;
  }
}

const playBtn = document.getElementById('togglePlayBtn');
playBtn?.addEventListener('click', togglePlayPause);

// ---------- Fetch full article text (optional on click) ----------
async function fetchFullArticleText(articleUrl) {
  const response = await fetch('/.netlify/functions/fullArticle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: articleUrl })
  });
  if (!response.ok) return null;
  const { content } = await response.json();
  return content;
}

// ---------- Voice helpers ----------
function getPreferredVoice() {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) resolve(voices);
    else speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}

function cancelSpeaking() {
  if (useElevenLabs && currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  isSpeaking = false;
}

async function speakText(text) {
  cancelSpeaking();
  const speakId = ++currentSpeakingId;
  isSpeaking = true;

  try {
    if (useElevenLabs) await speakWithElevenLabs(text, speakId);
    else await speakWithBrowserTTS(text, speakId);
  } catch (err) {
    console.warn("🟡 Preferred voice failed, falling back", err);
    if (useElevenLabs) await speakWithBrowserTTS(text, speakId);
  } finally {
    if (speakId === currentSpeakingId) isSpeaking = false;
  }
}

async function speakWithElevenLabs(text, speakId) {
  const response = await fetch('/.netlify/functions/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (response.status === 401) throw new Error("Unauthorized: ElevenLabs token missing or invalid.");
  if (!response.ok) throw new Error(`TTS Netlify error: ${response.status}`);

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  currentAudio = audio;

  return new Promise((resolve) => {
    audio.onended = () => { if (speakId === currentSpeakingId) resolve(); };
    audio.onerror = resolve;
    audio.play();
  });
}

async function speakWithBrowserTTS(text, speakId) {
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = await getPreferredVoice();
  const voice = voices.find(v => v.name.includes("Tessa") || v.name.includes("Google UK English"));
  utterance.voice = voice || voices[0];
  utterance.rate = 0.9;
  utterance.pitch = 1.0;

  return new Promise((resolve) => {
    utterance.onend = () => { if (speakId === currentSpeakingId) resolve(); };
    utterance.onerror = resolve;
    speechSynthesis.speak(utterance);
  });
}

// ---------- Voice buttons ----------
const readAll = document.getElementById('readAllBtn');
const voiceBtn = document.getElementById('elevenLabsBtn');

readAll?.addEventListener('click', async () => {
  if (!articles.length) return;
  shouldStop = false;
  isSpeaking = true;
  setPlaybackActive();
  useElevenLabs = false; // force browser voice
  for (let i = 0; i < articles.length; i++) {
    if (shouldStop) break;
    const a = articles[i];
    const text = `Headline: ${a.title}. ${a.content}`;
    currentArticleIndex = i;
    await speakText(text);
  }
  isSpeaking = false;
  currentArticleIndex = 0;
});

voiceBtn?.addEventListener('click', async () => {
  cancelSpeaking();
  useElevenLabs = !useElevenLabs;
  if (useElevenLabs) {
    voiceBtn.textContent = '🧠 Voice: ElevenLabs';
    fetchElevenLabsCredits().catch(console.warn);
  } else {
    voiceBtn.textContent = '🔈 Voice: Browser';
  }
});

async function fetchElevenLabsCredits() {
  try {
    const res = await fetch('/.netlify/functions/credits');
    const data = await res.json();
    const remaining = data.characterLimit - data.characterCount;
    const btn = document.getElementById("elevenLabsBtn");
    if (!btn) return;
    if (remaining <= 0) { btn.innerHTML = `🔴 Voice: ElevenLabs (0 left)`; btn.disabled = true; }
    else if (remaining <= 1000) btn.innerHTML = `🟠 Voice: ElevenLabs (${remaining.toLocaleString()} left)`;
    else btn.innerHTML = `🧠 Voice: ElevenLabs (${remaining.toLocaleString()} left)`;
  } catch (err) {
    console.warn("❌ Failed to fetch ElevenLabs credits:", err);
  }
}

// ---------- Nana playback helpers ----------
function setNanaBtnLabel() {
  const btn = document.getElementById('nanaExplainBtn');
  if (!btn) return;
  if (nanaIsPreparing) { btn.textContent = '⏳ Preparing Nana…'; btn.disabled = true; return; }
  btn.disabled = false;
  btn.textContent = nanaIsPlaying ? '⏸️ Pause explaining' : '▶️ Nana’s Take';
}

function stopAllAudio() {
  shouldStop = true;
  isSpeaking = false;
  speechSynthesis.cancel();
  if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null; }
}

function stopNana() {
  nanaIsPlaying = false;
  shouldStop = true;
  setNanaBtnLabel();
}

function startNanaPlayback() {
  playMode = 'nana';
  nanaIsPlaying = true;
  shouldStop = false;
  setNanaBtnLabel();
  playNanaFrom(currentNanaIndex);
}

});
function mdToSpeech(md = '') {
  // Basic markdown → readable text
  return md
    .replace(/`{1,3}[^`]*`{1,3}/g, '')            // inline/code blocks
    .replace(/^#{1,6}\s*/gm, '')                  // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')            // bold
    .replace(/\*([^*]+)\*/g, '$1')                // italics
    .replace(/^-+\s*$/gm, '')                     // hr
    .replace(/^\s*[-*]\s+/gm, '• ')               // bullets
    .replace(/\n{3,}/g, '\n\n')                   // collapse newlines
    .trim();
}

async function playNanaFrom(index) {
  for (; index < nanaItems.length; index++) {
    if (shouldStop) break;
    const item = nanaItems[index];
    const speech = `${item.title}. ${mdToSpeech(item.md)}`;
    currentNanaIndex = index;
    await speakText(speech);
  }
  if (!shouldStop) {
    nanaIsPlaying = false;
    currentNanaIndex = 0;
    setNanaBtnLabel();
    const status = document.getElementById('status');
    if (status) status.textContent = '✔️ Nana finished.';
  }
}

// ---------- Window resize ----------
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
