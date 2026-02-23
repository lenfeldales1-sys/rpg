import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- KONFIGURACE A KONSTANTY ---

// Rychlost hráče (jednotky za sekundu)
const RYCHLOST_HRACE = 15.0;
// Rychlost střely
const RYCHLOST_STRELY = 50.0;
// Rychlost nepřátel (robotů)
const RYCHLOST_NEPRITELE = 6.0;
// Poloměr pro kolize (hráč, střela, nepřítel)
const POLOMER_KOLIZE = 0.8; // Zvětšeno kvůli větším robotům
// Maximální zdraví hráče
const MAX_ZDRAVI = 100;
// Jak často se spawnují nepřátelé (v milisekundách)
let SPAWN_INTERVAL = 2000;
// Poškození od nepřítele
const POSKOZENI_NEPRITELE = 10;
// Rozměr arény (polovina šířky)
const VELIKOST_ARENY = 50;

// --- GLOBÁLNÍ PROMĚNNÉ ---

let scena, kamera, renderer, controls;
let clock; // Pro měření času mezi snímky (delta time)
let playerVelocity = new THREE.Vector3();
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let isGameActive = false; // Zda hra běží
let skore = 0;
let zdravi = MAX_ZDRAVI;
let lastSpawnTime = 0;

// Seznamy objektů
const strely = [];
const nepratele = [];

// UI Elementy
const uiScore = document.getElementById('score');
const uiHealth = document.getElementById('health');
const uiInstructions = document.getElementById('instructions');
const uiGameOver = document.getElementById('game-over');
const uiFinalScore = document.getElementById('final-score');

// --- TŘÍDY ---

/**
 * Třída reprezentující střelu vystřelenou hráčem.
 */
class Strela {
    constructor(pozice, smer) {
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 }) // Zelená zářící koule
        );
        this.mesh.position.copy(pozice);

        // Nastavíme směr střely
        this.velocity = smer.clone().normalize().multiplyScalar(RYCHLOST_STRELY);

        // Přidáme do scény
        scena.add(this.mesh);

        // Životnost střely (aby nezpomalovala hru, když letí do nekonečna)
        this.zivotnost = 2.0; // sekundy
    }

    update(delta) {
        // Posuneme střelu
        this.mesh.position.addScaledVector(this.velocity, delta);
        this.zivotnost -= delta;

        // Vrátí true, pokud je střela "mrtvá" (vypršel čas)
        return this.zivotnost <= 0;
    }

    odstran() {
        scena.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

/**
 * Třída reprezentující nepřítele - Robota.
 * Skládá se z několika částí (Group).
 */
class Nepritel {
    constructor() {
        this.group = new THREE.Group();

        // Materiály
        const armorMat = new THREE.MeshStandardMaterial({
            color: 0xaa0000,
            roughness: 0.3,
            metalness: 0.8
        });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Svítící červená
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

        // 1. Tělo (Torzo)
        const torsoGeo = new THREE.CylinderGeometry(0.4, 0.3, 1.0, 8);
        const torso = new THREE.Mesh(torsoGeo, armorMat);
        torso.position.y = 0.5; // Zvedneme nad zem
        this.group.add(torso);

        // 2. Hlava
        const headGeo = new THREE.BoxGeometry(0.5, 0.4, 0.5);
        const head = new THREE.Mesh(headGeo, darkMat);
        head.position.y = 1.1; // Na krku
        this.group.add(head);

        // 3. Oči (Svítící pruh)
        const eyeGeo = new THREE.BoxGeometry(0.4, 0.1, 0.1);
        const eye = new THREE.Mesh(eyeGeo, glowMat);
        eye.position.set(0, 1.15, 0.26); // Na obličeji
        this.group.add(eye);

        // 4. Paže (Levitující koule vedle těla)
        const armGeo = new THREE.SphereGeometry(0.2, 8, 8);
        this.leftArm = new THREE.Mesh(armGeo, armorMat);
        this.leftArm.position.set(-0.6, 0.8, 0);
        this.group.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, armorMat);
        this.rightArm.position.set(0.6, 0.8, 0);
        this.group.add(this.rightArm);


        // Spawn na okraji arény (náhodný úhel)
        const uhel = Math.random() * Math.PI * 2;
        const vzdalenost = VELIKOST_ARENY - 2; // Trochu uvnitř zdí
        this.group.position.set(
            Math.cos(uhel) * vzdalenost,
            0.5, // Výška nad zemí (vznáší se)
            Math.sin(uhel) * vzdalenost
        );

        // Otočit čelem ke středu arény (přibližně)
        this.group.lookAt(0, 0.5, 0);

        scena.add(this.group);

        // Pro animaci
        this.timeOffset = Math.random() * 100;
    }

    update(delta, poziceHrace) {
        // Vektor směrem k hráči
        const smer = new THREE.Vector3().subVectors(poziceHrace, this.group.position);
        smer.y = 0; // Nepřátelé se hýbou jen po zemi (levitují ve stálé výšce)
        smer.normalize();

        // Posun
        this.group.position.addScaledVector(smer, RYCHLOST_NEPRITELE * delta);

        // Otočení čelem k hráči
        this.group.lookAt(poziceHrace.x, this.group.position.y, poziceHrace.z);

        // Animace (Levitace + pohyb rukou)
        const time = clock.getElapsedTime() + this.timeOffset;

        // Levitace celého těla nahoru/dolů
        this.group.position.y = 0.5 + Math.sin(time * 2) * 0.1;

        // Pohyb paží (dopředu/dozadu jako při běhu)
        this.leftArm.position.z = Math.sin(time * 10) * 0.2;
        this.rightArm.position.z = Math.sin(time * 10 + Math.PI) * 0.2; // Opačná fáze
    }

    odstran() {
        scena.remove(this.group);
        // Rekurzivně uvolnit paměť pro všechny potomky v grupě
        this.group.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}

// --- HLAVNÍ FUNKCE ---

function init() {
    // 1. Nastavení scény
    scena = new THREE.Scene();
    // Černá mlha pro atmosféru a skrytí konců arény
    scena.fog = new THREE.FogExp2(0x000000, 0.02); // Snížena hustota mlhy pro lepší viditelnost

    // 2. Kamera
    kamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    kamera.position.y = 1.6; // Výška očí

    // Model zbraně připojený ke kameře
    vytvorZbran();

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // 4. Osvětlení (VYLEPŠENO)

    // Hemisphere Light (Nebe = modrá, Země = tmavá) - Celkové ambientní světlo
    const hemiLight = new THREE.HemisphereLight(0x444488, 0x000000, 0.6);
    scena.add(hemiLight);

    // Ambientní světlo pro jistotu
    const ambientLight = new THREE.AmbientLight(0x222222);
    scena.add(ambientLight);

    // Světlo hráče (baterka/aura) - ZESÍLENO
    const playerLight = new THREE.PointLight(0xffffff, 1.5, 30);
    kamera.add(playerLight); // Světlo se hýbe s kamerou
    scena.add(kamera); // Přidáme kameru do scény

    // 5. Prostředí (Podlaha a Zdi)
    vytvorProstredi();

    // 6. Ovládání (PointerLockControls) - VYLEPŠENO
    controls = new PointerLockControls(kamera, document.body);

    // 7. Clock
    clock = new THREE.Clock();

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('mousedown', onMouseDown, false);

    // Kliknutí na instrukce zamkne kurzor a spustí hru
    uiInstructions.addEventListener('click', () => {
        controls.lock();
    });

    // Restart po game over
    uiGameOver.addEventListener('click', () => {
        restartHry();
    });

    // Sledování stavu Pointer Lock (pro pauzu/start)
    controls.addEventListener('lock', () => {
        isGameActive = true;
        uiInstructions.style.display = 'none';
        uiGameOver.style.display = 'none';
    });

    controls.addEventListener('unlock', () => {
        isGameActive = false;
        // Pokud nejsme mrtví, zobrazíme instrukce jako pauzu
        if (zdravi > 0) {
            uiInstructions.style.display = 'block';
        }
    });

    // Spuštění smyčky
    animate();
}

function vytvorZbran() {
    // Jednoduchá zbraň z geometrických tvarů
    const gunGroup = new THREE.Group();

    // Tělo zbraně
    const hlavenGeo = new THREE.BoxGeometry(0.1, 0.1, 0.6);
    const hlavenMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.2 });
    const hlaven = new THREE.Mesh(hlavenGeo, hlavenMat);
    hlaven.position.set(0, 0, 0);

    // Svítící detaily
    const detailGeo = new THREE.BoxGeometry(0.12, 0.02, 0.5);
    const detailMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // Neon cyan
    const detail = new THREE.Mesh(detailGeo, detailMat);
    detail.position.set(0, 0.06, 0);

    gunGroup.add(hlaven);
    gunGroup.add(detail);

    // Pozice zbraně na obrazovce (vpravo dole)
    gunGroup.position.set(0.3, -0.2, -0.5);

    // Přidáme zbraň ke kameře, aby se s ní hýbala
    kamera.add(gunGroup);

    // Uložíme referenci pro animaci zpětného rázu
    kamera.userData.gun = gunGroup;
}

function vytvorProstredi() {
    // Podlaha - Neon Grid
    const gridHelper = new THREE.GridHelper(VELIKOST_ARENY * 2, 40, 0xff00ff, 0x220022); // Magenta mřížka
    scena.add(gridHelper);

    // Podlaha (fyzická, pro vizuál pod mřížkou)
    const planeGeo = new THREE.PlaneGeometry(VELIKOST_ARENY * 2, VELIKOST_ARENY * 2);
    const planeMat = new THREE.MeshStandardMaterial({
        color: 0x050505,
        roughness: 0.8
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.05; // Těsně pod mřížkou
    scena.add(plane);

    // Zdi okolo arény
    const wallHeight = 15;
    const wallGeo = new THREE.BoxGeometry(VELIKOST_ARENY * 2, wallHeight, 2);
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.1,
        metalness: 0.5,
        emissive: 0x110011, // Jemná fialová záře
        emissiveIntensity: 0.2
    });

    // 4 Zdi
    const zdi = [
        { x: 0, z: -VELIKOST_ARENY, ry: 0 },
        { x: 0, z: VELIKOST_ARENY, ry: 0 },
        { x: -VELIKOST_ARENY, z: 0, ry: Math.PI / 2 },
        { x: VELIKOST_ARENY, z: 0, ry: Math.PI / 2 }
    ];

    zdi.forEach(z => {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(z.x, wallHeight / 2, z.z);
        wall.rotation.y = z.ry;
        scena.add(wall);
    });
}

function restartHry() {
    zdravi = MAX_ZDRAVI;
    skore = 0;
    SPAWN_INTERVAL = 2000;

    uiHealth.textContent = zdravi;
    uiScore.textContent = skore;
    uiGameOver.style.display = 'none';

    // Vyčistit nepřátele a střely
    nepratele.forEach(n => n.odstran());
    nepratele.length = 0;
    strely.forEach(s => s.odstran());
    strely.length = 0;

    // Reset pozice hráče
    kamera.position.set(0, 1.6, 0);
    kamera.rotation.set(0, 0, 0);

    controls.lock();
}

// --- OVLÁDÁNÍ ---

function onWindowResize() {
    kamera.aspect = window.innerWidth / window.innerHeight;
    kamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

// Poznámka: MouseMove už neřešíme ručně, dělá to PointerLockControls

function onMouseDown(event) {
    if (!isGameActive) return;

    if (event.button === 0) { // Levé tlačítko
        vystrel();
    }
}

function vystrel() {
    // Získání směru, kam se hráč dívá
    const smer = new THREE.Vector3();
    kamera.getWorldDirection(smer);

    // Pozice startu střely (trochu před hráčem)
    const startPozice = kamera.position.clone().add(smer.multiplyScalar(0.5));
    smer.normalize();

    // Vytvoření střely
    const strela = new Strela(startPozice, smer);
    strely.push(strela);

    // Efekt "cuknutí" zbraní
    const gun = kamera.userData.gun;
    if (gun) {
        gun.position.z += 0.15; // Výraznější cuknutí
        setTimeout(() => {
            gun.position.z -= 0.15; // Návrat
        }, 80);
    }
}

// --- HERNÍ SMYČKA ---

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); // Čas od posledního snímku v sekundách

    if (isGameActive) {
        // 1. Pohyb hráče (WASD)
        // PointerLockControls nemají vestavěný pohyb WASD, jen rotaci.
        // Musíme implementovat pohyb relativně k pohledu kamery.

        playerVelocity.set(0, 0, 0);

        // Pohyb relativně k rotaci kamery (ale pouze v rovině XZ)
        const forward = new THREE.Vector3();
        kamera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        kamera.getWorldDirection(right);
        right.cross(new THREE.Vector3(0, 1, 0));
        right.y = 0;
        right.normalize();

        if (moveForward) playerVelocity.add(forward.multiplyScalar(RYCHLOST_HRACE));
        if (moveBackward) playerVelocity.add(forward.multiplyScalar(-RYCHLOST_HRACE));
        if (moveRight) playerVelocity.add(right.multiplyScalar(RYCHLOST_HRACE));
        if (moveLeft) playerVelocity.add(right.multiplyScalar(-RYCHLOST_HRACE));

        // Move controls object (PointerLockControls má metodu moveRight/moveForward, ale ta posouvá objekt)
        // Místo toho prostě posuneme kameru ručně o vypočítanou rychlost
        controls.getObject().position.addScaledVector(playerVelocity, delta);

        // Kontrola hranic arény
        const limit = VELIKOST_ARENY - 2;
        const pos = controls.getObject().position;
        pos.x = Math.max(-limit, Math.min(limit, pos.x));
        pos.z = Math.max(-limit, Math.min(limit, pos.z));


        // 2. Update střel
        for (let i = strely.length - 1; i >= 0; i--) {
            const strela = strely[i];
            const jeMrtva = strela.update(delta);
            if (jeMrtva) {
                strela.odstran();
                strely.splice(i, 1);
            }
        }

        // 3. Spawnování nepřátel
        const time = clock.getElapsedTime() * 1000; // ms
        if (time - lastSpawnTime > SPAWN_INTERVAL) {
            nepratele.push(new Nepritel());
            lastSpawnTime = time;
            // Zvyšování obtížnosti
            if (SPAWN_INTERVAL > 500) SPAWN_INTERVAL -= 50;
        }

        // 4. Update nepřátel a kolize
        const hracPozice = controls.getObject().position.clone();

        for (let i = nepratele.length - 1; i >= 0; i--) {
            const nepritel = nepratele[i];
            nepritel.update(delta, hracPozice);

            // Kolize Nepřítel vs Hráč
            // Používáme group.position
            if (nepritel.group.position.distanceTo(hracPozice) < 1.5) {
                // Hráč dostal zásah
                zdravi -= POSKOZENI_NEPRITELE;
                uiHealth.textContent = zdravi;

                // Odstranit nepřítele
                nepritel.odstran();
                nepratele.splice(i, 1);

                if (zdravi <= 0) {
                    gameOver();
                }
                continue;
            }

            // Kolize Nepřítel vs Střela
            for (let j = strely.length - 1; j >= 0; j--) {
                const strela = strely[j];
                // Zvětšený poloměr kolize pro roboty
                if (nepritel.group.position.distanceTo(strela.mesh.position) < POLOMER_KOLIZE) {
                    // Zásah!
                    skore += 10;
                    uiScore.textContent = skore;

                    // Odstranit oba
                    nepritel.odstran();
                    nepratele.splice(i, 1);

                    strela.odstran();
                    strely.splice(j, 1);

                    break;
                }
            }
        }
    }

    renderer.render(scena, kamera);
}

function gameOver() {
    isGameActive = false;
    controls.unlock(); // Uvolnit myš
    uiGameOver.style.display = 'block';
    uiFinalScore.textContent = skore;
}

// Spuštění
init();
