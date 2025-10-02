// server/index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Serve client static files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Simple status route
app.get('/status', (req, res) => res.json({ ok: true, now: Date.now() }));

// Try connecting MongoDB if MONGO_URI provided
const MONGO_URI = process.env.MONGO_URI || '';
let usingMongo = false;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(()=> {
      console.log('MongoDB connected');
      usingMongo = true;
    })
    .catch(err => {
      console.error('MongoDB connection error:', err.message);
      usingMongo = false;
    });
} else {
  console.log('No MONGO_URI provided — running with in-memory state');
}

// ---------- In-memory models (fallback) ----------
let players = {}; // socketId -> {id,name,x,y,z,money,brainrots,lastSteal}
let brainrots = []; // simple list of brainrots on map

// Simple brainrot spawn if empty (server-side)
function ensureBrainrots() {
  if (brainrots.length) return;
  // create some sample brainrots
  brainrots = [
    { id: 'b1', type: 'small', x: 5, y:0, z:2, value: 1, ownerId: null },
    { id: 'b2', type: 'small', x: -4, y:0, z:-3, value: 1, ownerId: null },
    { id: 'b3', type: 'big', x: 0, y:0, z:7, value: 5, ownerId: null }
  ];
}
ensureBrainrots();

// If you later add Mongo persistence, create mongoose schemas and sync here.

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', socket => {
  console.log('connect', socket.id);

  // send initial state
  socket.emit('init', { id: socket.id, players, brainrots });

  socket.on('join', (data = {}) => {
    players[socket.id] = {
      id: socket.id,
      name: data.name || 'guest',
      x: 0, y: 0, z: 0,
      money: 0,
      brainrots: [],
      lastSteal: 0
    };
    io.emit('players', players);
  });

  socket.on('move', (pos) => {
    if (!players[socket.id]) return;
    players[socket.id].x = pos.x;
    players[socket.id].y = pos.y;
    players[socket.id].z = pos.z;
    // broadcast move
    socket.broadcast.emit('playerMoved', { id: socket.id, pos });
  });

  socket.on('buyBrainrot', ({brainrotId}) => {
    const p = players[socket.id];
    const b = brainrots.find(x=>x.id===brainrotId);
    if (!p || !b) return;
    if (b.ownerId) {
      socket.emit('buyResult', { success:false, reason:'taken' });
      return;
    }
    // price = value * 10
    const price = b.value * 10;
    if (p.money >= price) {
      p.money -= price;
      b.ownerId = socket.id;
      p.brainrots.push(b.id);
      io.emit('players', players);
      io.emit('brainrots', brainrots);
      socket.emit('buyResult', { success:true, brainrotId });
    } else {
      socket.emit('buyResult', { success:false, reason:'no_money' });
    }
  });

  // attempt to steal from target
  socket.on('attemptSteal', ({ targetId }) => {
    const attacker = players[socket.id];
    const target = players[targetId];
    if (!attacker || !target) return;
    const now = Date.now();
    if (now - attacker.lastSteal < 5000) {
      socket.emit('stealResult', { success:false, reason:'cooldown' });
      return;
    }
    // simple distance check
    const dx = attacker.x - target.x;
    const dy = attacker.y - target.y;
    const dz = attacker.z - target.z;
    const dist2 = dx*dx + dy*dy + dz*dz;
    if (dist2 > (4*4)) {
      socket.emit('stealResult', { success:false, reason:'too_far' });
      return;
    }
    // calculate stolen amount
    const stolen = Math.min(target.money, Math.max(1, Math.floor(target.money * 0.15)));
    target.money -= stolen;
    attacker.money += stolen;
    attacker.lastSteal = now;
    io.to(socket.id).emit('stealResult', { success:true, amount:stolen });
    io.to(targetId).emit('stolen', { by: socket.id, amount:stolen });
    io.emit('players', players);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('players', players);
    console.log('disconnect', socket.id);
  });
});

// Passive income tick (server-side)
setInterval(()=>{
  for (const pid in players) {
    const p = players[pid];
    // each owned brainrot gives its value every 10s
    let income = 0;
    for (const bid of p.brainrots) {
      const b = brainrots.find(x=>x.id===bid);
      if (b) income += b.value;
    }
    if (income > 0) p.money += income;
  }
  io.emit('players', players);
}, 10000); // 10s

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server running on', PORT));
