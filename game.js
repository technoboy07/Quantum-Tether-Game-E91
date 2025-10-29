const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const state = {
	time: 0,
	keys: {},
	scene: 'battle', // 'battle' | 'control'
	tank: { x: 100, y: 420, w: 56, h: 30, speed: 0.7, vx: 0, vy: 0, angle: 0 },
	drone: { x: 480, y: 120, r: 18, pulse: 0 },
	control: { x: 740, y: 360, w: 120, h: 120 },
	laserOn: false,
	qkd: { active: false, result: null },
	status: 'Idle',
	eve: false,
	message: '',
	cipherHex: '',
	received: '',
	displayPanel: false,
	eveDrone: { x: 520, y: 160, r: 12, angle: 0 },
	controlEnterT: 0,
	particles: [],
	terrain: [],
	smoke: [],
	explosions: [],
};

const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const eveToggle = document.getElementById('eveToggle');
const statusEl = document.getElementById('status');

const commPanel = document.getElementById('commPanel');
const commTitle = document.getElementById('commTitle');
const commClose = document.getElementById('commClose');
const panelPrompt = document.getElementById('panelPrompt');
const panelMessage = document.getElementById('panelMessage');
const panelSend = document.getElementById('panelSend');
const encPreview = document.getElementById('encPreview');
const e91Log = document.getElementById('e91Log');

// Notify buttons
let notifyTank = document.getElementById('notifyTank');
let notifyCC = document.getElementById('notifyCC');
if (!notifyTank) { notifyTank = document.createElement('div'); notifyTank.id = 'notifyTank'; notifyTank.className = 'notify hidden'; notifyTank.textContent = '!'; document.body.appendChild(notifyTank); }
if (!notifyCC) { notifyCC = document.createElement('div'); notifyCC.id = 'notifyCC'; notifyCC.className = 'notify hidden'; notifyCC.textContent = '!'; document.body.appendChild(notifyCC); }

document.addEventListener('keydown', (e) => { state.keys[e.code] = true; });
document.addEventListener('keyup', (e) => { state.keys[e.code] = false; });

eveToggle.addEventListener('change', () => { 
	state.eve = eveToggle.checked; 
	// Reset QKD state when Eve is toggled
	state.qkd.active = false;
	state.qkd.result = null;
	state.status = 'Idle';
	sendBtn.disabled = false;
	updateHudStatus();
});

sendBtn.addEventListener('click', () => {
	if (!state.qkd.result || state.qkd.result.breach) return;
	const text = messageInput.value || '';
	state.message = text;
	const { cipherBytes } = QKD.otpEncrypt(text);
	state.cipherHex = QKD.bytesToHex(cipherBytes);
	state.status = 'Encrypted and sent to Control Center';
	state.received = text;
	goToControlCenter();
	updateHudStatus();
});

panelSend.addEventListener('click', () => {
	const text = panelMessage.value || '';
	if (state.scene === 'battle') {
		if (!state.qkd.result || state.qkd.result.breach) {
			alert('QKD not established or breach detected. Cannot send message.');
			return;
		}
		state.message = text;
		const { cipherBytes } = QKD.otpEncrypt(text);
		const hex = QKD.bytesToHex(cipherBytes);
		state.cipherHex = hex;
		encPreview.textContent = `Plaintext: "${text}"
Key bits: ${window.__qkd_key_bits ? window.__qkd_key_bits.slice(0, 64).join('') + (window.__qkd_key_bits.length > 64 ? '...' : '') : '(none)'}
Cipher (hex): ${hex.slice(0, 80)}${hex.length > 80 ? '...' : ''}`;
		state.status = 'Encrypted and sent to Control Center';
		state.received = text;
		goToControlCenter();
	} else {
		state.status = 'Control Center replied';
		state.message = text;
		state.cipherHex = '';
		encPreview.textContent = `Reply: "${text}"`;
		goToBattlefield();
	}
	updateHudStatus();
});

commClose.addEventListener('click', () => { hideCommPanel(); });

notifyTank.addEventListener('click', () => { toggleCommPanelNearTank(); });
notifyCC.addEventListener('click', () => { toggleCommPanelAtControl(); });

function updateHudStatus() {
	let s = 'Status: ' + state.status;
	if (state.qkd.result) {
		s += ` | QBER ${(state.qkd.result.qber * 100).toFixed(1)}% | S ${state.qkd.result.S.toFixed(2)}`;
		s += state.qkd.result.breach ? ' | BREACH' : ' | Secure';
	}
	statusEl.textContent = s;
	statusEl.style.color = state.qkd.result && state.qkd.result.breach ? '#fecaca' : '#fde68a';
}

function update(dt) {
	state.time += dt;
	if (state.scene === 'battle') updateBattle(dt); else updateControl(dt);
}

function updateBattle(dt) {
	const t = state.tank;
	const deltaTime = dt / 16.67;
	
	// Physics-based tank movement with momentum
	if (!state.displayPanel) {
		const acceleration = 0.01;
		const friction = 0.92;
		
		if (state.keys['ArrowLeft']) {
			t.vx -= acceleration * deltaTime;
			t.angle = Math.max(-0.3, t.angle - 0.005 * deltaTime);
		}
		if (state.keys['ArrowRight']) {
			t.vx += acceleration * deltaTime;
			t.angle = Math.min(0.3, t.angle + 0.005 * deltaTime);
		}
		if (state.keys['ArrowUp']) {
			t.vy -= acceleration * 0.4 * deltaTime;
		}
		if (state.keys['ArrowDown']) {
			t.vy += acceleration * 0.4 * deltaTime;
		}
		
		// Apply friction and update position
		t.vx *= friction;
		t.vy *= friction;
		t.x += t.vx * deltaTime * 60;
		t.y += t.vy * deltaTime * 60;
		
		// Add tank tracks particles
		if (Math.abs(t.vx) > 0.1 || Math.abs(t.vy) > 0.1) {
			addTrackParticle(t.x + t.w/2, t.y + t.h, t.vx, t.vy);
		}
	}
	
	// Boundary constraints
	t.x = Math.max(40, Math.min(canvas.width - 40 - t.w, t.x));
	t.y = Math.max(300, Math.min(canvas.height - 40 - t.h, t.y));

	const underDrone = Math.abs((t.x + t.w / 2) - state.drone.x) < 24;
	state.laserOn = underDrone;

	// Update drone pulse
	state.drone.pulse += deltaTime * 0.01;

	// Eve drone movement
	if (state.eve) {
		const ex = state.drone.x + 36 + Math.sin(state.time * 0.002) * 12;
		const ey = state.drone.y + 28 + Math.cos(state.time * 0.003) * 6;
		state.eveDrone.x = ex; 
		state.eveDrone.y = ey;
		state.eveDrone.angle += deltaTime * 0.05;
	}

	// Update particles
	updateParticles(deltaTime);

	positionNotifyTank();
	notifyTank.classList.toggle('hidden', !underDrone);

		if (state.laserOn && !state.qkd.active) {
		state.qkd.active = true;
		state.status = 'Aligning with drone... Establishing E91 link';
		updateHudStatus();
		setTimeout(() => {
			const result = QKD.simulateE91Detailed({ pairCount: 1024, evePresent: state.eve, logLimit: 20 });
			state.qkd.result = result;
			window.__qkd_key_bits = result.aliceKey;
			
			// Simplified status message logic
			if (result.breach) {
				state.status = state.eve ? 'QKD failed: Eve detected' : 'QKD failed: High error rate';
			} else {
				state.status = 'QKD success: Shared key ready';
			}
			
			sendBtn.disabled = !!result.breach;
			e91Log.textContent = result.logs.join('\n');
			updateHudStatus();
		}, 900);
	}
}

function updateControl(dt) {
	positionNotifyCC();
	notifyCC.classList.toggle('hidden', false);
}

function showCommPanelNearTank() {
	state.displayPanel = true;
	const rect = canvas.getBoundingClientRect();
	const t = state.tank;
	const px = rect.left + window.scrollX + t.x + t.w + 12;
	const py = rect.top + window.scrollY + t.y - 80;
	commPanel.style.left = Math.min(px, rect.left + rect.width - 560) + 'px';
	commPanel.style.top = Math.max(py, rect.top + 80) + 'px';
	commPanel.classList.remove('hidden');
}

function showCommPanelAtControl() {
	state.displayPanel = true;
	const rect = canvas.getBoundingClientRect();
	const cx = rect.left + window.scrollX + canvas.width / 2;
	const cy = rect.top + window.scrollY + canvas.height / 2;
	commPanel.style.left = (cx - 260) + 'px';
	commPanel.style.top = (cy - 140) + 'px';
	commPanel.classList.remove('hidden');
}

function hideCommPanel() { state.displayPanel = false; commPanel.classList.add('hidden'); }

function toggleCommPanelNearTank() {
	if (state.displayPanel) hideCommPanel(); else {
		commTitle.textContent = 'Drone Link: Tank ↔ Control Center';
		panelPrompt.textContent = 'Type message';
		panelMessage.value = '';
		panelSend.textContent = 'Send via QKD';
		encPreview.textContent = '';
		showCommPanelNearTank();
	}
}

function toggleCommPanelAtControl() {
	if (state.displayPanel) hideCommPanel(); else {
		commTitle.textContent = 'Control Center Console';
		panelPrompt.textContent = 'Compose reply to ground troops';
		panelMessage.value = '';
		panelSend.textContent = 'Send reply';
		encPreview.textContent = '';
		showCommPanelAtControl();
	}
}

function goToControlCenter() { state.scene = 'control'; state.controlEnterT = state.time; hideCommPanel(); notifyTank.classList.add('hidden'); positionNotifyCC(); notifyCC.classList.remove('hidden'); }
function goToBattlefield() { state.scene = 'battle'; hideCommPanel(); notifyCC.classList.add('hidden'); }

function positionNotifyTank() {
	const rect = canvas.getBoundingClientRect();
	const t = state.tank;
	notifyTank.style.left = (rect.left + window.scrollX + t.x + t.w + 6) + 'px';
	notifyTank.style.top = (rect.top + window.scrollY + t.y - 28) + 'px';
}

function positionNotifyCC() {
	const rect = canvas.getBoundingClientRect();
	if (state.scene === 'control') {
		const cx = rect.left + window.scrollX + canvas.width / 2;
		const cy = rect.top + window.scrollY + canvas.height / 2;
		notifyCC.style.left = (cx + 140 - 16) + 'px';
		notifyCC.style.top = (cy - 100) + 'px';
	} else {
		const ccx = state.control.x + state.control.w / 2; const ccy = state.control.y + 8;
		notifyCC.style.left = (rect.left + window.scrollX + ccx - 16) + 'px';
		notifyCC.style.top = (rect.top + window.scrollY + ccy - 20) + 'px';
	}
}

// Particle system functions
function addTrackParticle(x, y, vx, vy) {
	state.particles.push({
		x: x + (Math.random() - 0.5) * 20,
		y: y + Math.random() * 5,
		vx: vx * 0.3 + (Math.random() - 0.5) * 2,
		vy: vy * 0.3 + Math.random() * 2,
		life: 1.0,
		size: 2 + Math.random() * 3,
		color: `hsl(${30 + Math.random() * 20}, 60%, ${40 + Math.random() * 20}%)`
	});
}

function addLaserParticle(x, y) {
	for (let i = 0; i < 3; i++) {
		state.particles.push({
			x: x + (Math.random() - 0.5) * 10,
			y: y + Math.random() * 20,
			vx: (Math.random() - 0.5) * 1,
			vy: -Math.random() * 3,
			life: 0.8,
			size: 1 + Math.random() * 2,
			color: `hsl(${200 + Math.random() * 40}, 80%, 70%)`
		});
	}
}

function updateParticles(dt) {
	for (let i = state.particles.length - 1; i >= 0; i--) {
		const p = state.particles[i];
		p.x += p.vx * dt * 60;
		p.y += p.vy * dt * 60;
		p.life -= dt * 0.5;
		p.vy += 0.02 * dt * 60; // gravity
		
		if (p.life <= 0) {
			state.particles.splice(i, 1);
		}
	}
}

function drawParticles() {
	state.particles.forEach(p => {
		ctx.save();
		ctx.globalAlpha = p.life;
		ctx.fillStyle = p.color;
		ctx.beginPath();
		ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	});
}

function draw() { ctx.clearRect(0, 0, canvas.width, canvas.height); if (state.scene === 'battle') drawBattle(); else drawControl(); }

function drawSky() {
	// Bright sky gradient
	const g = ctx.createLinearGradient(0, 0, 0, 300);
	g.addColorStop(0, '#5db0ff'); g.addColorStop(1, '#a5d8ff');
	ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, 300);
	// Sun
	ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(80, 80, 28, 0, Math.PI * 2); ctx.fill();
	// Clouds
	ctx.fillStyle = 'rgba(255,255,255,0.8)';
	for (let i = 0; i < 4; i++) {
		const cx = 160 + i * 160 + Math.sin((state.time * 0.0003) + i) * 20;
		const cy = 70 + (i % 2) * 18;
		ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2);
		ctx.arc(cx + 18, cy + 6, 16, 0, Math.PI * 2);
		ctx.arc(cx - 18, cy + 6, 14, 0, Math.PI * 2); ctx.fill();
	}
}

function drawTerrain() {
	// Ground with realistic texture
	ctx.fillStyle = '#2d3748';
	ctx.fillRect(0, 300, canvas.width, canvas.height - 300);
	
	// Grass layer
	ctx.fillStyle = '#38a169';
	for (let x = 0; x < canvas.width; x += 16) {
		const grassHeight = 2 + Math.sin((x + state.time * 0.1) * 0.02) * 1;
		ctx.fillRect(x, 330 + grassHeight, 12, 2);
	}
	
	// Dirt patches
	ctx.fillStyle = '#744210';
	for (let i = 0; i < 8; i++) {
		const x = 50 + i * 100 + Math.sin(state.time * 0.01 + i) * 20;
		const y = 320 + Math.sin(i) * 5;
		ctx.fillRect(x, y, 30 + Math.random() * 20, 15);
	}
	
	// Rocks and debris
	ctx.fillStyle = '#4a5568';
	for (let i = 0; i < 12; i++) {
		const x = 30 + i * 70 + Math.sin(state.time * 0.005 + i) * 15;
		const y = 315 + Math.sin(i * 0.5) * 3;
		ctx.fillRect(x, y, 4 + Math.random() * 6, 4 + Math.random() * 6);
	}
}

function drawTroops() {
	// Realistic ground troops with better details
	for (let i = 0; i < 6; i++) {
		const tx = 120 + i * 90 + Math.sin((state.time * 0.002) + i) * 4;
		const ty = 300 + 28;
		
		// Shadow
		ctx.fillStyle = 'rgba(0,0,0,0.3)';
		ctx.fillRect(tx + 1, ty + 1, 10, 14);
		
		// Body
		ctx.fillStyle = '#1a202c';
		ctx.fillRect(tx, ty, 10, 14);
		
		// Head
		ctx.fillStyle = '#2d3748';
		ctx.fillRect(tx + 3, ty - 6, 8, 6);
		
		// Feet
		ctx.fillStyle = '#1a202c';
		ctx.fillRect(tx - 4, ty + 12, 18, 3);
		
		// Weapon
		ctx.fillStyle = '#4a5568';
		ctx.fillRect(tx + 8, ty - 2, 12, 2);
	}
}

function drawQKDVisualization() {
	// QKD conversion visualization box in top-left corner
	const boxX = 10;
	const boxY = 10;
	const boxW = 320;
	const boxH = 120;
	
	// Box background
	ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
	ctx.fillRect(boxX, boxY, boxW, boxH);
	ctx.strokeStyle = '#3b82f6';
	ctx.lineWidth = 2;
	ctx.strokeRect(boxX, boxY, boxW, boxH);
	
	// Title
	ctx.fillStyle = '#60a5fa';
	ctx.font = 'bold 14px monospace';
	ctx.fillText('E91 QKD Protocol Status', boxX + 10, boxY + 20);
	
	// Status information
	ctx.fillStyle = '#e5e7eb';
	ctx.font = '12px monospace';
	
	if (state.qkd.active && state.qkd.result) {
		const result = state.qkd.result;
		ctx.fillText(`Status: ${result.breach ? 'BREACH DETECTED' : 'SECURE'}`, boxX + 10, boxY + 40);
		ctx.fillText(`QBER: ${(result.qber * 100).toFixed(2)}%`, boxX + 10, boxY + 55);
		ctx.fillText(`CHSH S: ${result.S.toFixed(3)} (limit: 2.828)`, boxX + 10, boxY + 70);
		ctx.fillText(`Key Length: ${result.kept} bits`, boxX + 10, boxY + 85);
		ctx.fillText(`Eve Present: ${state.eve ? 'YES' : 'NO'}`, boxX + 10, boxY + 100);
	} else if (state.qkd.active) {
		ctx.fillText('Status: Establishing quantum link...', boxX + 10, boxY + 40);
		ctx.fillText('Generating entangled pairs...', boxX + 10, boxY + 55);
		ctx.fillText('Measuring in random bases...', boxX + 10, boxY + 70);
		ctx.fillText('Calculating CHSH inequality...', boxX + 10, boxY + 85);
	} else {
		ctx.fillText('Status: Waiting for tank alignment', boxX + 10, boxY + 40);
		ctx.fillText('Move tank under drone to start QKD', boxX + 10, boxY + 55);
		ctx.fillText('E91 Protocol: Bell state entanglement', boxX + 10, boxY + 70);
		ctx.fillText('Security: CHSH inequality violation', boxX + 10, boxY + 85);
	}
	
	// Visual indicator
	ctx.fillStyle = state.qkd.result ? (state.qkd.result.breach ? '#ef4444' : '#10b981') : '#fbbf24';
	ctx.beginPath();
	ctx.arc(boxX + boxW - 20, boxY + 20, 8, 0, Math.PI * 2);
	ctx.fill();
}

function drawBattle() {
	drawSky();
	drawTerrain();
	drawTroops();
	drawQKDVisualization();

	// Control Center small building in background
	const cc = state.control; ctx.save(); ctx.translate(cc.x, cc.y);
	ctx.fillStyle = '#0f1e3f'; ctx.fillRect(0, 0, cc.w, cc.h);
	ctx.fillStyle = '#3b82f6'; ctx.fillRect(10, 10, cc.w - 20, 16);
	ctx.fillStyle = '#10214a'; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ctx.fillRect(16 + i * 34, 40 + j * 34, 20, 20);
	ctx.fillStyle = '#60a5fa'; ctx.fillRect(cc.w / 2 - 14, cc.h - 16, 28, 10); ctx.restore();

	// Drone
	ctx.save(); ctx.translate(state.drone.x, state.drone.y + Math.sin(state.time * 0.005) * 3);
	ctx.fillStyle = '#93c5fd'; ctx.beginPath(); ctx.arc(0, 0, state.drone.r, 0, Math.PI * 2); ctx.fill();
	ctx.fillStyle = '#60a5fa'; ctx.fillRect(-26, -6, 52, 12); ctx.restore();

	// Laser
	if (state.laserOn) { const g = ctx.createLinearGradient(state.drone.x, state.drone.y, state.drone.x, canvas.height); g.addColorStop(0, 'rgba(96,165,250,0.0)'); g.addColorStop(0.2, 'rgba(96,165,250,0.45)'); g.addColorStop(1, 'rgba(96,165,250,0.15)'); ctx.fillStyle = g; ctx.fillRect(state.drone.x - 4, state.drone.y + state.drone.r, 8, canvas.height - state.drone.y); }

	// Eve drone visual
	if (state.eve) {
		ctx.save(); ctx.translate(state.eveDrone.x, state.eveDrone.y);
		ctx.fillStyle = '#f87171'; ctx.beginPath(); ctx.arc(0, 0, state.eveDrone.r, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = '#ef4444'; ctx.fillRect(-22, -5, 44, 10);
		// Tap effect line toward beam
		ctx.strokeStyle = 'rgba(239,68,68,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(state.drone.x - state.eveDrone.x, (state.drone.y + 30) - state.eveDrone.y); ctx.stroke();
		ctx.restore();
	}

	// Tank with realistic details and physics-based rotation
	const t = state.tank;
	ctx.save();
	ctx.translate(t.x + t.w/2, t.y + t.h/2);
	ctx.rotate(t.angle);
	ctx.translate(-t.w/2, -t.h/2);
	
	// Tank shadow
	ctx.fillStyle = 'rgba(0,0,0,0.3)';
	ctx.fillRect(2, 2, t.w, t.h);
	
	// Main body
	ctx.fillStyle = '#4b5563';
	ctx.fillRect(0, 18, t.w, 12);
	
	// Turret
	ctx.fillStyle = '#6b7280';
	ctx.fillRect(8, 8, 30, 14);
	
	// Barrel
	ctx.fillStyle = '#374151';
	ctx.fillRect(28, 12, 24, 6);
	
	// Tracks
	ctx.fillStyle = '#1f2937';
	ctx.fillRect(6, 28, 12, 6);
	ctx.fillRect(22, 28, 12, 6);
	ctx.fillRect(38, 28, 12, 6);
	
	// Track details
	ctx.fillStyle = '#111827';
	ctx.fillRect(6, 29, 12, 4);
	ctx.fillRect(22, 29, 12, 4);
	ctx.fillRect(38, 29, 12, 4);
	
	ctx.restore();

	// Draw particles
	drawParticles();

	// Guidance text with better styling
	if (Math.abs((t.x + t.w / 2) - state.drone.x) < 80) {
		ctx.fillStyle = 'rgba(0,0,0,0.7)';
		ctx.fillRect(t.x - 8, t.y - 25, 120, 20);
		ctx.fillStyle = '#fbbf24';
		ctx.font = 'bold 12px monospace';
		ctx.fillText('Press ! to open panel', t.x - 4, t.y - 10);
	}

	// HUD with better styling (moved down to avoid QKD box)
	ctx.fillStyle = 'rgba(0,0,0,0.8)';
	ctx.fillRect(10, 140, 400, 80);
	ctx.fillStyle = '#f3f4f6';
	ctx.font = '14px monospace';
	ctx.fillText('Controls: Arrow keys. Align under drone, click !', 20, 160);
	if (state.cipherHex) ctx.fillText('Cipher (hex): ' + state.cipherHex.slice(0, 72) + (state.cipherHex.length > 72 ? '...' : ''), 20, 180);
	if (state.received) ctx.fillText('Control Center received: ' + state.received, 20, 200);
}

function drawControl() {
	// Pop-in animation: scale from 0.85 to 1.0 over 600ms
	const elapsed = Math.max(0, state.time - state.controlEnterT);
	const p = Math.min(1, elapsed / 600);
	const scale = 0.85 + 0.15 * p;

	// Background
	const g = ctx.createLinearGradient(0, 0, 0, canvas.height); g.addColorStop(0, '#284b8d'); g.addColorStop(1, '#0e1730'); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Centered building
	const bw = 300, bh = 180;
	const cx = canvas.width / 2, cy = canvas.height / 2;
	ctx.save();
	ctx.translate(cx, cy);
	ctx.scale(scale, scale);
	ctx.translate(-bw / 2, -bh / 2);
	ctx.fillStyle = '#0f1e3f'; ctx.fillRect(0, 0, bw, bh);
	ctx.fillStyle = '#3b82f6'; ctx.fillRect(12, 12, bw - 24, 18);
	ctx.fillStyle = '#10214a'; for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) ctx.fillRect(18 + i * 38, 46 + j * 40, 24, 24);
	ctx.fillStyle = '#60a5fa'; ctx.fillRect(bw / 2 - 18, bh - 18, 36, 12);
	ctx.restore();

	// Labels near center
	ctx.fillStyle = '#bfdbfe'; ctx.font = '18px monospace'; ctx.fillText('Control Center', cx - 120, cy - (bh / 2) - 16);
	ctx.fillStyle = '#f3f4f6'; ctx.font = '14px monospace';
	ctx.fillText('Incoming (from tank): ' + (state.message || '(none)'), cx - 140, cy + (bh / 2) + 24);
	ctx.fillText('Click ! to open console and send reply', cx - 140, cy + (bh / 2) + 44);
	
	// Show received message if available
	if (state.received) {
		ctx.fillStyle = '#10b981';
		ctx.fillText('Message received: ' + state.received, cx - 140, cy + (bh / 2) + 64);
	}
}

let last = 0; function loop(ts) { const dt = ts - last; last = ts; update(dt); draw(); requestAnimationFrame(loop); }
function positionPanelOnResize() { if (state.displayPanel) { if (state.scene === 'battle') showCommPanelNearTank(); else showCommPanelAtControl(); } }
window.addEventListener('resize', positionPanelOnResize);

updateHudStatus(); requestAnimationFrame(loop);
