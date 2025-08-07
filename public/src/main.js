import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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




let scene, camera, renderer, raycaster, mouse, mixer, granny;


// Init scene
init();
animate();

function init() {
  // Scene setup
  scene = new THREE.Scene();
 
  scene.background = new THREE.Color(0x87CEEB); // light sky blue


  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 3);

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
  const tree = gltf.scene;
  tree.scale.set(0.01, 0.01, 0.01); // Adjust for size
  tree.position.set(-1.5, -1, -1); // Place it to the side
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
  loader.load('/models/granny.glb', (gltf) => {
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
  renderer.render(scene, camera);
}

// ----------------------------
// News Fetching & Interaction
// ----------------------------

window.addEventListener('DOMContentLoaded', () => {
  fetchElevenLabsCredits();
  console.log("📰 DOM fully loaded, fetching credits left...");
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


window.addEventListener('DOMContentLoaded', () => {
  
  //news panel logic
  const newsPanel = document.getElementById("newsPanel");
const showNewsBtn = document.getElementById("showNewsPanel");
const closeNewsBtn = document.getElementById("closeNewsPanel");

if (newsPanel && showNewsBtn && closeNewsBtn) {
  closeNewsBtn.addEventListener("click", () => {
    newsPanel.classList.add("hidden");
    showNewsBtn.style.display = "block";
  });

  showNewsBtn.addEventListener("click", () => {
    newsPanel.classList.remove("hidden");
    showNewsBtn.style.display = "none";
  });

  // Show panel by default
  newsPanel.classList.remove("hidden");
  showNewsBtn.style.display = "none";
}

  // Play/Pause button
  const playBtn = document.getElementById("togglePlayBtn");
  if (playBtn) {
    playBtn.addEventListener("click", togglePlayPause);
    console.log("✅ Play/Pause button listener attached");
  } else {
    console.error("❌ togglePlayBtn not found in DOM at DOMContentLoaded");
  }

  // Voice toggle button
  const voiceBtn = document.getElementById("toggleVoiceBtn");
  if (voiceBtn) {
    voiceBtn.addEventListener("click", () => {
      useElevenLabs = !useElevenLabs;
      voiceBtn.textContent = useElevenLabs ? "🧠 Voice: ElevenLabs" : "🎤 Voice: Google";
      console.log("🔁 Voice preference switched to:", useElevenLabs ? "ElevenLabs" : "Browser TTS");
    });
    console.log("✅ Voice toggle button listener attached");
  } else {
    console.error("❌ toggleVoiceBtn not found in DOM at DOMContentLoaded");
  }

  // Google Voice "Read All" button
const readAllBtn = document.getElementById("readAllWithGoogle");
if (readAllBtn) {
  readAllBtn.addEventListener("click", () => {
    readAllWithGoogleVoice();
  });
  console.log("✅ Google Read All button listener attached");
} else {
  console.error("❌ readAllWithGoogle button not found in DOM");
}

});


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

// // display credits for elevenlabs voice 
// async function fetchElevenLabsCredits() {
//   try {
//     const res = await fetch('/.netlify/functions/credits');
//     const data = await res.json();

//     const used = data.characterCount;
//     const limit = data.characterLimit;
//     const remaining = limit - used;

//     const btn = document.getElementById("toggleVoiceBtn");
//     if (btn) {
//       btn.textContent = `🧠 Voice: ElevenLabs (${remaining.toLocaleString()} left)`;
//     }
//   } catch (err) {
//     console.warn("❌ Failed to fetch ElevenLabs credits:", err);
//   }
// }
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
