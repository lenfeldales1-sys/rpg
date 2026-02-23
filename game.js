import * as THREE from 'three';

// --- KONFIGURACE A KONSTANTY ---

// Rychlost hráče (jednotky za sekundu)
const RYCHLOST_HRACE = 15.0;
// Rychlost střely
const RYCHLOST_STRELY = 50.0;
// Rychlost nepřátel (glitchů)
const RYCHLOST_NEPRITELE = 6.0;
// Poloměr pro kolize (hráč, střela, nepřítel)
const POLOMER_KOLIZE = 0.5;
// Maximální zdraví hráče
const MAX_ZDRAVI = 100;
// Jak často se spawnují nepřátelé (v milisekundách)
let SPAWN_INTERVAL = 2000;
// Poškození od nepřítele
const POSKOZENI_NEPRITELE = 10;
// Rozměr arény (polovina šířky)
const VELIKOST_ARENY = 50;

// --- GLOBÁLNÍ PROMĚNNÉ ---

let scena, kamera, renderer;
let clock; // Pro měření času mezi snímky (delta time)
let playerVelocity = new THREE.Vector3();
let playerDirection = new THREE.Vector3();
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
 * Třída reprezentující nepřítele (Glitch).
 */
class Nepritel {
    constructor() {
        // Náhodný tvar: Jehlan (Cone) nebo Kostka (Box)
        const isCube = Math.random() > 0.5;
        const geometry = isCube
            ? new THREE.BoxGeometry(1, 1, 1)
            : new THREE.ConeGeometry(0.5, 1, 4);

        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000, // Červená
            emissive: 0x550000,
            roughness: 0.1,
            metalness: 0.8
        });

        this.mesh = new THREE.Mesh(geometry, material);

        // Spawn na okraji arény (náhodný úhel)
        const uhel = Math.random() * Math.PI * 2;
        const vzdalenost = VELIKOST_ARENY - 2; // Trochu uvnitř zdí
        this.mesh.position.set(
            Math.cos(uhel) * vzdalenost,
            1, // Výška nad zemí
            Math.sin(uhel) * vzdalenost
        );

        scena.add(this.mesh);
    }

    update(delta, poziceHrace) {
        // Vektor směrem k hráči
        const smer = new THREE.Vector3().subVectors(poziceHrace, this.mesh.position);
        smer.y = 0; // Nepřátelé se hýbou jen po zemi, nelétají
        smer.normalize();

        // Posun
        this.mesh.position.addScaledVector(smer, RYCHLOST_NEPRITELE * delta);

        // Rotace pro efekt ("glitchy" pohyb)
        this.mesh.rotation.x += delta * 2;
        this.mesh.rotation.y += delta * 3;
    }

    odstran() {
        scena.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

// --- HLAVNÍ FUNKCE ---

function init() {
    // 1. Nastavení scény
    scena = new THREE.Scene();
    // Černá mlha pro atmosféru a skrytí konců arény
    scena.fog = new THREE.FogExp2(0x000000, 0.03);

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

    // 4. Osvětlení
    const ambientLight = new THREE.AmbientLight(0x404040); // Slabé okolní světlo
    scena.add(ambientLight);

    // Světlo hráče (baterka/aura)
    const playerLight = new THREE.PointLight(0xffffff, 1, 20);
    kamera.add(playerLight); // Světlo se hýbe s kamerou
    scena.add(kamera); // Přidáme kameru do scény, aby fungovalo připojení dětí (zbraň, světlo)

    // 5. Prostředí (Podlaha a Zdi)
    vytvorProstredi();

    // 6. Clock
    clock = new THREE.Clock();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('mousedown', onMouseDown, false);

    // Kliknutí na instrukce zamkne kurzor a spustí hru
    uiInstructions.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    // Restart po game over
    uiGameOver.addEventListener('click', () => {
        restartHry();
    });

    // Sledování stavu Pointer Lock (pro pauzu/start)
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            isGameActive = true;
            uiInstructions.style.display = 'none';
            uiGameOver.style.display = 'none';
        } else {
            isGameActive = false;
            // Pokud nejsme mrtví, zobrazíme instrukce jako pauzu
            if (zdravi > 0) {
                uiInstructions.style.display = 'block';
            }
        }
    });

    // Spuštění smyčky
    animate();
}

function vytvorZbran() {
    // Jednoduchá zbraň z geometrických tvarů
    const gunGroup = new THREE.Group();

    // Tělo zbraně
    const hlavenGeo = new THREE.BoxGeometry(0.1, 0.1, 0.4);
    const hlavenMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    const hlaven = new THREE.Mesh(hlavenGeo, hlavenMat);
    hlaven.position.set(0, 0, 0); // Relativní ke skupině

    // Pažba/detail
    const detailGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8);
    const detailMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x004444 }); // Neon cyan
    const detail = new THREE.Mesh(detailGeo, detailMat);
    detail.rotation.x = Math.PI / 2;
    detail.position.set(0, 0, 0.1);

    gunGroup.add(hlaven);
    gunGroup.add(detail);

    // Pozice zbraně na obrazovce (vpravo dole)
    gunGroup.position.set(0.2, -0.15, -0.3);

    // Přidáme zbraň ke kameře, aby se s ní hýbala
    kamera.add(gunGroup);

    // Uložíme referenci pro animaci zpětného rázu (volitelné, zatím nepoužito)
    kamera.userData.gun = gunGroup;
}

function vytvorProstredi() {
    // Podlaha - Neon Grid
    const gridHelper = new THREE.GridHelper(VELIKOST_ARENY * 2, 40, 0xff00ff, 0x440044); // Magenta mřížka
    scena.add(gridHelper);

    // Podlaha (fyzická, pro vizuál pod mřížkou)
    const planeGeo = new THREE.PlaneGeometry(VELIKOST_ARENY * 2, VELIKOST_ARENY * 2);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.01; // Těsně pod mřížkou
    scena.add(plane);

    // Zdi okolo arény
    const wallHeight = 10;
    const wallGeo = new THREE.BoxGeometry(VELIKOST_ARENY * 2, wallHeight, 1);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });

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

    document.body.requestPointerLock();
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

function onMouseMove(event) {
    if (!isGameActive) return;

    // Rotace kamery pomocí myši (YAW a PITCH)
    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    kamera.rotation.y -= movementX * 0.002;
    kamera.rotation.x -= movementY * 0.002;

    // Omezení pohledu nahoru/dolů (aby si hráč nezlomil vaz)
    kamera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, kamera.rotation.x));
}

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
    const startPozice = kamera.position.clone().add(smer.multiplyScalar(1.0));
    // Vykompenzujeme posun, abychom předali čistý směr
    smer.normalize();

    // Vytvoření střely
    const strela = new Strela(startPozice, smer);
    strely.push(strela);

    // Efekt "cuknutí" zbraní
    const gun = kamera.userData.gun;
    if (gun) {
        gun.position.z += 0.1; // Posun vzad
        setTimeout(() => {
            gun.position.z -= 0.1; // Návrat
        }, 50);
    }
}

// --- HERNÍ SMYČKA ---

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); // Čas od posledního snímku v sekundách

    if (isGameActive) {
        // 1. Pohyb hráče
        playerVelocity.set(0, 0, 0);
        playerDirection.set(0, 0, 0);

        if (moveForward) playerDirection.z -= 1;
        if (moveBackward) playerDirection.z += 1;
        if (moveLeft) playerDirection.x -= 1;
        if (moveRight) playerDirection.x += 1;

        // Normalizace směru pro konstantní rychlost i diagonálně
        playerDirection.normalize();

        // Přepočet směru pohybu podle natočení kamery (pouze Y osa, ignorujeme pohled nahoru/dolů)
        // Získáme směr "dopředu" podle kamery, ale promítnutý na rovinu XZ
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, kamera.rotation.y, 0));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, kamera.rotation.y, 0));

        if (moveForward) playerVelocity.add(forward.multiplyScalar(RYCHLOST_HRACE));
        if (moveBackward) playerVelocity.add(forward.multiplyScalar(-RYCHLOST_HRACE));

        // Resetujeme pro boční pohyb, protože jsme modifikovali forward
        const rightMove = right.clone().multiplyScalar(RYCHLOST_HRACE);
        if (moveRight) playerVelocity.add(rightMove);
        if (moveLeft) playerVelocity.add(rightMove.negate());

        // Aplikace pohybu
        kamera.position.addScaledVector(playerVelocity, delta);

        // Kontrola hranic arény (jednoduchá kolize se zdmi)
        const limit = VELIKOST_ARENY - 1;
        kamera.position.x = Math.max(-limit, Math.min(limit, kamera.position.x));
        kamera.position.z = Math.max(-limit, Math.min(limit, kamera.position.z));


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
            // Zvyšování obtížnosti: každých 10 sekund se zrychlí spawn
            if (SPAWN_INTERVAL > 500) SPAWN_INTERVAL -= 50;
        }

        // 4. Update nepřátel a kolize
        const hracPozice = kamera.position.clone();

        for (let i = nepratele.length - 1; i >= 0; i--) {
            const nepritel = nepratele[i];
            nepritel.update(delta, hracPozice);

            // Kolize Nepřítel vs Hráč
            if (nepritel.mesh.position.distanceTo(hracPozice) < 1.5) {
                // Hráč dostal zásah
                zdravi -= POSKOZENI_NEPRITELE;
                uiHealth.textContent = zdravi;

                // Odstranit nepřítele
                nepritel.odstran();
                nepratele.splice(i, 1);

                if (zdravi <= 0) {
                    gameOver();
                }
                continue; // Nepřítel zmizel, jdeme na dalšího
            }

            // Kolize Nepřítel vs Střela
            for (let j = strely.length - 1; j >= 0; j--) {
                const strela = strely[j];
                if (nepritel.mesh.position.distanceTo(strela.mesh.position) < (POLOMER_KOLIZE * 2)) {
                    // Zásah!
                    skore += 10;
                    uiScore.textContent = skore;

                    // Odstranit oba
                    nepritel.odstran();
                    nepratele.splice(i, 1);

                    strela.odstran();
                    strely.splice(j, 1);

                    break; // Nepřítel zničen, už nekontrolujeme další střely
                }
            }
        }
    }

    renderer.render(scena, kamera);
}

function gameOver() {
    isGameActive = false;
    document.exitPointerLock();
    uiGameOver.style.display = 'block';
    uiFinalScore.textContent = skore;
}

// Spuštění
init();
