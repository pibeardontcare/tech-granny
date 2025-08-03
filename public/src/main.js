import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const API_URL = '/.netlify/functions/articles';


let scene, camera, renderer, raycaster, mouse, mixer, granny;



// Init scene
init();
animate();

function init() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 3);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3.6);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
  dirLight.position.set(3, 10, 5);
  scene.add(dirLight);

  // Controls
  new OrbitControls(camera, renderer.domElement);

  // Raycasting
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

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
    granny.position.set(0, -0.8, 0);
    scene.add(granny);

    mixer = new THREE.AnimationMixer(granny);
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
  }, undefined, (error) => {
    console.error('Error loading granny model:', error);
  });

  // Floor
  const floorGeometry = new THREE.PlaneGeometry(100, 100);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
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

async function fetchArticles() {
  const res = await fetch(API_URL);
  const data = await res.json();
  return data;
}

//debug messages
// const status = document.getElementById("status");
// console.log("Initial status:", status.textContent);
// status.textContent = "This is a test update!";


async function renderArticles() {
  const articles = await fetchArticles();
  const headlinesDiv = document.getElementById("headlines");
  const status = document.getElementById("status");

  headlinesDiv.innerHTML = "";

  if (!articles.length) {
    status.textContent = "No articles today, dear.";
    speakText("Sorry honey, no XR or AI news today.");
    return;
  }

  console.log("Fetched articles:", articles);
  status.textContent = `Click a headline to hear it.`;

  for (const article of articles) {
    const title = article.title || "No title";
    const content = article.content || "No summary available.";

    const el = document.createElement("p");
    el.innerHTML = `<strong>${title}</strong><br><small>${article.source}</small>`;
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      speakText(`Headline: ${title}`).then(() => speakText(content));
    });

    headlinesDiv.appendChild(el);
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----------------------------
// Voice & Interaction Helpers
// ----------------------------

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

async function speakText(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = await getPreferredVoice();
  const voice = voices.find(v => v.name.includes("Google UK English") || v.name.includes("Daniel"));
  utterance.voice = voice || voices[0];
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  speechSynthesis.speak(utterance);
}

// function updateGrannyText(text) {
//   const box = document.getElementById('grannyText');
//   box.textContent = text;
// }

// ----------------------------
// Serverless Function Trigger
// ----------------------------

async function getGrannyResponse(userPrompt = '') {
  const news = await fetchArticles();

  const res = await fetch("/.netlify/functions/granny", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userPrompt, news })
  });

  const data = await res.json();
  return data.response;
}

let isWaiting = false;

// async function askGranny() {
//   if (isWaiting) return;

//   isWaiting = true;
//   //updateGrannyText("Hang on, dear... I'm still thinking.");
  
//   const userPrompt = document.getElementById('userPrompt').value;
//   const response = await getGrannyResponse(userPrompt);
  
//   updateGrannyText(response);
//   speakText(response);

//   setTimeout(() => { isWaiting = false; }, 5000);
// }

//document.getElementById("askGrannyButton").addEventListener("click", askGranny);

// Initial fetch & read
window.addEventListener('load', async () => {
  //updateGrannyText("Granny is fetching the latest XR and AI gossip...");
  const intro = await getGrannyResponse("What’s happening in XR and AI today?");
  //updateGrannyText(intro);
  speakText(intro);

  await renderArticles(); // Display clickable headlines
});
