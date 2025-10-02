// client/main.js
const socket = io(); // same origin

let myId = null;
let players = {};
let brainrots = [];

// UI
const playerNameEl = document.getElementById('playerName');
const moneyEl = document.getElementById('money');
const btnSteal = document.getElementById('btnSteal');
const btnBuy = document.getElementById('btnBuy');

// Join with random name (you can prompt)
const myName = 'Player' + Math.floor(Math.random()*1000);
playerNameEl.innerText = myName;
socket.emit('join', { name: myName });

// Three.js basic setup
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0a0a5);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 6, 10);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5,10,7);
scene.add(light);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.MeshStandardMaterial({color:0x6db86d}));
ground.rotation.x = -Math.PI/2;
scene.add(ground);

// my avatar
const myMesh = new THREE.Mesh(new THREE.BoxGeometry(1,2,1), new THREE.MeshStandardMaterial({color:0x3366ff}));
myMesh.position.set(0,1,0);
scene.add(myMesh);

// other players map id -> mesh
const otherMeshes = {};

// brainrot meshes
const brainMeshes = {};

// render loop
function animate(){
  requestAnimationFrame(animate);
  // camera follow
  camera.position.lerp(new THREE.Vector3(myMesh.position.x, myMesh.position.y + 5, myMesh.position.z + 10), 0.08);
  camera.lookAt(myMesh.position.x, myMesh.position.y + 1, myMesh.position.z);
  renderer.render(scene, camera);
}
animate();

// update players rendering
function updatePlayersRender() {
  for (const id in players) {
    if (id === myId) continue;
    const p = players[id];
    if (!otherMeshes[id]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,2,1), new THREE.MeshStandardMaterial({color:0xff5533}));
      mesh.position.set(p.x || 0,1,p.z || 0);
      scene.add(mesh);
      otherMeshes[id] = mesh;
    } else {
      otherMeshes[id].position.set(p.x || 0, 1, p.z || 0);
    }
  }
  // remove meshes for disconnected
  for (const id in otherMeshes) {
    if (!players[id]) {
      scene.remove(otherMeshes[id]);
      delete otherMeshes[id];
    }
  }
}

// update brainrot rendering
function updateBrainrotsRender() {
  brainrots.forEach(b => {
    if (!brainMeshes[b.id]) {
      const color = b.ownerId ? 0x888888 : 0xffff66;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshStandardMaterial({color}));
      mesh.position.set(b.x, 0.6, b.z);
      scene.add(mesh);
      brainMeshes[b.id] = mesh;
    } else {
      brainMeshes[b.id].position.set(b.x, 0.6, b.z);
      brainMeshes[b.id].material.color.setHex(b.ownerId ? 0x888888 : 0xffff66);
    }
  });
  // cleanup
  for (const id in brainMeshes) {
    if (!brainrots.find(b=>b.id===id)) {
      scene.remove(brainMeshes[id]);
      delete brainMeshes[id];
    }
  }
}

// socket events
socket.on('connect', ()=> {
  myId = socket.id;
});

socket.on('init', (data) => {
  myId = data.id;
  players = data.players || {};
  brainrots = data.brainrots || [];
  updatePlayersRender();
  updateBrainrotsRender();
});

socket.on('players', (pl) => {
  players = pl;
  if (players[myId]) {
    const me = players[myId];
    myMesh.position.set(me.x || 0, 1, me.z || 0);
    moneyEl.innerText = '₿ ' + Math.floor(me.money);
  }
  updatePlayersRender();
});

socket.on('brainrots', (br) => {
  brainrots = br;
  updateBrainrotsRender();
});

socket.on('playerMoved', ({id, pos}) => {
  if (otherMeshes[id]) otherMeshes[id].position.set(pos.x, 1, pos.z);
});

socket.on('stealResult', (r) => {
  if (r.success) alert('Çalma başarılı: ₿' + r.amount);
  else alert('Çalma başarısız: ' + r.reason);
});

socket.on('stolen', (r) => {
  alert('Senden çalındı: ₿' + r.amount);
});

// basic joystick: left bottom area
const zone = document.getElementById('joystickZone');
const thumb = document.getElementById('thumb');
let touching = false;
let startX = 0, startY = 0;
let moveX = 0, moveY = 0;

zone.addEventListener('touchstart', (e)=>{
  touching = true;
  const t = e.touches[0];
  const rect = zone.getBoundingClientRect();
  startX = rect.left + rect.width/2;
  startY = rect.top + rect.height/2;
});
zone.addEventListener('touchmove', (e)=>{
  if (!touching) return;
  e.preventDefault();
  const t = e.touches[0];
  const rect = zone.getBoundingClientRect();
  const dx = t.clientX - (rect.left + rect.width/2);
  const dy = t.clientY - (rect.top + rect.height/2);
  const max = 36;
  const clampedX = Math.max(-max, Math.min(max, dx));
  const clampedY = Math.max(-max, Math.min(max, dy));
  thumb.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
  moveX = clampedX / max;
  moveY = clampedY / max;
  // update position
  const speed = 0.08;
  myMesh.position.x += moveX * speed;
  myMesh.position.z += moveY * speed * -1;
  socket.emit('move', { x: myMesh.position.x, y: myMesh.position.y, z: myMesh.position.z });
}, { passive:false });
zone.addEventListener('touchend', (e)=>{
  touching = false;
  thumb.style.transform = `translate(0px, 0px)`;
  moveX = moveY = 0;
});

// buttons
btnSteal.addEventListener('click', ()=>{
  // find a nearby player (simple)
  let nearest = null; let nd = 99999;
  for (const id in players) {
    if (id === myId) continue;
    const p = players[id];
    const dx = p.x - myMesh.position.x;
    const dz = p.z - myMesh.position.z;
    const d = Math.sqrt(dx*dx + dz*dz);
    if (d < nd) { nd = d; nearest = id; }
  }
  if (!nearest || nd > 4) { alert('Yakında çalınacak kimse yok (4 birim içinde)'); return; }
  socket.emit('attemptSteal', { targetId: nearest });
});

btnBuy.addEventListener('click', ()=>{
  // show available brainrots not owned
  const available = brainrots.filter(b => !b.ownerId);
  if (!available.length) return alert('Satılık Brainrot yok');
  const b = available[0];
  socket.emit('buyBrainrot', { brainrotId: b.id });
});

socket.on('buyResult', (r)=>{
  if (r.success) alert('Satın alındı: ' + r.brainrotId);
  else alert('Satın alma başarısız: ' + (r.reason || ''));
});
