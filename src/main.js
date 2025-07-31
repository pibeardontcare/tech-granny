import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// api call to news
const fetchNewsAPI = async () => {
  const response = await fetch('/.netlify/functions/fetchNews');
  const data = await response.json();
  return data;
};

// Three.js globals
let scene, camera, renderer, raycaster, mouse, mixer, granny;

init();
animate();

function init() {
  // Scene & Camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 3);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });

  
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3.6);
  scene.add(hemiLight);


  const dirLight = new THREE.DirectionalLight(0xffffff, 1.6); // from 1.0 → 0.6
dirLight.position.set(3, 10, 5);
scene.add(dirLight);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);

  // Raycaster & mouse
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Load Granny model
  const loader = new GLTFLoader();
  loader.load('/models/granny.glb', (gltf) => {
    granny = gltf.scene;

    gltf.scene.traverse((node) => {
  if (node.isMesh) {
    const mat = node.material;

    // Replace BasicMaterial if needed
    if (mat && mat.isMeshBasicMaterial) {
      node.material = new THREE.MeshStandardMaterial({
        color: mat.color,
        roughness: 0.8,
        metalness: 0.1,
      });
    }

    // Clear emissive settings
    if (mat && mat.emissive) {
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
    }

    // Lower overly bright materials
    if (mat && mat.color) {
      mat.color.multiplyScalar(0.8); // tone down brightness
    }

    mat.needsUpdate = true;
  }
});


    granny.scale.set(1, 1, 1);
    granny.position.set(0, -0.8, 0);

   
    scene.add(granny);

    // Animation mixer
    mixer = new THREE.AnimationMixer(granny);
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
  }, undefined, (error) => {
    console.error('Error loading granny model:', error);
  });

  const floorGeometry = new THREE.PlaneGeometry(100, 100);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1;
scene.add(floor);


  // Resize handling
  window.addEventListener('resize', onWindowResize);
}

function animate() {
  requestAnimationFrame(animate);
  if (mixer) mixer.update(0.016);
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}


async function getGrannyResponse(userPrompt = '') {
  const news = await fetchNewsAPI();

  const summaryPrompt = `
    Here's today's tech news:
    ${news.map((item, i) => `${i + 1}. ${item.title}`).join('\n')}
    
    Based on the above, respond to the user’s question in a funny, grandmotherly way.
    Question: ${userPrompt}
  `;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer  ",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a sassy, tech-savvy grandma who reads XR and AI news and explains it like she’s on a cozy podcast." },
        { role: "user", content: summaryPrompt }
      ],
      temperature: 0.7
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}



window.addEventListener('load', async () => {
  updateGrannyText("Granny is fetching the latest XR and AI gossip...");
  const intro = await getGrannyResponse("What’s happening in XR and AI today?");
  updateGrannyText(intro);  // Show it on screen
  speakText(intro);         // Speak it aloud
});


function updateGrannyText(text) {
  const box = document.getElementById('grannyText');
  box.textContent = text;
}

// Load voices before speaking
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

let isWaiting = false;

async function askGranny() {
  if (isWaiting) return; // stop spamming

  isWaiting = true;
  updateGrannyText("Hang on, dear... I'm still thinking.");
  
  const userPrompt = document.getElementById('userPrompt').value;
  const response = await getGrannyResponse(userPrompt);
  
  updateGrannyText(response);
  speakText(response);

  // Cooldown
  setTimeout(() => {
    isWaiting = false;
  }, 5000); // 5 seconds
}

