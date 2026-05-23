/**
 * HoloGrip 门户页脚本（Tauri 2.0 兼容）。
 *
 * 主要功能：
 *  - 鼠标光斑/拖尾、粒子背景、Tab 切换、3D 全息名片、复制邮箱等动效
 *  - 作品矩阵 → 详情 Modal → 「启动在线仿真」按钮：
 *      • 在 Tauri 容器内：调用后端命令 `open_simulation_window` 打开新窗口加载 app.html
 *      • 在浏览器（含 vite dev）：直接 location.href 跳到 app.html
 *
 * 该文件以 ES Module 形式被 vite 处理（index.html 中 type="module"），
 * 所以可以使用 dynamic import 按需加载 @tauri-apps/api。
 */

document.addEventListener('DOMContentLoaded', () => {
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
 * 启动在线仿真：
 *  - Tauri：调命令开新窗口（不阻塞当前门户）
 *  - 浏览器：location.href 跳转到 app.html
 */
async function launchSimulation() {
    if (isTauri()) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('open_simulation_window');
            return;
        } catch (e) {
            console.warn('open_simulation_window 失败，回退到 location 跳转:', e);
        }
    }
    // Web 端 / 后端命令失败的兜底
    window.location.href = 'app.html';
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
            navButtons.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            sections.forEach((sec) => {
                if (sec.classList.contains('active')) {
                    sec.classList.remove('active');
                    setTimeout(() => {
                        sec.style.display = 'none';
                    }, 400);
                }
            });

            const targetSection = document.getElementById(target);
            if (targetSection) {
                targetSection.style.display = 'block';
                setTimeout(() => {
                    targetSection.classList.add('active');
                }, 50);
            }
        });
    });

    sections.forEach((sec) => {
        if (!sec.classList.contains('active')) sec.style.display = 'none';
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
        title: '02 / HoloPhysics 空间物理沙盒',
        tag: 'PHYSICS // DEVELOPMENT STAGE',
        desc:
            'HoloPhysics 是用于空间交互力学教学的物理仿真程序，目前正处于开发与测试阶段。该系统通过空气手势作为力场施加器，允许用户实时构建万有引力模型或电磁场。它能实时模拟出行星围绕恒星运行的开普勒椭圆轨道，或者在多刚体发生碰撞时进行高精度的动量守恒定理数值计算。',
        specs: {
            engine: 'R3F Physics / Canvas Sandbox',
            perf: 'Collision Solve: < 1.5ms per step',
            algorithm: 'Newtonian Rigid Body Dynamics',
            version: 'v0.0.5-beta (Under Dev)',
        },
        demoColor: 'var(--accent-emerald)',
        visualClass: 'physics-modal-demo',
        canLaunch: false,
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
    shadowplay: {
        title: '03 / HoloShadow 空间生成式皮影戏',
        tag: 'SHADOW PLAY // TRADITIONAL ART',
        desc:
            'HoloShadow 是一项将国家级非物质文化遗产同计算机视觉相结合的前沿探索，目前处于开发测试阶段。系统利用 MediaPipe Hands 提取的双手 21 个骨骼点，动态拟合和控制皮影戏角色的肢体关节及行走步态。辅以 AI 着色渲染管线，实时演算光影透过牛皮材质的漫透射折光，在虚空中重现中华光影艺术的魅力。',
        specs: {
            engine: 'MediaPipe Hands + WebGL shaders',
            perf: 'Skeletal Joints Map: 21 points / hand',
            algorithm: 'Realtime Translucent Scattering Shader',
            version: 'v0.0.2-alpha (Under Dev)',
        },
        demoColor: 'var(--accent-amber)',
        visualClass: 'shadowplay-modal-demo',
        canLaunch: false,
        demoHtml: `
            <div class="shadowplay-simulation" style="display: flex; width: 85%; height: 85%; align-items: center; justify-content: space-around; z-index: 4; margin-top: 10px;">
                <svg class="hand-mesh" width="90" height="90" viewBox="0 0 100 100" style="filter: drop-shadow(0 0 6px var(--accent-amber));">
                    <path d="M 50 90 L 45 70 L 42 55 L 40 40 M 45 70 L 30 55 L 20 45 L 12 38 M 45 70 L 52 50 L 55 38 L 56 26 M 45 70 L 68 56 L 78 48 L 86 42 M 50 90 L 70 80 L 82 72" fill="none" stroke="rgba(245, 158, 11, 0.5)" stroke-width="1.2" />
                    <circle cx="50" cy="90" r="2.5" fill="#fff" />
                    <circle cx="45" cy="70" r="2" fill="var(--accent-amber)" />
                    <circle cx="42" cy="55" r="2" fill="var(--accent-amber)" />
                    <circle cx="40" cy="40" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="30" cy="55" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="20" cy="45" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="12" cy="38" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="52" cy="50" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="55" cy="38" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="56" cy="26" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="68" cy="56" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="78" cy="48" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="86" cy="42" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="70" cy="80" r="1.5" fill="var(--accent-amber)" />
                    <circle cx="82" cy="72" r="1.5" fill="var(--accent-amber)" />
                </svg>
                <div class="shadowplay-backlight" style="width: 90px; height: 90px; border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
                    <div class="puppet-silhouette" style="width: 45px; height: 45px; transform-origin: bottom center; animation: swayPuppet 4s infinite ease-in-out alternate;">
                        <svg class="svg-puppet" viewBox="0 0 100 100" style="width: 100%; height: 100%; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.95));">
                            <path d="M50 20 L40 40 L60 40 Z M50 40 L50 80 M30 50 L50 40 L70 50" stroke="#000" stroke-width="4" stroke-linecap="round" fill="rgba(0,0,0,0.85)"/>
                            <circle cx="50" cy="15" r="8" fill="rgba(0,0,0,0.85)" />
                        </svg>
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
        const launchLabel = data.canLaunch ? '启动在线仿真' : '即将上线';
        const launchDisabled = data.canLaunch ? '' : 'disabled style="opacity:0.5;cursor:not-allowed;"';

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
                <button class="btn-primary" id="modal-launch" ${launchDisabled} style="background: ${data.demoColor}; border-color: ${data.demoColor}; color: #000;">${launchLabel}</button>
            </div>
        `;

        modal.classList.add('active');

        document.getElementById('modal-cancel').addEventListener('click', closeModal);

        const launchBtn = document.getElementById('modal-launch');
        if (data.canLaunch) {
            launchBtn.addEventListener('click', async () => {
                launchBtn.innerText = '正在激活空间渲染管线...';
                launchBtn.style.opacity = '0.7';
                launchBtn.style.pointerEvents = 'none';
                try {
                    await launchSimulation();
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
