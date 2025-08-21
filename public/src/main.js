import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { gsap } from 'gsap';


console.log('Starting app...');
console.log(THREE); // This should be a large object with all of Three.js

const API_URL = '/.netlify/functions/articles';
let shouldStop = false;
let articles = [];
// 👇 Add this to preload voices on page load
speechSynthesis.getVoices(); // Trigger voice load
speechSynthesis.onvoiceschanged = () => {

};


function setPlaybackActive() {
  isPlaying = true;
  shouldStop = false;

  const btn = document.getElementById("togglePlayBtn");
  if (btn) {
    btn.textContent = "⏸️ Pause";
  }
}



// Playback modes & Nana state
let playMode = 'articles';         
let nanaItems = [];               
let currentNanaIndex = 0;
let nanaIsPlaying = false;
let nanaIsPreparing = false;
let nanaIsPaused = false;
let isSpeaking = false;
let useElevenLabs = true; 
let currentAudio = null;
let currentSpeakingId = 0;

// --- Nana stall phrases (rotate while summaries load) ---
const NANA_STALLS = [
  "Hang on, honey… let me find my glasses.",
  "Now where did I put my notes… one second, dear.",
  "Give Nana a tick, I’m tidying these clippings.",
  "Just a moment, sweetheart… almost ready.",
  "Let me warm up my voice… la la la… alright!"
];

function randomStall() {
  return NANA_STALLS[Math.floor(Math.random() * NANA_STALLS.length)];
}


let nanaStallLoopActive = false;

async function stallUntilFirstSummary({ maxMs = 20000 } = {}) {
  nanaStallLoopActive = true;
  const start = Date.now();

  while (nanaStallLoopActive && nanaItems.length === 0) {
    // speak one stall line
    await speakText(randomStall());
    // stop if we got a summary or timed out
    if (nanaItems.length > 0 || (Date.now() - start) > maxMs) break;
  }

  nanaStallLoopActive = false;
}

const nanaIntroLines = [
  "Now hang on while I get my glasses...",
  "Sometimes it just takes me a minute to read all these articles...",
  "I'm retired, I have all the time in the world — just give me a second.",
  "Ooh, look at all these fancy tech articles. Let me get situated.",
  "Alright sweetheart, give me a moment to get comfortable before we dive in."
];


let scene, camera, renderer, raycaster, mouse, mixer, granny, newspaper, controls;


async function runNanaSummaries(articlesPayload) {
  const res = await fetch('/.netlify/functions/summarizeFromFullArticle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // server accepts { articles:[...] } or { results:[...] }
    body: JSON.stringify({ articles: articlesPayload }),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error('nana_summaries raw error:', raw);
    throw new Error(`nana_summaries failed (${res.status})`);
  }
  // Expect: { ok, url, itemsCount, items, already?, playNow? }
  return JSON.parse(raw);
}




async function runNanaTake() {
  const status = document.getElementById('status');
  if (status) status.textContent = 'Nana is thinking…';

  try {
    // Build payload for the server (must include fullText/content)
    const results = articles
      .map(a => ({ url: a.url, title: a.title, content: a.fullText || a.content || '' }))
      .filter(r => r.content);

    if (!results.length) {
      if (status) status.textContent = 'No full articles to summarize.';
      return;
    }

    stopAllAudio();
    nanaItems = [];
    playMode = 'nana';
    nanaIsPreparing = true;
    currentNanaIndex = 0;
    setNanaBtnLabel();

    // 🔔 Single call — the function itself handles doc re-use/early exit
    const out = await runNanaSummaries(results);

    if (!out.ok) throw new Error(out.error || 'Unknown error');

    if (status && out.url) {
      status.innerHTML = `Nana’s Summaries saved to <a target="_blank" href="${out.url}">today’s doc</a>…`;
    }

    // Map server items -> TTS queue (use `summary`, not `md`)
    nanaItems = (out.items || []).map(it => ({
      title: it.title || it.url || 'Untitled',
      summary: it.summary || ''
    }));

    nanaIsPreparing = false;
    setNanaBtnLabel();

    // Start playback immediately if server says doc already existed,
    // otherwise start if we have items and we're not already playing.
    if (out.playNow || (nanaItems.length && !nanaIsPlaying && !shouldStop)) {
      currentNanaIndex = 0;
      //startNanaPlayback();
      stallOrPlaySummaries();

    }

    if (status) status.textContent =
      `Nana explained ${nanaItems.length || 0} article(s).`;

  } catch (err) {
    console.error('nana_summaries failed:', err);
    const status = document.getElementById('status');
    if (status) status.textContent = 'Nana crashed (see console).';
    nanaIsPreparing = false;
    setNanaBtnLabel();
  }
}

// Init scene

init();
animate();

// newspaper helpoer funciton 
function worldToScreen(vec3, camera, renderer) {
  const v = vec3.clone().project(camera);
  const halfW = renderer.domElement.clientWidth / 2;
  const halfH = renderer.domElement.clientHeight / 2;
  return { x: (v.x * halfW) + halfW, y: (-v.y * halfH) + halfH };
}


// make a newspaper plane
const paperW = 0.34, paperH = 0.24;
const newspaperGeo = new THREE.PlaneGeometry(paperW, paperH, 1, 1);
const newspaperMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
newspaper = new THREE.Mesh(newspaperGeo, newspaperMat); // no const here
newspaper.position.set(0, 0, 0.8);
newspaper.rotation.set(-0.15, 0, 0);
scene.add(newspaper);

// call while the paper is shown
function tick() {
  requestAnimationFrame(tick);
  if (mixer) mixer.update(0.016);

  renderer.render(scene, camera);
}
tick();






function getPlaneScreenRect(mesh, w, h){
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
//2

function placeShowBtnAtPaper(){
  const btn = document.getElementById('showNewsPanel');
  const panelHidden = document.getElementById('newsPanel')?.classList.contains('is-hidden');
  if (!btn || !panelHidden || !newspaper) return;

  const r = getPlaneScreenRect(newspaper, 0.34, 0.24);
  btn.style.position = 'fixed';            // <-- add this
  btn.style.left   = `${r.left}px`;
  btn.style.top    = `${r.top}px`;
  btn.style.width  = `${r.width}px`;
  btn.style.height = `${r.height}px`;
  btn.style.display = 'block';
}




function showMenuFromButton(){
  const panel = document.getElementById('newsPanel');
  const btn   = document.getElementById('showNewsPanel');
  const target= getPlaneScreenRect(newspaper, 0.34, 0.24);

  // start panel at the button’s rect
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

////Three .JS scene stuff 
function init() {
  // Scene setup
  scene = new THREE.Scene();
 
  scene.background = new THREE.Color(0x87CEEB); 


  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);

 camera.position.set(
  -0.13027635446298505,
   0.1107977817900695,
   3.9082043960702997
);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x111111, 5.6);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
  dirLight.position.set(3, 10, 5);
  scene.add(dirLight);

  // Controls
  new OrbitControls(camera, renderer.domElement);

  // Raycasting
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();


  //load the tree 
  const treeLoader = new GLTFLoader();
treeLoader.load('/models/tree.glb', (gltf) => {
  let tree = gltf.scene;
  tree.scale.set(0.7, 0.7, 0.7); 
  tree.position.set(-1.5, -1.5, -0.5); 
  scene.add(tree);
}, undefined, (error) => {
  console.error('Error loading tree model:', error);
});

  // Load Bench model
const benchLoader = new GLTFLoader();
benchLoader.load('/models/park_bench.glb', (gltf) => {
  const bench = gltf.scene;
  bench.scale.set(1, 1, 1);
  bench.position.set(0, -1, 0); 
  bench.rotation.y = Math.PI; 
  scene.add(bench);
}, undefined, (error) => {
  console.error('Error loading bench model:', error);
});



  // Load Granny model
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

        if (mat && mat.color) {
          mat.color.multiplyScalar(0.8);
        }

        mat.needsUpdate = true;
      }
    });

    granny.scale.set(1, 1, 1);
   
    granny.position.set(0, -1, .45);
    scene.add(granny);

    mixer = new THREE.AnimationMixer(granny);
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
  }, undefined, (error) => {
    console.error('Error loading granny model:', error);
  });

  // Floor
  const floorGeometry = new THREE.CircleGeometry(2.5, 64); 

  const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x228B22, // forest green
  roughness: 1,
  metalness: 0
});
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
  
  renderer.render(scene, camera);
}



// ----------------------------
// News Fetching & Interaction
// ----------------------------




window.addEventListener('DOMContentLoaded', () => {


  const panel = document.getElementById('newsPanel');
  const showBtn = document.getElementById('showNewsPanel');
  const hideBtn = document.getElementById('hideNewsPanel');

  // ensure closed on load
  panel.classList.add('is-hidden');

  // show the invisible overlay aligned to the paper
  showBtn.style.display = 'block';
  placeShowBtnAtPaper();

  // fallback/open via DOM button (same animation as raycast)
  showBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (panel.classList.contains('is-hidden')) {
      showMenuFromButton();
    }
  });

  // close via "Hide News" button
  hideBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    morphPanelToButton();
  });
  console.log("[DOM] ready");

  // ---- Nana explain wiring (ALWAYS runs) ----
  const nanaBtn = document.getElementById('nanaExplainBtn');
  setNanaBtnLabel();


  const playArticlesBtn = document.getElementById('playArticlesBtn');
  if (playArticlesBtn) {
    playArticlesBtn.addEventListener('click', async () => {
      console.log("🟢 [playArticlesBtn] clicked");

      if (!articles.length) {
        console.warn("⚠️ No articles loaded yet. Fetching now...");
        articles = await fetchArticles(); // fallback
      }

      const merged = await preloadAllFullArticles(articles); // fetch full text + save
      console.log("📦 [playArticlesBtn] saved merged articles:", merged);

      if (merged.length) {
        console.log(`✅ [playArticlesBtn] ${merged.length} articles sent to Google Doc.`);
      } else {
        console.log("🟡 [playArticlesBtn] No new articles to add to doc.");
      }
    });
  } else {
    console.warn("🚫 playArticlesBtn not found in DOM.");
  }
  async function fetchTodaySummaries() {
    console.log("📥 Fetching today’s summaries (read-only)...");
    try {
      const res = await fetch('/.netlify/functions/getSummaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!res.ok) {
        console.warn("⚠️ getSummaries failed:", res.status);
        return [];
      }
      const out = await res.json().catch(() => ({}));
      const items = Array.isArray(out?.items) ? out.items : [];
      console.log("📦 getSummaries items:", items.map(i => i.title));
      return items;
    } catch (err) {
      console.error("❌ getSummaries error:", err);
      return [];
    }
  }

  async function playSummariesOnce() {
    playMode = 'nana';
    nanaIsPlaying = true;
    shouldStop = false;
    setNanaBtnLabel();

    for (let i = 0; i < nanaItems.length; i++) {
      if (shouldStop) break;
      const it = nanaItems[i];
      const preface = (i === 0) ? "Okay, here’s the first article." : "Here’s the next one.";
      const speech = `${preface} ${it.title}. ${it.summary || ''}`;
      console.log("🗣️ Reading summary:", { i, title: it.title, len: speech.length });
      currentNanaIndex = i;
      await speakText(speech);
    }

    nanaIsPlaying = false;
    currentNanaIndex = 0;
    setNanaBtnLabel();
    const status = document.getElementById('status');
    if (status) status.textContent = '✔️ Nana finished today’s summaries.';
  }

  if (!nanaBtn) {
  console.error("[DOM] Missing #nanaExplainBtn — Nana won’t work.");
} else {
  nanaBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log("[DOM] Nana button clicked");

    // If playing and not paused -> pause (do NOT restart)
    if (nanaIsPlaying && !nanaIsPaused) {
      pauseNana();
      return;
    }

    // If playing and paused -> resume (continue where we left off)
    if (nanaIsPlaying && nanaIsPaused) {
      resumeNana();
      return;
    }

    // Otherwise: start normal flow (fresh start)
    stopAllAudio();            // hard stop anything else (articles etc)
    nanaItems = [];
    currentNanaIndex = 0;
    nanaIsPaused = false;

    try {
      setNanaBtnLabel();

      // 1) Try read-only first (play if today’s summaries already exist)
    
    //////

    /////




    /////


    // First, check if a doc already exists for today
const existing = await fetchTodaySummaries();
if (existing.length) {
  nanaItems = existing.map(it => ({ title: it.title, summary: it.summary }));
  console.log("✅ Playing existing summaries");
  await playSummariesOnce();
  return;
}

// 2) Otherwise, create today’s summaries (with gentle stall chatter while it runs)
console.log("🛠️ No existing summaries. Creating via runNanaTake()...");
nanaIsPreparing = true;
setNanaBtnLabel();

// Kick off summary generation in the background
const genPromise = runNanaTake();

// Speak up to 5 “getting ready” lines, but stop early as soon as summaries arrive
const chatter = [
  "Now hang on while I get my glasses…",
  "Sometimes it just takes me a minute to read all these articles…",
  "You know, I’m retired. I’ve got all the time in the world to read, just give me a second.",
  "Oooh! So many headlines today. Let me skim through them real quick.",
  "Don’t rush me dear, I want to make sure I understand everything before I explain it to you."
];

for (let i = 0; i < chatter.length; i++) {
  if (nanaItems.length) break;   // stop stall if summaries show up mid-way
  await speakText(chatter[i]);
}

// Ensure the generator is finished if it wasn’t done during chatter
await genPromise;
nanaIsPreparing = false;
setNanaBtnLabel();

// If summaries arrived, start playing immediately
if (nanaItems.length) {
  console.log("✅ Summaries ready. Playing now...");
  await playSummariesOnce();
  return;
}

    
//     // 2) Otherwise, fall back to creating today’s summaries (with stall chatter)
// console.log("🛠️ No existing summaries. Creating via runNanaTake()...");
// nanaIsPreparing = true;

// // 2a) Stall with Nana chatter while preparing summaries
// const chatter = [
//   "Now hang on while I get my glasses…",
//   "Sometimes it just takes me a minute to read all these articles…",
//   "You know, I’m retired. I’ve got all the time in the world to read, just give me a second.",
//   "Oooh! So many headlines today. Let me skim through them real quick.",
//   "Don’t rush me dear, I want to make sure I understand everything before I explain it to you."
// ];
// for (let i = 0; i < chatter.length; i++) {
//   if (nanaItems.length) break; // in case summaries finish fast
//   await speakText(chatter[i]);
// }

// await runNanaTake();   // your pipeline that fills nanaItems or writes the doc
// nanaIsPreparing = false;

    
    
    
//       // const existing = await fetchTodaySummaries();
//       // if (existing.length) {
//       //   nanaItems = existing.map(it => ({ title: it.title, summary: it.summary }));
//       //   console.log("✅ Playing existing summaries");
//       //   await playSummariesOnce();
//       //   return;
//       // }

//       // // 2) Otherwise, fall back to creating today’s summaries (no stall chatter)
//       // console.log("🛠️ No existing summaries. Creating via runNanaTake()...");
//       // nanaIsPreparing = true;
//       // await runNanaTake();   // your pipeline that fills nanaItems or writes the doc
//       // nanaIsPreparing = false;



//////


/////


      // If the creator didn't populate nanaItems, try fetching once more from Google
      if (!nanaItems.length) {
        console.log("🔁 Creation finished but nanaItems empty; re-fetching summaries...");
        const created = await fetchTodaySummaries();
        nanaItems = created.map(it => ({ title: it.title, summary: it.summary }));
      }

      if (nanaItems.length) {
        console.log("▶️ Playing newly created summaries");
        await playSummariesOnce();
      } else {
        console.warn("🟡 Still no summaries after creation.");
        await speakText("Sorry dear, I don’t see today’s summaries yet.");
      }
    } catch (err) {
      console.error("❌ Nana click flow failed:", err);
      await speakText("Hmm, something went wrong fetching the summaries, dear.");
    } finally {
      nanaIsPlaying = false;
      nanaIsPaused = false;
      currentNanaIndex = 0;
      setNanaBtnLabel();
    }
  });
}

});












renderer.domElement.addEventListener('pointerdown', (ev) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(newspaper, true);

  // Open the panel only when the paper is clicked and the panel is currently closed
  if (hits.length) {
    ev.preventDefault();
    ev.stopPropagation();

    const panel = document.getElementById('newsPanel');
    if (panel && panel.classList.contains('is-hidden')) {
      showMenuFromButton();
    }
  }


   console.log("[Raycast] pointerdown", { x: mouse.x.toFixed(2), y: mouse.y.toFixed(2), hits: hits.length });
});

async function fetchArticles() {
  console.log("📡 Fetching articles...");

  try {
    console.log("trying to fetch articles from:", API_URL);
   

  

    const response = await fetch('/.netlify/functions/articles');
    const data = await response.json();

    console.log("✅ Raw data returned:", data);  

    // OLD: return data.articles || [];
  return data || []; // ✅ This matches what your function returns (an array directly)

   
  } catch (err) {
    console.error("❌ Error fetching articles:", err);
    return [];
  }
}



function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
async function preloadAllFullArticles(articles) {
  console.log("📰 Articles to preload:", articles.length);

  const mergedList = [];
  const seen = new Set(); // (optional) dedupe by URL within this run

  for (const article of articles) {
    const url = article.url || '';
    if (url && seen.has(url)) continue;
    if (url) seen.add(url);

    console.log(`🔍 Checking article: ${article.title}`);

    try {
      // fetch once (use existing cache if present)
      const fullText = article.fullText || await fetchFullArticleText(url);

      if (!fullText) {
        console.warn(`⚠️ No content for ${url}`);
        continue;
      }

      article.fullText = fullText; // cache on the object for playback
      mergedList.push({
        title: article.title || 'Untitled',
        url,
        content: fullText
      });

      console.log(`✅ Preloaded: ${article.title}`);
    } catch (e) {
      console.warn(`❌ Failed to fetch full text for ${url}:`, e.message);
    }
  }

  // (optional) pretty log of what we’ll save
  if (mergedList.length) {
    const combined = mergedList
      .map(a => `# ${a.title}\n${a.url}\n\n${a.content}`)
      .join('\n\n---\n\n');
    console.log('\n=== 🧾 MERGED FULL ARTICLES ===\n');
    console.log(combined);
    console.log('\n================================\n');
  }

  // ✅ Save to your Netlify function (Google Docs)
  // inside preloadAllFullArticles, after mergedList is built
try {
  const res = await fetch('/.netlify/functions/saveDailyDoc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles: mergedList }),
  });

  const raw = await res.text();      // ⬅️ read raw first
  if (!res.ok) {
    console.error('saveDailyDoc raw error:', raw); // shows TypeError stack
    throw new Error(`saveDailyDoc failed (${res.status})`);
  }

  const out = JSON.parse(raw);
  console.log('📝 Daily Doc:', out);
  const status = document.getElementById('status');
  if (status && out.url) {
    status.innerHTML = `Saved to <a target="_blank" href="${out.url}">${out.title || 'today’s doc'}</a> (${out.added} new, ${out.skipped} skipped).`;
  }
} catch (err) {
  console.error('Failed to save Daily Doc:', err);
}


  return mergedList; 
}



async function renderArticles() {
  console.log("📦 renderArticles() started");

  const headlinesDiv = document.getElementById("headlines");
  const status = document.getElementById("status");

  if (!headlinesDiv || !status) {
    console.error("🚫 headlines or status element missing");
    return;
  }

  status.textContent = "🕐 Loading articles...";

  // inside renderArticles()
articles = await fetchArticles();
await preloadAllFullArticles(articles);



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
    el.innerHTML = `<strong>${title}</strong><br><small>${article.source}</small>`;
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
      console.log(`🎤 Reading preloaded article from: ${article.url}`);
      const result = await fetchFullArticleText(article.url);
console.log(`🔍 Raw result for ${article.title}:`, result);

      const textToRead = article.fullText || `${title}. ${content}`;
      await speakText(`Headline: ${title}. ${textToRead}`);
    });

    wrapper.appendChild(el);
    wrapper.appendChild(linkBtn);
    headlinesDiv.appendChild(wrapper);
  }
}


// ----------------------------
// Voice & Interaction Helpers
// ----------------------------




async function speakText(text) {
//dont cancel

  const speakId = ++currentSpeakingId; 
  isSpeaking = true;

  try {
    if (useElevenLabs) {
      await speakWithElevenLabs(text, speakId);
    } else {
      await speakWithBrowserTTS(text, speakId);
    }
  } catch (err) {
    console.warn("🟡 Preferred voice failed, falling back", err);
    if (useElevenLabs) {
      await speakWithBrowserTTS(text, speakId); // fallback
    } else {
      console.warn("⚠️ Both voice systems failed.");
    }
  } finally {
    if (speakId === currentSpeakingId) {
      isSpeaking = false;
    }
  }
}


function getPreferredVoice() {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) {
      resolve(voices);
    } else {
      speechSynthesis.onvoiceschanged = () => {
        resolve(speechSynthesis.getVoices());
      };
    }
  });
}

function cancelSpeaking() {
  if (useElevenLabs && currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }

  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }

  isSpeaking = false;
}



async function speakWithElevenLabs(text, speakId) {
  const response = await fetch('/.netlify/functions/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (response.status === 401) {
  throw new Error("Unauthorized: ElevenLabs token missing or invalid.");
}


  if (!response.ok) throw new Error(`TTS Netlify error: ${response.status}`);

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  currentAudio = audio;

  console.log("🎧 Playing ElevenLabs voice...");

  return new Promise((resolve) => {
    audio.onended = () => {
      if (speakId === currentSpeakingId) resolve();
    };
    audio.onerror = resolve;
    audio.play();
  });
}

async function speakWithBrowserTTS(text, speakId) {
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = await getPreferredVoice();
  const voice = voices.find(v =>
    v.name.includes("Tessa") || v.name.includes("Google UK English")
  );
  utterance.voice = voice || voices[0];
  utterance.rate = 0.9;
  utterance.pitch = 1.0;

  return new Promise((resolve) => {
    utterance.onend = () => {
      if (speakId === currentSpeakingId) resolve();
    };
    utterance.onerror = resolve;
    speechSynthesis.speak(utterance);
  });
}


window.addEventListener('load', async () => {
  try {
    console.log("📰 Page loaded, calling renderArticles()");
    await renderArticles();
  } catch (err) {
    console.error("🔥 Failed to render articles:", err);
  }
});



let isPlaying = false;
console.log("🔁 isPlaying initialized:", isPlaying);
let currentArticleIndex = 0;


async function togglePlayPause() {
  console.log("🎯 togglePlayPause called");
  console.log("📦 articles loaded?", articles.length > 0);
  console.log("🟡 isPlaying before toggle:", isPlaying);

  if (!articles.length) {
    console.warn("⚠️ No articles available to play.");
    return;
  }

  // If Nana is currently explaining, stop her and then proceed with headlines
if (nanaIsPlaying) {
  stopNana();
  const btn = document.getElementById("togglePlayBtn");
  if (btn) btn.textContent = "▶️ Play";
  // continue into the rest of your headline toggle logic...
}

  const btn = document.getElementById("togglePlayBtn");
  if (!btn) {
    console.error("🚫 Button not found at time of toggle.");
    return;
  }

 if (!isPlaying) {
  setPlaybackActive();

    console.log("▶️ Starting playback from index:", currentArticleIndex);

    setTimeout(() => {
      if (isPlaying) {
        btn.textContent = "⏸️ Pause"; // ⬅ fallback in case it was overwritten
      }
    }, 100);

    playArticlesFrom(currentArticleIndex); // fire-and-forget
  } else {
    shouldStop = true;
    isPlaying = false;
    speechSynthesis.cancel();
    btn.textContent = "▶️ Play";
    console.log("⏸️ Paused playback. Current index:", currentArticleIndex);
  }

  console.log("🟢 isPlaying after toggle:", isPlaying);
}

async function playArticlesFrom(index) {
  for (; index < articles.length; index++) {
    if (shouldStop) break;

    const article = articles[index];
    const text = `Headline: ${article.title}. ${article.content}`;
    currentArticleIndex = index;
    

    await speakText(text); // blocking, but will now pause if `speechSynthesis.cancel()` was called
  }


  // If finished naturally
  if (!shouldStop) {
    isPlaying = false;
    currentArticleIndex = 0;
    document.getElementById("togglePlayBtn").textContent = "▶️ Play";
    const status = document.getElementById('status');
    if (status) status.textContent = '✔️ All articles played...';



  }
}

async function fetchFullArticleText(articleUrl) {
  const response = await fetch('/.netlify/functions/fullArticle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: articleUrl })
  });

  if (!response.ok) {
    console.warn("❌ Failed to fetch full article:", await response.text());
    return null;
  }

  const { content } = await response.json();
  return content;
}



///read all button logic 
async function readAllWithGoogleVoice() {
  console.log("🗣️ Reading all articles with Google Voice");
  if (!articles.length) {
    console.warn("⚠️ No articles to read.");
    return;
  }

  shouldStop = false;
  isSpeaking = true;
  setPlaybackActive(); 

  useElevenLabs = false; // Force browser voice

  for (let i = 0; i < articles.length; i++) {
    if (shouldStop) break;

    const article = articles[i];
    const text = `Headline: ${article.title}. ${article.content}`;
    currentArticleIndex = i;
    await speakText(text); // Uses browser voice since ElevenLabs is off
  }

  isSpeaking = false;
  currentArticleIndex = 0;
}

async function fetchElevenLabsCredits() {
  try {
    const res = await fetch('/.netlify/functions/credits');
    const data = await res.json();

    const used = data.characterCount;
    const limit = data.characterLimit;
    const remaining = limit - used;

    const btn = document.getElementById("elevenLabsBtn");
    if (btn) {
      if (remaining <= 0) {
        btn.innerHTML = `🔴 Voice: ElevenLabs (0 left)`;
        btn.disabled = true; // optional: disable the button
      } else if (remaining <= 1000) {
        btn.innerHTML = `🟠 Voice: ElevenLabs (${remaining.toLocaleString()} left)`;
      } else {
        btn.innerHTML = `🧠 Voice: ElevenLabs (${remaining.toLocaleString()} left)`;
      }
    }
  } catch (err) {
    console.warn("❌ Failed to fetch ElevenLabs credits:", err);
  }
}


//jhelpewrs


// function setNanaBtnLabel() {
//   const btn = document.getElementById('nanaExplainBtn');
//   if (!btn) return;
//   if (nanaIsPreparing) {
//     btn.textContent = '⏳ Preparing Nana…';
//     btn.disabled = true;
//     return;
//   }
//   btn.disabled = false;
//   btn.textContent = nanaIsPlaying ? '⏸️ Pause explaining' : '▶️ Nana’s Take';
// }


function setNanaBtnLabel() {
  const nanaBtn = document.getElementById('nanaExplainBtn');
  if (!nanaBtn) return;

  if (nanaIsPreparing) {
    nanaBtn.textContent = "▶ Play Nana’s Take (still loading…)";
  } else if (nanaIsPlaying && nanaIsPaused) {
    nanaBtn.textContent = "▶ Resume Nana’s Take";
  } else if (nanaIsPlaying) {
    nanaBtn.textContent = "⏸ Pause Nana’s Take";
  } else {
    nanaBtn.textContent = "▶ Play Nana’s Take";
  }
}


// function setNanaBtnLabel() {
//   const btn = document.getElementById('nanaExplainBtn');
//   if (!btn) return;
//   if (nanaIsPreparing) {
//     btn.textContent = '⏳ Preparing Nana…';
//     btn.disabled = true;
//     return;
//   }
//   btn.disabled = false;

//   if (nanaIsPlaying) {
//     btn.textContent = nanaIsPaused ? '▶️ Resume Nana' : '⏸️ Pause explaining';
//   } else {
//     btn.textContent = '▶️ Nana’s Take';
//   }
// }

function stopAllAudio() {
  shouldStop = true;
  nanaStallLoopActive = false;   // <— add this
  isSpeaking = false;
  speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}


function pauseNana() {
  nanaIsPaused = true;

  // Pause ElevenLabs audio if that's what's playing
  if (useElevenLabs && currentAudio && !currentAudio.paused) {
    currentAudio.pause();
  }

  // Pause browser TTS if that's what's playing
  if (speechSynthesis.speaking && !speechSynthesis.paused) {
    speechSynthesis.pause();
  }

  setNanaBtnLabel();
}

function resumeNana() {
  // If we have ElevenLabs audio paused, resume that
  if (useElevenLabs && currentAudio && currentAudio.paused) {
    currentAudio.play().catch(console.warn);
  }

  // If browser TTS is paused, resume it
  if (speechSynthesis.paused) {
    speechSynthesis.resume();
  }

  nanaIsPaused = false;
  setNanaBtnLabel();
}

function stopNana() {
  nanaIsPlaying = false;
  nanaStallLoopActive = false;   // <— add this
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


async function playNanaFrom(index) {
  while (!shouldStop) {
    for (; index < nanaItems.length; index++) {
      const item = nanaItems[index];
      const preface = (index === 0)
        ? "Okay, here’s the first article."
        : "Here’s the next one.";

      const speech = `${preface} ${item.title}. ${item.summary || ''}`;
      currentNanaIndex = index;

      console.log("🗣️ Nana speaking:", speech.slice(0, 500));

      await speakText(speech);
      if (shouldStop) break;
    }

    if (shouldStop) break;
    if (!nanaIsPreparing) break;

    // Wait for more streamed items
    await new Promise(r => setTimeout(r, 300));
  }

  if (!shouldStop) {
    nanaIsPlaying = false;
    currentNanaIndex = 0;
    setNanaBtnLabel();
    const status = document.getElementById('status');
    if (status) status.textContent = '✔️ Nana finished.';
  }

}




function morphPanelToButton() {
  const panel = document.getElementById('newsPanel');
  const btn = document.getElementById('showNewsPanel');
  if (!panel || !btn || !newspaper) return;

  const target = getPlaneScreenRect(newspaper, 0.34, 0.24);
  const full = panel.getBoundingClientRect();

  panel.style.position = 'fixed';
  panel.style.left = full.left + 'px';
  panel.style.top = full.top + 'px';
  panel.style.width = full.width + 'px';
  panel.style.height = full.height + 'px';
  panel.style.transformOrigin = 'top left';

  const sX = target.width / full.width;
  const sY = target.height / full.height;
  const tX = target.cx - (full.left + full.width / 2);
  const tY = target.cy - (full.top + full.height / 2);

  gsap.to(panel, {
    duration: 0.45,
    transform: `translate(${tX}px, ${tY}px) scale(${sX}, ${sY})`,
    opacity: 0,
    ease: 'power2.in',
    onComplete() {
      panel.classList.add('is-hidden');
      panel.style.position = '';
      panel.style.left = '';
      panel.style.top = '';
      panel.style.width = '';
      panel.style.height = '';
      panel.style.transform = '';
      panel.style.opacity = '';
    }
  });

  btn.style.display = 'block';
  btn.style.opacity = 0;
  gsap.to(btn, { duration: 0.3, opacity: 1 });
}
