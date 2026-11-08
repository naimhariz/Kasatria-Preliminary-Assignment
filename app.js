import * as THREE from 'three';
import TWEEN from 'three/addons/libs/tween.module.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

/* =================== CONFIG =================== */
const CONFIG = {
  CLIENT_ID: '958979983394-ejrcpvpf7n081ed38l6n5pqmplttpnnq.apps.googleusercontent.com', // Google Cloud > APIs & Services > Credentials > OAuth client (Web)
  SHEET_ID:  '1iEhGkXuguC0WD7at7CPSLwrcd7pi60xvZjZO-J0iSXc',                                   // the long id in the Sheet's URL
  TAB:       'Data Template',                                          // the tab (sheet) name that holds the data
};
/* ============================================================== */

const configured = !CONFIG.CLIENT_ID.startsWith('YOUR_') && !CONFIG.SHEET_ID.startsWith('YOUR_');
const $ = id => document.getElementById(id);

/* ---------- Google login + Sheets fetch ---------- */
let tokenClient;
$('signin').onclick = () => {
  if (!configured) { $('msg').textContent = 'Set CLIENT_ID and SHEET_ID in the CONFIG block first.'; return; }
  if (!window.google || !google.accounts) { $('msg').textContent = 'Google script still loading, try again.'; return; }
  tokenClient ||= google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/userinfo.email',
    callback: onToken,
  });
  tokenClient.requestAccessToken({ prompt: 'select_account' });
};
$('demo').onclick = async () => {
  $('msg').textContent = 'Loading preview…';
  try { start(await loadPublicSheet()); }
  catch (e) { $('msg').textContent = 'Preview needs the Sheet set to "Anyone with the link can view". (' + e.message + ')'; }
};

async function onToken(resp) {
  if (resp.error) { $('msg').textContent = 'Login failed: ' + resp.error; return; }
  try {
    const h = { Authorization: 'Bearer ' + resp.access_token };
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: h }).then(r => r.json()).then(u => $('user').textContent = u.email || '').catch(() => {});
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent("'" + CONFIG.TAB.replace(/'/g, "''") + "'")}`;
    const r = await fetch(url, { headers: h });
    if (!r.ok) throw new Error((await r.json()).error?.message || r.status);
    const { values } = await r.json();
    start(rowsToPeople(values));
  } catch (e) { $('msg').textContent = 'Could not load sheet: ' + e.message; }
}

/* ---------- Data mapping ---------- */
function rowsToPeople(values) {
  const head = values[0].map(h => String(h).toLowerCase().trim());
  const find = (...keys) => head.findIndex(h => keys.some(k => h.includes(k)));
  const c = { name: find('name'), photo: find('photo', 'image', 'picture', 'img'), age: find('age'),
              country: find('country', 'nation'), interest: find('interest', 'profession', 'job', 'occupation', 'hobby'),
              worth: find('net worth', 'networth', 'worth', 'salary', 'income') };
  return values.slice(1).filter(r => r.length).map(r => ({
    name: r[c.name] ?? '', photo: r[c.photo] ?? '', age: r[c.age] ?? '', country: r[c.country] ?? '',
    interest: r[c.interest] ?? '', worth: parseFloat(String(r[c.worth] ?? '0').replace(/[^0-9.\-]/g, '')) || 0,
  }));
}
async function loadPublicSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CONFIG.TAB)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const text = await r.text();
  if (text.trimStart().startsWith('<')) throw new Error('Sheet is private');
  return rowsToPeople(parseCSV(text));
}
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

/* ---------- 3D scene ---------- */
let camera, scene, renderer, controls;
const objects = [], targets = { table: [], sphere: [], helix: [], grid: [] };

function start(people) {
  $('login').style.display = 'none';
  init(people);
  transform(targets.table, 2000);
  setActive('table');
  animate();
}

function tier(w) { return w < 100000 ? 'red' : w > 200000 ? 'green' : 'orange'; }
const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

function init(people) {
  camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 10000);
  camera.position.z = 3500;
  scene = new THREE.Scene();

  people.forEach(p => {
    const el = document.createElement('div');
    el.className = 'element ' + tier(p.worth);
    el.title = `${p.name} — $${p.worth.toLocaleString()}`;
    const initials = p.name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
    el.innerHTML = `<div class="country">${esc(p.country)}</div><div class="age">${esc(p.age)}</div>
      <div class="photo${p.photo ? '' : ' noimg'}">${p.photo ? `<img src="${esc(p.photo)}" referrerpolicy="no-referrer" onerror="var d=this.parentNode;this.remove();d.classList.add('noimg')">` : ''}<span>${esc(initials)}</span></div>
      <div class="name">${esc(p.name)}</div><div class="interest">${esc(p.interest)}</div>`;
    const obj = new CSS3DObject(el);
    obj.position.set(Math.random() * 4000 - 2000, Math.random() * 4000 - 2000, Math.random() * 4000 - 2000);
    scene.add(obj); objects.push(obj);
  });
  const N = objects.length;

  // TABLE — 20 x 10
  for (let i = 0; i < N; i++) {
    const o = new THREE.Object3D();
    o.position.set((i % 20) * 140 - 1330, -(Math.floor(i / 20) % 10) * 180 + 810, 0);
    targets.table.push(o);
  }
  // SPHERE
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const phi = Math.acos(-1 + (2 * i) / N), theta = Math.sqrt(N * Math.PI) * phi;
    const o = new THREE.Object3D();
    o.position.setFromSphericalCoords(900, phi, theta);
    v.copy(o.position).multiplyScalar(2); o.lookAt(v);
    targets.sphere.push(o);
  }
  // DOUBLE HELIX — two strands (even / odd tiles), 180° apart, ~3 turns
  const per = Math.ceil(N / 2), R = 700, STEP = 22, DTHETA = (3 * 2 * Math.PI) / per;
  for (let i = 0; i < N; i++) {
    const strand = i % 2, j = Math.floor(i / 2);
    const theta = j * DTHETA + strand * Math.PI, y = -(j * STEP) + (per * STEP) / 2;
    const o = new THREE.Object3D();
    o.position.setFromCylindricalCoords(R, theta, y);
    v.set(o.position.x * 2, o.position.y, o.position.z * 2); o.lookAt(v);
    targets.helix.push(o);
  }

  // GRID — 5 wide x 4 tall x 10 deep = 200 tiles
  for (let i = 0; i < N; i++) {
    const o = new THREE.Object3D();
    o.position.set((i % 5) * 400 - 800, -(Math.floor(i / 5) % 4) * 400 + 600, Math.floor(i / 20) * 500 - 2250);
    targets.grid.push(o);
  }

  renderer = new CSS3DRenderer();
  renderer.setSize(innerWidth, innerHeight);
  $('container').appendChild(renderer.domElement);

  controls = new TrackballControls(camera, renderer.domElement);
  controls.minDistance = 500; controls.maxDistance = 7000;
  controls.addEventListener('change', render);

  for (const k of ['table', 'sphere', 'helix', 'grid']) {
    $(k).onclick = () => { transform(targets[k], 2000); setActive(k); };
  }
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); render();
  });
}

function setActive(k) { for (const b of document.querySelectorAll('#menu button')) b.classList.toggle('active', b.id === k); }

function transform(list, duration) {
  TWEEN.removeAll();
  objects.forEach((obj, i) => {
    const t = list[i];
    new TWEEN.Tween(obj.position).to({ x: t.position.x, y: t.position.y, z: t.position.z }, Math.random() * duration + duration).easing(TWEEN.Easing.Exponential.InOut).start();
    new TWEEN.Tween(obj.rotation).to({ x: t.rotation.x, y: t.rotation.y, z: t.rotation.z }, Math.random() * duration + duration).easing(TWEEN.Easing.Exponential.InOut).start();
  });
  new TWEEN.Tween({}).to({}, duration * 2).onUpdate(render).start();
}

function animate() { requestAnimationFrame(animate); TWEEN.update(); controls.update(); }
function render() { renderer.render(scene, camera); }
