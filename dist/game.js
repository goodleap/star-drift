(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const shell = $('game-shell');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const levels = { easy: { name: '轻松漫游', speed: .72, spawn: 1.18 }, normal: { name: '标准挑战', speed: 1, spawn: 1 }, hard: { name: '极限穿梭', speed: 1.28, spawn: .76 } };
  let level = 'normal', phase = 'menu', W = 1000, H = 800, dpr = 1;
  let elapsed = 0, score = 0, starsCollected = 0, health = 3, sector = 1;
  let rocks = [], pickups = [], particles = [], floaters = [];
  let rockClock = 0, starClock = 0, shieldClock = 0, dashTime = 0, dashCooldown = 0, immunity = 0, shake = 0;
  let lastTime = 0, uiClock = 0, toastClock = 0, visualTime = 0, pointer = null, pointerId = null, soundOn = false, audio = null;
  let best = {}, backdrop = document.createElement('canvas');
  let player = { x: W / 2, y: H * .79, r: 13, tilt: 0 };
  const keys = new Set();
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  try { const saved = JSON.parse(localStorage.getItem('star-drift-best-v1') || '{}'); if (saved && typeof saved === 'object') for (const key of Object.keys(levels)) best[key] = Number.isFinite(saved[key]) ? Math.max(0, Math.floor(saved[key])) : 0; } catch (_) { best = {}; }
  const starfield = Array.from({ length: 130 }, () => ({ x: Math.random(), y: Math.random(), r: rand(.5, 1.7), speed: rand(5, 28), a: rand(.17, .7) }));

  function resize() {
    const rect = shell.getBoundingClientRect(), previousWidth = W;
    W = H * rect.width / rect.height;
    player.x *= W / previousWidth;
    for (const rock of rocks) rock.x *= W / previousWidth;
    for (const item of pickups) item.x *= W / previousWidth;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    if (pointer) pointer = null;
    createBackdrop();
  }
  function createBackdrop() {
    backdrop.width = canvas.width; backdrop.height = canvas.height;
    const b = backdrop.getContext('2d');
    b.setTransform(backdrop.width / W, 0, 0, backdrop.height / H, 0, 0);
    b.fillStyle = '#101222'; b.fillRect(0, 0, W, H);
    const nebula = b.createRadialGradient(W * .58, H * .4, 10, W * .58, H * .4, W * .7);
    nebula.addColorStop(0, '#37315088'); nebula.addColorStop(.42, '#24254477'); nebula.addColorStop(1, '#10132300');
    b.fillStyle = nebula; b.fillRect(0, 0, W, H);
    const planetX = W * .91, planetY = H * .17, radius = Math.min(W * .33, 280);
    b.save(); b.translate(planetX, planetY); b.rotate(-.4);
    b.strokeStyle = '#a29aca16'; b.lineWidth = 1;
    for (let i = 0; i < 3; i++) { b.beginPath(); b.ellipse(0, 0, radius * (1.55 + i * .14), radius * (.5 + i * .075), 0, 0, Math.PI * 2); b.stroke(); }
    const planet = b.createRadialGradient(-radius * .47, -radius * .56, 0, 0, 0, radius);
    planet.addColorStop(0, '#665878'); planet.addColorStop(.35, '#383249'); planet.addColorStop(.8, '#1b1d30'); planet.addColorStop(1, '#111321');
    b.fillStyle = planet; b.beginPath(); b.arc(0, 0, radius, 0, Math.PI * 2); b.fill();
    b.strokeStyle = '#a59cc52a'; b.beginPath(); b.arc(0, 0, radius, 3.3, 5.5); b.stroke(); b.restore();
    b.strokeStyle = '#6d759509'; b.lineWidth = 1;
    for (let x = 0; x < W; x += 65) { b.beginPath(); b.moveTo(x, 0); b.lineTo(x, H); b.stroke(); }
    for (let y = 0; y < H; y += 65) { b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke(); }
    const floor = b.createLinearGradient(0, H * .7, 0, H); floor.addColorStop(0, '#18202d00'); floor.addColorStop(1, '#17253777');
    b.fillStyle = floor; b.fillRect(0, H * .7, W, H * .3);
  }

  function refreshBest() {
    $('best-score').textContent = (best[level] || 0).toLocaleString();
    $('best-mode').textContent = levels[level].name;
    $('best-caption').textContent = best[level] ? '下一次出发，也许就是新的纪录。' : '第一段传奇，就从这次出发。';
  }
  function showScreen(name) {
    for (const id of ['start-screen', 'pause-screen', 'end-screen']) $(id).classList.toggle('hidden', id !== name);
  }
  function announce(message, duration = 2) {
    $('game-toast').textContent = message; $('game-toast').classList.add('show'); toastClock = duration;
  }
  function tone(frequency, duration = .09, type = 'sine', volume = .035) {
    if (!soundOn || !audio) return;
    try { const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, audio.currentTime); oscillator.frequency.exponentialRampToValueAtTime(frequency * .6, audio.currentTime + duration); gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration); } catch (_) { /* Sound is optional. */ }
  }
  function start() {
    if (audio && soundOn && audio.state === 'suspended') audio.resume().catch(() => {});
    elapsed = 0; score = 0; starsCollected = 0; health = 3; sector = 1;
    rocks = []; pickups = []; particles = []; floaters = []; keys.clear(); pointer = null; pointerId = null;
    rockClock = .6; starClock = .45; shieldClock = 14; dashTime = 0; dashCooldown = 0; immunity = 1.5; shake = 0;
    player = { x: W / 2, y: H * .8, r: 13, tilt: 0 };
    phase = 'playing'; showScreen(null); $('pause-button').disabled = false; $('flight-status').innerHTML = '<i></i> 尽情飞行，星光就在前方';
    $('game-toast').classList.remove('show'); toastClock = 0; updateHUD(); canvas.focus({ preventScroll: true });
    if (matchMedia('(max-width: 780px)').matches) shell.scrollIntoView({ block: 'center', behavior: 'auto' });
    tone(520, .13);
  }
  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused'; keys.clear(); pointer = null; pointerId = null; showScreen('pause-screen'); $('pause-button').disabled = true; $('dash-button').disabled = true;
    $('flight-status').innerHTML = '<i></i> 飞行已暂停'; $('resume-button').focus({ preventScroll: true });
  }
  function resume() {
    if (phase !== 'paused') return;
    phase = 'playing'; showScreen(null); $('pause-button').disabled = false; updateHUD(); $('flight-status').innerHTML = '<i></i> 航线已恢复，继续出发'; canvas.focus({ preventScroll: true });
  }
  function end() {
    phase = 'over'; keys.clear(); pointer = null; pointerId = null;
    const final = Math.floor(score), isNew = final > (best[level] || 0);
    if (isNew) { best[level] = final; try { localStorage.setItem('star-drift-best-v1', JSON.stringify(best)); } catch (_) {} }
    $('final-score').textContent = final.toLocaleString(); $('final-time').textContent = Math.floor(elapsed) + 's'; $('final-stars').textContent = starsCollected; $('final-sector').textContent = String(sector).padStart(2, '0');
    $('record-badge').textContent = isNew ? '✦ 新纪录！这一程，超越自己。' : '✦ 本次航行完成';
    refreshBest(); showScreen('end-screen'); $('pause-button').disabled = true; $('dash-button').disabled = true; $('flight-status').innerHTML = '<i></i> 航行结束，期待再次出发'; $('again-button').focus({ preventScroll: true }); tone(160, .35, 'triangle', .045);
  }
  function dash() {
    if (phase !== 'playing' || dashCooldown > 0) return;
    dashTime = .65; dashCooldown = 5; immunity = Math.max(immunity, .65); announce('ϟ 冲刺！短暂无敌', .65); tone(680, .2, 'triangle'); updateHUD();
  }
  function burst(x, y, color, count = 15) {
    const total = reducedMotion ? Math.min(5, count) : count;
    for (let i = 0; i < total; i++) { const angle = rand(0, Math.PI * 2), speed = rand(35, 175); particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(.3, .7), max: .7, color, r: rand(1.5, 3.5) }); }
  }
  function spawnRock() {
    const radius = rand(20, 39), vertices = Array.from({ length: 9 }, () => rand(.73, 1.08));
    rocks.push({ x: rand(radius + 12, W - radius - 12), y: -radius * 2, r: radius, vy: (rand(130, 190) + Math.min(elapsed, 90) * 1.8) * levels[level].speed, vx: rand(-20, 20), rotation: rand(0, 6.28), spin: rand(-.7, .7), vertices });
  }
  function spawnPickup(type) { pickups.push({ type, x: rand(34, W - 34), y: -25, r: type === 'star' ? 11 : 15, vy: 155 * levels[level].speed, rotation: rand(0, 6.28) }); }
  function updateHUD() {
    $('score').textContent = String(Math.floor(score)).padStart(5, '0');
    $('sector').innerHTML = '<span class="live-dot"></span> 第 ' + String(sector).padStart(2, '0') + ' 星区';
    document.querySelectorAll('.life').forEach((life, index) => life.classList.toggle('on', index < health));
    $('lives-text').textContent = health; document.querySelector('.lives').setAttribute('aria-label', '剩余护盾 ' + health + ' 格');
    $('dash-button').disabled = phase !== 'playing' || dashCooldown > 0;
    $('dash-label').textContent = dashCooldown > 0 ? '充能 ' + dashCooldown.toFixed(1) + 's' : '冲刺就绪';
    $('dash-progress').style.width = ((1 - dashCooldown / 5) * 100) + '%';
  }

  function update(dt) {
    elapsed += dt; score += dt * 10; immunity = Math.max(0, immunity - dt); dashTime = Math.max(0, dashTime - dt); dashCooldown = Math.max(0, dashCooldown - dt); shake = Math.max(0, shake - dt);
    const newSector = Math.floor(elapsed / 15) + 1;
    if (newSector !== sector) { sector = newSector; announce('✦ 已进入第 ' + String(sector).padStart(2, '0') + ' 星区'); tone(850, .12); }
    let dx = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
    let dy = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
    const speed = 390 * (dashTime > 0 ? 1.8 : 1), previousX = player.x;
    if (dx || dy) { pointer = null; const length = Math.hypot(dx, dy); player.x += dx / length * speed * dt; player.y += dy / length * speed * dt; }
    else if (pointer) { dx = pointer.x - player.x; dy = pointer.y - player.y; const distance = Math.hypot(dx, dy), step = Math.min(distance, speed * dt); if (distance > 1) { player.x += dx / distance * step; player.y += dy / distance * step; } }
    else if (dashTime > 0) player.y -= 160 * dt;
    player.x = clamp(player.x, 25, W - 25); player.y = clamp(player.y, 105, H - 94); player.tilt += (clamp((player.x - previousX) * .028, -.36, .36) - player.tilt) * Math.min(1, dt * 12);
    rockClock -= dt; starClock -= dt; shieldClock -= dt;
    if (rockClock <= 0) { spawnRock(); rockClock = Math.max(.32, .92 - elapsed * .006) * levels[level].spawn * clamp(650 / W, .68, 1.08); }
    if (starClock <= 0) { spawnPickup('star'); starClock = rand(1.05, 1.65); }
    if (shieldClock <= 0) { spawnPickup('shield'); shieldClock = rand(17, 22); }
    for (let i = rocks.length - 1; i >= 0; i--) {
      const rock = rocks[i]; rock.y += rock.vy * dt; rock.x += rock.vx * dt; rock.rotation += rock.spin * dt;
      if (rock.y > H + 80) { rocks.splice(i, 1); continue; }
      if (Math.hypot(rock.x - player.x, rock.y - player.y) < rock.r * .8 + player.r && immunity <= 0) {
        rocks.splice(i, 1); health--; immunity = 1.5; shake = reducedMotion ? 0 : .19; burst(player.x, player.y, '#eab7a4', 25); tone(100, .18, 'sawtooth', .026);
        announce(health ? '护盾受损 · 剩余 ' + health + ' 格' : '护盾已耗尽'); updateHUD();
        if (health <= 0) { end(); return; }
      }
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const item = pickups[i]; item.y += item.vy * dt; item.rotation += dt;
      if (item.y > H + 30) { pickups.splice(i, 1); continue; }
      if (Math.hypot(item.x - player.x, item.y - player.y) < item.r + player.r + 7) {
        pickups.splice(i, 1); const color = item.type === 'star' ? '#c9f76a' : '#85e5eb';
        burst(item.x, item.y, color, 13);
        if (item.type === 'star') { score += 50; starsCollected++; floaters.push({ x: item.x, y: item.y, text: '+50', life: .8, color }); tone(950, .1); }
        else { health = Math.min(3, health + 1); announce('◇ 护盾补给 · 当前 ' + health + ' 格'); tone(570, .2); updateHUD(); }
      }
    }
    if (!reducedMotion && Math.random() < .65) particles.push({ x: player.x + rand(-5, 5), y: player.y + 24, vx: rand(-8, 8), vy: rand(60, 100), r: rand(1, 3), life: .24, max: .24, color: dashTime ? '#d7ffa1' : '#a197ff' });
    particles = particles.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; return p.life > 0; });
    floaters = floaters.filter(p => { p.y -= dt * 30; p.life -= dt; return p.life > 0; });
    uiClock -= dt; if (uiClock <= 0) { updateHUD(); uiClock = .1; }
  }

  function drawStar(x, y, radius, color, rotation = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.beginPath();
    for (let i = 0; i < 8; i++) { const angle = -Math.PI / 2 + i * Math.PI / 4, r = i % 2 ? radius * .3 : radius; const px = Math.cos(angle) * r, py = Math.sin(angle) * r; if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.closePath(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.fill(); ctx.restore();
  }
  function drawRock(rock) {
    ctx.save(); ctx.translate(rock.x, rock.y); ctx.rotate(rock.rotation); ctx.beginPath();
    rock.vertices.forEach((v, i) => { const a = i / rock.vertices.length * Math.PI * 2; const x = Math.cos(a) * rock.r * v, y = Math.sin(a) * rock.r * v; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
    const fill = ctx.createLinearGradient(-rock.r, -rock.r, rock.r, rock.r); fill.addColorStop(0, '#77717d'); fill.addColorStop(.4, '#484455'); fill.addColorStop(1, '#292b3d'); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#c4b0b547'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-rock.r * .7, -rock.r * .35); ctx.lineTo(-rock.r * .1, -rock.r * .6); ctx.lineTo(rock.r * .48, -rock.r * .05); ctx.lineTo(rock.r * .8, -rock.r * .2); ctx.strokeStyle = '#aaa0b238'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-rock.r * .1, rock.r * .15, rock.r * .22, rock.r * .17, -.4, 0, Math.PI * 2); ctx.fillStyle = '#1b1d303e'; ctx.fill(); ctx.restore();
  }
  function drawShip(x, y, tilt, demo = false) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    if (!demo && immunity > 0 && dashTime <= 0 && !reducedMotion) ctx.globalAlpha = .6 + Math.sin(visualTime * 25) * .3;
    const boosted = !demo && dashTime > 0;
    const flame = reducedMotion ? 23 : 22 + Math.sin(visualTime * 28) * 7;
    const glow = ctx.createLinearGradient(0, 14, 0, 70); glow.addColorStop(0, boosted ? '#d7ff99dd' : '#b0a1ffcc'); glow.addColorStop(1, '#aba0ff00');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.moveTo(-8, 19); ctx.quadraticCurveTo(-6, 37, 0, 24 + flame * (boosted ? 2 : 1)); ctx.quadraticCurveTo(6, 37, 8, 19); ctx.closePath(); ctx.fill();
    ctx.shadowColor = boosted ? '#c9f76a' : '#aaa2ef'; ctx.shadowBlur = boosted ? 25 : 12;
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(22, 23); ctx.lineTo(7, 17); ctx.lineTo(0, 22); ctx.lineTo(-7, 17); ctx.lineTo(-22, 23); ctx.closePath(); ctx.fillStyle = '#d6dbec'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#7a839e'; ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(-7, 17); ctx.lineTo(-22, 23); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#879877'; ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(22, 23); ctx.lineTo(7, 17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9f76a'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(5, 5); ctx.lineTo(0, 10); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    if (boosted || (!demo && immunity > 0)) { ctx.strokeStyle = boosted ? '#d8ff9eaa' : '#8de9ef99'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 34, 42, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(backdrop, 0, 0); ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.save(); if (shake > 0) ctx.translate(rand(-4, 4), rand(-4, 4));
    for (const star of starfield) { const y = ((star.y * H + visualTime * star.speed * (dashTime > 0 ? 3 : 1)) % H); ctx.fillStyle = `rgba(191,199,229,${star.a})`; if (dashTime > 0 && !reducedMotion) ctx.fillRect(star.x * W, y, star.r, 18); else { ctx.beginPath(); ctx.arc(star.x * W, y, star.r, 0, Math.PI * 2); ctx.fill(); } }
    if (phase === 'menu') {
      ctx.globalAlpha = .55;
      drawRock({ x: W * .13, y: H * .37 + (reducedMotion ? 0 : Math.sin(visualTime * .3) * 12), r: 36, rotation: .3 + visualTime * .015, vertices: [1,.9,.74,1,.8,.9,.7,1,.86] });
      drawRock({ x: W * .82, y: H * .68 + (reducedMotion ? 0 : Math.cos(visualTime * .3) * 10), r: 48, rotation: 1.5, vertices: [.8,1,.8,.9,.8,1,.8,.72,.9] });
      drawRock({ x: W * .2, y: H * .82, r: 17, rotation: .8, vertices: [1,.8,.9,1,.9,.7,.8,1,.8] });
      drawStar(W * .76, H * .44, 10, '#d0ef8d', .2); drawStar(W * .3, H * .18, 6, '#e3e5f4', .2); ctx.globalAlpha = 1;
      drawShip(W * .5, H * .86, reducedMotion ? -.08 : Math.sin(visualTime * .7) * .07, true);
    } else {
      for (const rock of rocks) drawRock(rock);
      for (const item of pickups) {
        if (item.type === 'star') drawStar(item.x, item.y, item.r, '#c9f76a', Math.sin(item.rotation) * .2);
        else { ctx.save(); ctx.translate(item.x, item.y); ctx.shadowColor = '#85e5eb'; ctx.shadowBlur = 16; ctx.strokeStyle = '#85e5eb'; ctx.fillStyle = '#243e5488'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0,-17); ctx.lineTo(14,-9); ctx.lineTo(11,8); ctx.lineTo(0,17); ctx.lineTo(-11,8); ctx.lineTo(-14,-9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(-5,0); ctx.lineTo(5,0); ctx.moveTo(0,-5); ctx.lineTo(0,5); ctx.stroke(); ctx.restore(); }
      }
      for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
      if (phase !== 'over') drawShip(player.x, player.y, player.tilt);
      for (const p of floaters) { ctx.globalAlpha = Math.min(1, p.life / .4); ctx.fillStyle = p.color; ctx.font = '600 18px monospace'; ctx.textAlign = 'center'; ctx.fillText(p.text, p.x, p.y); } ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000 || 0, .033); lastTime = now;
    if (phase === 'playing' || phase === 'menu') { if (!reducedMotion || phase === 'playing') visualTime += dt; }
    if (phase === 'playing') { update(dt); if (toastClock > 0) { toastClock -= dt; if (toastClock <= 0) $('game-toast').classList.remove('show'); } }
    draw(); requestAnimationFrame(frame);
  }

  document.querySelectorAll('[data-level]').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.level === level ? 'true' : 'false');
    button.addEventListener('click', () => { level = button.dataset.level; document.querySelectorAll('[data-level]').forEach(b => { const selected = b === button; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected)); }); refreshBest(); });
  });
  $('start-button').addEventListener('click', start); $('again-button').addEventListener('click', start); $('restart-paused').addEventListener('click', start);
  $('pause-button').addEventListener('click', pause); $('resume-button').addEventListener('click', resume); $('dash-button').addEventListener('click', dash);
  $('back-button').addEventListener('click', () => { phase = 'menu'; rocks = []; pickups = []; particles = []; floaters = []; score = 0; health = 3; sector = 1; dashCooldown = 0; dashTime = 0; $('game-toast').classList.remove('show'); showScreen('start-screen'); updateHUD(); $('pause-button').disabled = true; $('flight-status').innerHTML = '<i></i> 飞船就绪，等待出发'; $('start-button').focus({ preventScroll: true }); });
  $('sound-button').addEventListener('click', () => {
    if (!soundOn) {
      try { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return; if (!audio) audio = new Audio(); audio.resume().catch(() => {}); } catch (_) { return; }
    }
    soundOn = !soundOn; $('sound-button').setAttribute('aria-pressed', String(soundOn)); $('sound-button').title = soundOn ? '关闭游戏音效' : '开启游戏音效'; $('sound-label').textContent = soundOn ? '音效开启' : '音效关闭'; $('sound-waves').setAttribute('d', soundOn ? 'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14' : 'm16 9 6 6m0-6-6 6'); tone(750, .07);
  });
  window.addEventListener('keydown', event => {
    if ($('guide-dialog').open) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (event.target instanceof HTMLButtonElement && (key === 'Enter' || key === ' ')) return;
    if (phase === 'playing' && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d',' '].includes(key)) event.preventDefault();
    if (event.repeat && [' ', 'p', 'Escape', 'Enter'].includes(key)) return;
    if ((key === 'p' || key === 'Escape') && (phase === 'playing' || phase === 'paused')) { event.preventDefault(); phase === 'playing' ? pause() : resume(); }
    else if (key === 'Enter' && (phase === 'menu' || phase === 'over')) { event.preventDefault(); start(); }
    else if (key === ' ') dash();
    else if (phase === 'playing') keys.add(key);
  });
  window.addEventListener('keyup', event => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
  function setPointer(event) { const rect = canvas.getBoundingClientRect(); pointer = { x: (event.clientX - rect.left) / rect.width * W, y: (event.clientY - rect.top) / rect.height * H - (event.pointerType === 'touch' ? 38 : 0) }; }
  canvas.addEventListener('pointerdown', event => { if (phase !== 'playing' || pointerId !== null) return; event.preventDefault(); pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId); setPointer(event); canvas.focus({ preventScroll: true }); });
  canvas.addEventListener('pointermove', event => { if (phase === 'playing' && event.pointerId === pointerId) setPointer(event); });
  function releasePointer(event) { if (event.pointerId === pointerId) { pointerId = null; pointer = null; } }
  canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer); canvas.addEventListener('lostpointercapture', releasePointer);
  window.addEventListener('blur', () => { keys.clear(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  document.querySelectorAll('.guide-open').forEach(button => button.addEventListener('click', () => { if (phase === 'playing') pause(); $('guide-dialog').showModal(); }));
  $('close-guide').addEventListener('click', () => $('guide-dialog').close()); $('guide-done').addEventListener('click', () => $('guide-dialog').close());
  $('guide-dialog').addEventListener('click', event => { if (event.target === $('guide-dialog')) { const rect = $('guide-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('guide-dialog').close(); } });
  new ResizeObserver(resize).observe(shell);
  resize(); refreshBest(); updateHUD(); requestAnimationFrame(frame);
})();
