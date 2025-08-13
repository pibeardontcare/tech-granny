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





let scene, camera, renderer, raycaster, mouse, mixer, granny, newspaper, controls;



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
  placeShowBtnAtPaper();
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

// function placeShowBtnAtPaper(){
//   const btn = document.getElementById('showNewsPanel');
//   const panelHidden = document.getElementById('newsPanel')?.classList.contains('is-hidden');
//   if (!btn || !panelHidden || !newspaper) return;

//   const r = getPlaneScreenRect(newspaper, 0.34, 0.24); // your plane size
//   btn.style.left   = `${r.left}px`;
//   btn.style.top    = `${r.top}px`;
//   btn.style.width  = `${r.width}px`;
//   btn.style.height = `${r.height}px`;
//   btn.style.display = 'block';
// }


async function morphPanelToButton(){
  const panel = document.getElementById('newsPanel');
  const btn   = document.getElementById('showNewsPanel');
  const rect  = panel.getBoundingClientRect();
  const target= getPlaneScreenRect(newspaper, 0.34, 0.24);

  // lock panel
  panel.style.willChange = 'transform,opacity';
  panel.style.transformOrigin = 'top left';
  panel.style.position='fixed';
  panel.style.left = rect.left+'px';
  panel.style.top  = rect.top +'px';
  panel.style.width= rect.width+'px';
  panel.style.height=rect.height+'px';

  // reveal button at the paper
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


function init() {
  // Scene setup
  scene = new THREE.Scene();
 
  scene.background = new THREE.Color(0x87CEEB); // light sky blue


  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  // camera.position.set(0, 1.6, 3);
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
  tree.scale.set(0.7, 0.7, 0.7); // Adjust for size
  tree.position.set(-1.5, -1.5, -0.5); // Place it to the side
  scene.add(tree);
}, undefined, (error) => {
  console.error('Error loading tree model:', error);
});

  // Load Bench model
const benchLoader = new GLTFLoader();
benchLoader.load('/models/park_bench.glb', (gltf) => {
  const bench = gltf.scene;
  bench.scale.set(1, 1, 1);
  bench.position.set(0, -1, 0); // Adjust as needed to fit Nana’s pose
  bench.rotation.y = Math.PI; // Optional: rotate if needed
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
    // granny.position.set(0, -0.8, 0);
    granny.position.set(0, -1, .45);
    scene.add(granny);

    mixer = new THREE.AnimationMixer(granny);
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
  }, undefined, (error) => {
    console.error('Error loading granny model:', error);
  });

  // Floor
  const floorGeometry = new THREE.CircleGeometry(2.5, 64); // radius, segments

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
  placeShowBtnAtPaper();       // keep the button “stuck” to the paper
  renderer.render(scene, camera);
}



// ----------------------------
// News Fetching & Interaction
// ----------------------------


window.addEventListener('DOMContentLoaded', () => {
  console.log("[DOM] ready, wiring show/hide listeners");

  const newsPanel    = document.getElementById("newsPanel");
  const showNewsBtn  = document.getElementById("showNewsPanel");  // the 'text on paper'
  const hideNewsBtn  = document.getElementById("hideNewsPanel");  // new 'Hide News' button in panel

  if (!newsPanel || !showNewsBtn || !hideNewsBtn) {
    console.error("[DOM] Missing one or more elements — check IDs: #newsPanel, #showNewsPanel, #hideNewsPanel");
    return;
  }

  // Start CLOSED by default
  newsPanel.classList.add("is-hidden");   // panel hidden
  showNewsBtn.style.display = "block";    // paper text visible

  // Click handlers
  hideNewsBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    morphPanelToButton();                 // animate panel → paper
  });

  showNewsBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    showMenuFromButton();                 // animate paper → panel
  });
});

// window.addEventListener('DOMContentLoaded', () => {
//   console.log("[DOM] ready, wiring show/close listeners");



//   const newsPanel   = document.getElementById("newsPanel");
//   const showNewsBtn = document.getElementById("showNewsPanel");
//   const closeNewsBtn= document.getElementById("closeNewsPanel");

//   console.log("[DOM] found:", {
//     newsPanel: !!newsPanel,
//     showNewsBtn: !!showNewsBtn,
//     closeNewsBtn: !!closeNewsBtn
//   });

  
//   // Initial state: panel hidden, paper label visible
//   newsPanel.classList.add("is-hidden");
//   showNewsBtn.style.display = "block";

//   if (!newsPanel || !showNewsBtn || !closeNewsBtn) {
//     console.error("[DOM] Missing one or more elements — check your HTML IDs.");
//     return;
//   }

//   // Initial state: panel visible, 'Show' button hidden (tweak to taste)
//   newsPanel.classList.remove("is-hidden");   // make sure CSS uses .is-hidden
//   showNewsBtn.style.display = "none";

// closeNewsBtn.addEventListener('click', (e) => {
//   e.preventDefault(); e.stopPropagation();
//   morphPanelToButton();
// });

// showNewsBtn.addEventListener('click', (e) => {
//   e.preventDefault(); e.stopPropagation();
//   showMenuFromButton();
// });

// });


// renderer.domElement.addEventListener('pointerdown', (ev) => {
//   const rect = renderer.domElement.getBoundingClientRect();
//   mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
//   mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

//   raycaster.setFromCamera(mouse, camera);
//   const hits = raycaster.intersectObject(newspaper, true);

//   if (hits.length) {
//   showMenuFromButton();                    // opens panel from paper
//   }

//   console.log("[Raycast] pointerdown", { x: mouse.x.toFixed(2), y: mouse.y.toFixed(2), hits: hits.length });
  


//   // After you’ve framed the shot with OrbitControls:
// const pos = camera.position.clone();
// const rot = camera.rotation.clone();            // Euler (radians)
// const tgt = controls?.target?.clone?.();        // if using OrbitControls

// console.log('cam pos:', pos.x, pos.y, pos.z);
// console.log('cam rot (rad):', rot.x, rot.y, rot.z);
// if (tgt) console.log('controls target:', tgt.x, tgt.y, tgt.z);

// // (Optional) also print degrees if easier to read:
// console.log('cam rot (deg):',
//   THREE.MathUtils.radToDeg(rot.x),
//   THREE.MathUtils.radToDeg(rot.y),
//   THREE.MathUtils.radToDeg(rot.z)
// );


//   if (hits.length) {
//     console.log("[Raycast] Newspaper hit → show menu");
//    /// showMenuFromNewspaper();
//     const showBtn = document.getElementById("showNewsPanel");
//     if (showBtn) showBtn.style.display = "none";
//   }
// });

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

    console.log("✅ Raw data returned:", data);  // ADD THIS LINE

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


async function renderArticles() {
  console.log("📦 renderArticles() started");

  const headlinesDiv = document.getElementById("headlines");
  const status = document.getElementById("status");

  if (!headlinesDiv || !status) {
    console.error("🚫 headlines or status element missing");
    return;
  }

  status.textContent = "🕐 Loading articles..."; // Show loading state

  articles = await fetchArticles(); // ✅ Use global

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

// Headline block
const el = document.createElement("div");
el.innerHTML = `<strong>${title}</strong><br><small>${article.source}</small>`;
el.style.cursor = "pointer";
el.style.flex = "1";

// Click-to-read button
const linkBtn = document.createElement("button");
linkBtn.textContent = "🔗 Read";
linkBtn.style.padding = "4px 10px";
linkBtn.style.fontSize = "0.9rem";
linkBtn.style.cursor = "pointer";

linkBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // Prevent triggering speech
  window.open(article.url, '_blank');
});

// Listen on headline
el.addEventListener("click", async () => {
  cancelSpeaking();
  console.log(`📥 Fetching full article from: ${article.url}`);
  const fullText = await fetchFullArticleText(article.url);
  const textToRead = fullText || `${title}. ${content}`;
  await speakText(`Headline: ${title}. ${textToRead}`);
});

wrapper.appendChild(el);
wrapper.appendChild(linkBtn);
headlinesDiv.appendChild(wrapper);

  el.addEventListener("click", async () => {
    cancelSpeaking(); // ✅ stop current voice

    setPlaybackActive();
    console.log(`📥 Fetching full article from: ${article.url}`);
    const fullText = await fetchFullArticleText(article.url);

    if (fullText) {
      console.log("✅ Full article loaded. Preview:", fullText.slice(0, 300));
    } else {
      console.warn("⚠️ Full article not available, using fallback content.");
    }

    const textToRead = fullText || `${title}. ${content}`;
    await speakText(`Headline: ${title}. ${textToRead}`);
 

   
  });

  headlinesDiv.appendChild(el);
}
}


function showMenuFromNewspaper() {
  const panel = document.getElementById('newsPanel');
  const center = newspaper.getWorldPosition(new THREE.Vector3());
  const { x, y } = worldToScreen(center, camera, renderer);

  // start panel tiny at the plane, then expand
  panel.classList.remove('is-hidden');
  const rect = panel.getBoundingClientRect();
  const tX = x - (rect.left + rect.width / 2);
  const tY = y - (rect.top + rect.height / 2);
  panel.style.transformOrigin = 'top left';
  panel.style.transform = `translate(${tX}px, ${tY}px) scale(0.1)`;
  panel.style.opacity = 0;

  gsap.to(panel, { duration: 0.45, opacity: 1, clearProps: 'transform', ease: 'power2.out' });
  gsap.to(newspaper.material, { duration: 0.3, opacity: 0, ease: 'power2.out' });
}

// ----------------------------
// Voice & Interaction Helpers
// ----------------------------

let isSpeaking = false;
let useElevenLabs = true; 
let currentAudio = null;
let currentSpeakingId = 0;


async function speakText(text) {
  cancelSpeaking(); // Always cancel previous audio

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
    status.textContent = `✔️ All articles played. Click a headline to hear again.`;

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


