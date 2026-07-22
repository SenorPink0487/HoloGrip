/**
 * HoloGrip 门户页脚本（Tauri 2.0 兼容）。
 *
 * 主要功能：
 *  - 鼠标光斑/拖尾、粒子背景、Tab 切换、3D 全息名片、复制邮箱等动效
 *  - 作品矩阵 → 详情 Modal → 「启动在线程序」按钮：
 *      • 在 Tauri 容器内：调用后端命令 `open_simulation_window` 打开新窗口加载 app.html
 *      • 在浏览器（含 vite dev）：直接 location.href 跳到 app.html
 *
 * 该文件以 ES Module 形式被 vite 处理（index.html 中 type="module"），
 * 所以可以使用 dynamic import 按需加载 @tauri-apps/api。
 */

document.addEventListener('DOMContentLoaded', () => {
    // 关闭浏览器自动恢复滚动位置：避免重新打开同一站点时 Chrome 把页面停在
    // 上次离开的滚动位置，导致 sticky 顶部 header 盖在 hero 标题上，给人
    // “线上和 dev 不一致 / 打包尺寸错了” 的错觉。
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo({ top: 0, behavior: 'auto' });

    initCursorEffects();
    initParticlesBackground();
    initNavigation();
    initProjectCards();
    initHoloCard();
});

/* ==========================================
   Tauri 桥接：判断是否在 Tauri 容器内
   ========================================== */
function isTauri() {
    if (typeof window === 'undefined') return false;
    return !!(window.__TAURI_INTERNALS__ || window.__TAURI__ || window.__TAURI_IPC__);
}

/**
 * 启动在线程序：
 *  - Tauri：调命令开新窗口（不阻塞当前门户）
 *  - 浏览器：location.href 跳转到对应入口页
 *
 * @param {string} [url='app.html'] 目标页面路径
 */
async function launchSimulation(url = 'app.html') {
    if (isTauri()) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            // 把目标 url 传给 Rust，由后端决定打开哪个窗口
            await invoke('open_simulation_window', { url });
            return;
        } catch (e) {
            console.warn('open_simulation_window 失败，回退到 location 跳转:', e);
        }
    }
    // Web 端 / 后端命令失败的兜底
    window.location.href = url;
}

/* ==========================================
   CURSOR GLOW & FLUID TRAIL
   ========================================== */
function initCursorEffects() {
    const glow = document.getElementById('cursor-glow');
    const trailContainer = document.getElementById('trail-container');
    if (!glow || !trailContainer) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let currentX = mouseX;
    let currentY = mouseY;

    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        spawnTrailParticle(e.clientX, e.clientY);
    });

    function updateGlowPosition() {
        currentX += (mouseX - currentX) * 0.08;
        currentY += (mouseY - currentY) * 0.08;
        glow.style.left = `${currentX}px`;
        glow.style.top = `${currentY}px`;
        requestAnimationFrame(updateGlowPosition);
    }
    updateGlowPosition();

    let lastSpawnX = 0;
    let lastSpawnY = 0;
    const minMoveDistance = 8;

    function spawnTrailParticle(x, y) {
        const dx = x - lastSpawnX;
        const dy = y - lastSpawnY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minMoveDistance) return;
        lastSpawnX = x;
        lastSpawnY = y;

        const dot = document.createElement('div');
        dot.className = 'trail-dot';
        const offsetX = (Math.random() - 0.5) * 8;
        const offsetY = (Math.random() - 0.5) * 8;
        dot.style.left = `${x + offsetX}px`;
        dot.style.top = `${y + offsetY}px`;
        const size = Math.random() * 6 + 4;
        dot.style.width = `${size}px`;
        dot.style.height = `${size}px`;
        trailContainer.appendChild(dot);
        dot.addEventListener('animationend', () => dot.remove());
    }
}

/* ==========================================
   PARTICLE CANVAS BACKGROUND
   ========================================== */
function initParticlesBackground() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const particles = [];
    const maxParticles = 55;
    const connectionDist = 125;
    const mouse = { x: null, y: null, radius: 160 };

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });
    window.addEventListener('mouseleave', () => {
        mouse.x = null;
        mouse.y = null;
    });

    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.35;
            this.vy = (Math.random() - 0.5) * 0.35;
            this.radius = Math.random() * 1.5 + 1;
            this.baseAlpha = Math.random() * 0.2 + 0.08;
            this.alpha = this.baseAlpha;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
            if (mouse.x !== null && mouse.y !== null) {
                const dx = this.x - mouse.x;
                const dy = this.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < mouse.radius) {
                    const force = (mouse.radius - dist) / mouse.radius;
                    this.x += (dx / dist) * force * 1.0;
                    this.y += (dy / dist) * force * 1.0;
                    this.alpha = Math.min(this.baseAlpha + force * 0.35, 0.6);
                } else if (this.alpha > this.baseAlpha) {
                    this.alpha -= 0.01;
                }
            } else if (this.alpha > this.baseAlpha) {
                this.alpha -= 0.01;
            }
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(6, 182, 212, ${this.alpha})`;
            ctx.fill();
        }
    }

    for (let i = 0; i < maxParticles; i++) particles.push(new Particle());

    function drawLines() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < connectionDist) {
                    const alpha = (1 - dist / connectionDist) * 0.08;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(139, 92, 246, ${alpha})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p) => {
            p.update();
            p.draw();
        });
        drawLines();
        requestAnimationFrame(animate);
    }
    animate();
}

/* ==========================================
   TAB NAVIGATION
   ========================================== */
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.tab-content');

    navButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            const targetSection = document.getElementById(target);
            if (!targetSection) return;

            // 已经在当前 tab 直接忽略,防止重复触发淡入淡出
            if (targetSection.classList.contains('active')) return;

            // 纯 class 切换,完全交给 CSS 处理。
            // 不再操作 display,避免快速切换时定时器把新 tab 误隐藏。
            navButtons.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            sections.forEach((sec) => sec.classList.remove('active'));
            targetSection.classList.add('active');

            // 切换 tab 时回到顶部,避免上一个长 tab 留下的滚动残影
            window.scrollTo({ top: 0, behavior: 'auto' });
        });
    });
}

/* ==========================================
   PROJECT MATRIX MODAL & 启动按钮
   ========================================== */
const projectDetails = {
    math: {
        title: '01 / HoloMath 空间三维几何画板',
        tag: 'MATHEMATICS // V0.1.1-ONLINE',
        desc:
            'HoloMath 是 HoloGrip 系列的核心几何渲染 system，目前已完成 V0.1.1 版本的开发上线。它通过在端侧捕获摄像头的手部姿态关键点，将屏幕映射向量转换成 3D 画布内的三维顶点。支持空中捏合画线、三维圆柱/棱锥生成，并可在空间坐标系内实时完成测量与交点运算，打破纸质平面几何的教学局限。',
        specs: {
            engine: 'Vite + React + Three.js (R3F)',
            perf: '60 FPS Render // < 3ms Hand Latency',
            algorithm: 'Analytical Spatial Geometry Core',
            version: 'v0.1.1-stable',
        },
        demoColor: 'var(--accent-cyan)',
        visualClass: 'math-modal-demo',
        canLaunch: true,
        demoHtml: `
            <div class="scene-3d" style="transform: scale(1.25) translateY(-5px); margin-top: 10px;">
                <div class="grid-floor-3d" style="bottom: 0px; transform: rotateX(75deg) translateZ(-25px); width: 180px; height: 180px;"></div>
                <div class="crystal-polyhedron" style="width: 48px; height: 48px;">
                    <div class="face f-front" style="width: 48px; height: 48px; transform: rotateY(0deg) translateZ(24px);"></div>
                    <div class="face f-back" style="width: 48px; height: 48px; transform: rotateY(180deg) translateZ(24px);"></div>
                    <div class="face f-left" style="width: 48px; height: 48px; transform: rotateY(-90deg) translateZ(24px);"></div>
                    <div class="face f-right" style="width: 48px; height: 48px; transform: rotateY(90deg) translateZ(24px);"></div>
                    <div class="face f-top" style="width: 48px; height: 48px; transform: rotateX(90deg) translateZ(24px);"></div>
                    <div class="face f-bottom" style="width: 48px; height: 48px; transform: rotateX(-90deg) translateZ(24px);"></div>
                </div>
                <svg class="math-measure-lines" style="position:absolute; width:100%; height:100%; top:0; left:0; pointer-events:none; z-index: 5;">
                    <line x1="50%" y1="15%" x2="50%" y2="85%" stroke="rgba(6, 182, 212, 0.25)" stroke-width="1" stroke-dasharray="3 3" />
                    <line x1="15%" y1="50%" x2="85%" y2="50%" stroke="rgba(6, 182, 212, 0.25)" stroke-width="1" stroke-dasharray="3 3" />
                    <line x1="28%" y1="28%" x2="72%" y2="72%" stroke="rgba(6, 182, 212, 0.5)" stroke-width="1.2" />
                    <circle cx="28%" cy="28%" r="3" fill="var(--accent-cyan)" />
                    <circle cx="72%" cy="72%" r="3" fill="var(--accent-cyan)" />
                    <text x="32%" y="25%" fill="var(--accent-cyan)" style="font-size: 8px; font-family: monospace;">A(12, 8, 35)</text>
                    <text x="56%" y="80%" fill="var(--accent-cyan)" style="font-size: 8px; font-family: monospace;">B(-4, -15, 20)</text>
                </svg>
            </div>
        `,
    },
    physics: {
        title: '02 / HoloPhysics 未来物理实验室',
        tag: 'PHYSICS // QUANTUM LAB V0.1.0',
        desc:
            'HoloPhysics 是一座可漫游的三维交互物理实验室，集成力学、几何与波动光学、电磁学（含法拉第/高斯/霍尔/感生电场）与热力学多实验台。用户可通过键鼠或 MediaPipe AR 手势直接操作仪器、调节参数、记录数据，并在全息终端中查看实验步骤、物理公式与测量结果。',
        specs: {
            engine: 'Three.js / MediaPipe Hands',
            perf: 'WebGL + Worker Hand Tracking',
            algorithm: 'Multi-station Physics Lab (Mechanics/Optics/EM/Thermo)',
            version: 'v0.2.0',
        },
        demoColor: 'var(--accent-emerald)',
        visualClass: 'physics-modal-demo',
        canLaunch: true,
        launchUrl: 'physics.html',
        demoHtml: `
            <div class="physics-sandbox-simulation physics-visual-demo" style="transform: scale(1.1); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative;">
                <div class="gravity-well" style="width: 14px; height: 14px; background: var(--accent-emerald); border-radius: 50%; box-shadow: 0 0 15px var(--accent-emerald), 0 0 25px var(--accent-emerald); z-index: 5;"></div>
                <div class="gravity-ring" style="position: absolute; width: 100px; height: 100px; border: 1px dashed rgba(16, 185, 129, 0.15); border-radius: 50%;"></div>
                <div class="gravity-ring" style="position: absolute; width: 160px; height: 160px; border: 1px dashed rgba(16, 185, 129, 0.08); border-radius: 50%;"></div>
                <div class="orbiting-planet planet-1" style="position: absolute; border-radius: 50%; width: 8px; height: 8px; animation: orbitPhysics1 5s infinite linear; background: var(--accent-emerald); box-shadow: 0 0 8px var(--accent-emerald);"></div>
                <div class="orbiting-planet planet-2" style="position: absolute; border-radius: 50%; width: 6px; height: 6px; animation: orbitPhysics2 9s infinite linear; background: var(--accent-emerald); box-shadow: 0 0 8px var(--accent-emerald);"></div>
                <div class="planet-3"></div>
            </div>
        `,
    },
    rocket: {
        title: '04 / HoloRocket 火箭发射仿真',
        tag: 'AEROSPACE // ROCKET LAB V1.0',
        desc:
            'HoloRocket 是高精度的三维火箭发射与设计仿真系统。支持 VAB 零件自定义组装与性能评估，自由驾驶漫游发射基地；实时模拟全尺寸点火、羽流粒子与任务时序演进，支持多天体视角与深空探索。',
        specs: {
            engine: 'Three.js + Custom Shaders',
            perf: 'WebGL Bloom / Particle Exhaust',
            algorithm: 'Launch Sequence + VAB Craft Graph',
            version: 'v1.0.0',
        },
        demoColor: 'var(--accent-orange, #f97316)',
        visualClass: 'rocket-modal-demo',
        canLaunch: true,
        launchUrl: 'rocket.html',
        demoHtml: `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative;">
                <div style="width:18px;height:90px;background:linear-gradient(#eee,#999);border-radius:10px 10px 3px 3px;box-shadow:0 0 24px rgba(249,115,22,0.45);position:relative;">
                    <div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);width:14px;height:36px;background:radial-gradient(ellipse at top,#ffd060,#ff6a1a,transparent);filter:blur(1px);"></div>
                </div>
            </div>
        `,
    },
    pool: {
        title: '05 / HoloPool 三维台球室',
        tag: 'SPORTS // BILLIARDS LAB V1.0',
        desc:
            'HoloPool 是沉浸式三维物理台球体验室。融合真实刚体动力学与第三人称视角漫游，支持就位击球与蓄力杆法；内置辅助线动态推演与力度落点预测，打造兼具竞技性与教学功能的台球沙盒。',
        specs: {
            engine: 'Three.js + cannon-es',
            perf: 'WebGL + Web Audio API',
            algorithm: 'Rigid-body Collision + Shot Predictor',
            version: 'v1.0.0',
        },
        demoColor: 'var(--accent-emerald, #10b981)',
        visualClass: 'pool-modal-demo',
        canLaunch: true,
        launchUrl: 'pool.html',
        demoHtml: `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
                <div style="width:160px;height:90px;background:radial-gradient(ellipse at 40% 30%,#1f8a4c,#084024);border:8px solid #5c3a1e;border-radius:10px;position:relative;box-shadow:0 12px 28px rgba(0,0,0,0.45);">
                    <div style="position:absolute;width:10px;height:10px;border-radius:50%;background:#fff;top:55%;left:22%;box-shadow:0 0 6px #fff;"></div>
                    <div style="position:absolute;width:10px;height:10px;border-radius:50%;background:#e11d48;top:38%;left:58%;"></div>
                    <div style="position:absolute;width:10px;height:10px;border-radius:50%;background:#111;top:48%;left:66%;"></div>
                </div>
            </div>
        `,
    },
    chemistry: {
        title: '03 / HoloChemistry 空间化学分子沙盒',
        tag: 'CHEMISTRY // V0.0.1-ALPHA',
        desc:
            'HoloChemistry 致力于将三维空间手势与微观化学分子动力学仿真相结合，目前正处于早期预研阶段。用户将能够在空气中自由抓取和拼接基本粒子，构建出杂化轨道（如 sp³、sp²）、水分子模型乃至复杂的 DNA 螺旋结构。系统支持实时计算共价键角、模拟电子云概率密度分布以及观察无机反应的化学键断裂历程，以极富视觉张力的方式呈现微观分子结构。',
        specs: {
            engine: 'Three.js Orbit Hybrid Render',
            perf: 'Electronic Cloud Compute: ~30k points',
            algorithm: 'Valence Shell Electron Pair Repulsion (VSEPR)',
            version: 'v0.0.1-alpha (Under Dev)',
        },
        demoColor: 'var(--accent-purple)',
        visualClass: 'chemistry-modal-demo',
        canLaunch: false,
        demoHtml: `
            <div class="chemistry-molecule-simulation" style="transform: scale(1.15); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative;">
                <div class="chemistry-molecule-demo">
                    <div class="chemistry-flask-wrapper" style="transform: scale(1.3);">
                        <div class="vapor-container">
                            <div class="vapor v1"></div>
                            <div class="vapor v2"></div>
                            <div class="vapor v3"></div>
                        </div>
                        <svg viewBox="0 0 100 135" class="flask-svg" preserveAspectRatio="xMidYMax meet">
                            <defs>
                                <linearGradient id="flaskReflect_modal" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stop-color="rgba(255,255,255,0.7)"/>
                                    <stop offset="15%" stop-color="rgba(255,255,255,0.1)"/>
                                    <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
                                </linearGradient>
                                <filter id="flaskGlow_modal">
                                    <feGaussianBlur stdDeviation="3" result="blur" />
                                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                </filter>
                            </defs>
                            <path d="M 38 20 L 38 50 L 10 115 A 8 8 0 0 0 18 125 L 82 125 A 8 8 0 0 0 90 115 L 62 50 L 62 20" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.4)" stroke-width="2" filter="url(#flaskGlow_modal)"/>
                            <ellipse cx="50" cy="20" rx="16" ry="5" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.7)" stroke-width="2" filter="url(#flaskGlow_modal)"/>
                            <path d="M 40 50 L 14 110" fill="none" stroke="url(#flaskReflect_modal)" stroke-width="3" stroke-linecap="round"/>
                            <path d="M 42 25 L 42 45" fill="none" stroke="url(#flaskReflect_modal)" stroke-width="3" stroke-linecap="round"/>
                        </svg>
                        <div class="flask-liquid">
                            <div class="liquid-fill">
                                <div class="bubble b1"></div>
                                <div class="bubble b2"></div>
                                <div class="bubble b3"></div>
                                <div class="bubble b4"></div>
                                <div class="bubble b5"></div>
                                <div class="bubble b6"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
    },
};

function initProjectCards() {
    const cards = document.querySelectorAll('.project-card');
    const modal = document.getElementById('project-modal');
    const modalClose = document.getElementById('modal-close');
    const modalContent = document.getElementById('modal-body-content');
    if (!modal || !modalClose || !modalContent) return;

    cards.forEach((card) => {
        card.addEventListener('click', () => {
            const type = card.getAttribute('data-project');
            const data = projectDetails[type];
            if (data) openModal(data);
        });
    });

    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    function openModal(data) {
        const launchLabel = data.canLaunch ? '启动在线程序' : '即将上线';
        const launchDisabled = data.canLaunch ? '' : 'disabled style="opacity:0.5;cursor:not-allowed;"';
        const launchUrl = data.launchUrl || 'app.html';

        modalContent.innerHTML = `
            <div class="modal-title-area">
                <span class="badge" style="color: ${data.demoColor}; background: rgba(255,255,255,0.02); border-color: ${data.demoColor}33">${data.tag}</span>
                <h2>${data.title}</h2>
            </div>
            <div class="modal-content-grid">
                <div class="modal-demo-box ${data.visualClass}">
                    <div class="sim-status-tag" style="color: ${data.demoColor}">
                        <span class="sim-status-dot" style="background-color: ${data.demoColor}; box-shadow: 0 0 8px ${data.demoColor}"></span>
                        SIMULATION ACTIVE // 实时仿真中
                    </div>
                    ${data.demoHtml}
                </div>
                <p class="modal-info-text">${data.desc}</p>

                <div class="modal-specs">
                    <div class="spec-item">
                        <span class="spec-label">核心引擎 / Core Engine</span>
                        <span class="spec-value">${data.specs.engine}</span>
                    </div>
                    <div class="spec-item">
                        <span class="spec-label">运行效能 / Performance</span>
                        <span class="spec-value">${data.specs.perf}</span>
                    </div>
                    <div class="spec-item">
                        <span class="spec-label">计算算法 / Algorithm</span>
                        <span class="spec-value">${data.specs.algorithm}</span>
                    </div>
                    <div class="spec-item">
                        <span class="spec-label">系统版本 / Version</span>
                        <span class="spec-value" style="color: ${data.demoColor}">${data.specs.version}</span>
                    </div>
                </div>
            </div>
            <div class="modal-action-bar">
                <button class="btn-secondary" id="modal-cancel">关闭</button>
                <button class="btn-primary" id="modal-launch" ${launchDisabled}
                    data-launch-url="${launchUrl}"
                    style="background: ${data.demoColor}; border-color: ${data.demoColor}; color: #000;">${launchLabel}</button>
            </div>
        `;

        modal.classList.add('active');

        document.getElementById('modal-cancel').addEventListener('click', closeModal);

        const launchBtn = document.getElementById('modal-launch');
        if (data.canLaunch) {
            launchBtn.addEventListener('click', async () => {
                const targetUrl = launchBtn.dataset.launchUrl || 'app.html';
                launchBtn.innerText = '正在激活空间渲染管线...';
                launchBtn.style.opacity = '0.7';
                launchBtn.style.pointerEvents = 'none';
                try {
                    await launchSimulation(targetUrl);
                } catch (e) {
                    console.error('启动仿真失败:', e);
                    launchBtn.innerText = '启动失败，请重试';
                    launchBtn.style.background = '#ef4444';
                    launchBtn.style.borderColor = '#ef4444';
                    launchBtn.style.color = '#fff';
                    launchBtn.style.pointerEvents = '';
                    launchBtn.style.opacity = '1';
                }
            });
        }
    }

    function closeModal() {
        modal.classList.remove('active');
    }
}

/* ==========================================
   HOLOGRAPHIC 3D ID CARD
   ========================================== */
function initHoloCard() {
    const card = document.getElementById('holo-id-card');
    const glare = card ? card.querySelector('.card-glare') : null;
    const copyBtn = document.getElementById('copy-btn');
    if (!card || !glare) return;

    let rect = card.getBoundingClientRect();
    window.addEventListener('resize', () => {
        rect = card.getBoundingClientRect();
    });

    card.addEventListener('mousemove', (e) => {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const px = x / rect.width - 0.5;
        const py = y / rect.height - 0.5;
        const tiltX = -py * 24;
        const tiltY = px * 24;
        card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.02)`;
        glare.style.setProperty('--glare-x', `${(px + 0.5) * 100}%`);
        glare.style.setProperty('--glare-y', `${(py + 0.5) * 100}%`);
        glare.style.opacity = '1';
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)';
        glare.style.opacity = '0';
        card.style.transition = 'transform 0.5s ease';
        setTimeout(() => {
            card.style.transition = 'none';
        }, 500);
    });

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const emailText = 'senor0716@outlook.com';
            navigator.clipboard
                .writeText(emailText)
                .then(() => {
                    const origText = copyBtn.innerHTML;
                    copyBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        已复制邮箱
                    `;
                    copyBtn.style.borderColor = '#10b981';
                    copyBtn.style.color = '#10b981';
                    setTimeout(() => {
                        copyBtn.innerHTML = origText;
                        copyBtn.style.borderColor = '';
                        copyBtn.style.color = '';
                    }, 2000);
                })
                .catch((err) => {
                    console.error('Clipboard copy failed: ', err);
                });
        });
    }
}


/* ==========================================
   ICP 备案 底部栏
   ------------------------------------------
   常驻显示,无 JS 行为,样式见 portal.css。
   ========================================== */
