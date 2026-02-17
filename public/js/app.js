// ===== КОНФИГУРАЦИЯ =====
const API_URL = window.location.origin;

// ===== СОСТОЯНИЕ ПРИЛОЖЕНИЯ =====
const state = {
    token: localStorage.getItem('token'),
    username: localStorage.getItem('username'),
    tokens: 0,
    currentProject: null,
    selectedPage: null
};

// ===== DOM ЭЛЕМЕНТЫ =====
const elements = {
    // Страницы
    authPage: document.getElementById('auth-page'),
    mainPage: document.getElementById('main-page'),
    
    // Формы авторизации
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    authMessage: document.getElementById('auth-message'),
    
    // Главная страница
    userName: document.getElementById('user-name'),
    userTokens: document.getElementById('user-tokens'),
    logoutBtn: document.getElementById('logout-btn'),
    
    // Вкладки
    dashboardTab: document.getElementById('dashboard-tab'),
    profileTab: document.getElementById('profile-tab'),
    
    // Дашборд
    projectsList: document.getElementById('projects-list'),
    newProjectBtn: document.getElementById('new-project-btn'),
    newProjectForm: document.getElementById('new-project-form'),
    projectName: document.getElementById('project-name'),
    projectFile: document.getElementById('project-file'),
    uploadProjectBtn: document.getElementById('upload-project-btn'),
    cancelProjectBtn: document.getElementById('cancel-project-btn'),
    uploadProgress: document.getElementById('upload-progress'),
    
    // Обработка
    projectProcessing: document.getElementById('project-processing'),
    processingProjectName: document.getElementById('processing-project-name'),
    pagesPreview: document.getElementById('pages-preview'),
    installPiles: document.getElementById('install-piles'),
    pileDistance: document.getElementById('pile-distance'),
    startProcessingBtn: document.getElementById('start-processing-btn'),
    prevPageBtn: document.getElementById('prev-page-btn'),
    nextPageBtn: document.getElementById('next-page-btn'),
    currentPageNum: document.getElementById('current-page-num'),
    totalPages: document.getElementById('total-pages'),
    
    // Результаты
    projectResults: document.getElementById('project-results'),
    statsWallLength: document.getElementById('stats-wall-length'),
    statsPilesCard: document.getElementById('stats-piles-card'),
    statsPilesCount: document.getElementById('stats-piles-count'),
    container3d: document.getElementById('3d-container'),
    exportExcelBtn: document.getElementById('export-excel-btn'),
    exportPdfBtn: document.getElementById('export-pdf-btn'),
    backToProjectsBtn: document.getElementById('back-to-projects-btn'),
    
    // Личный кабинет
    profileUsername: document.getElementById('profile-username'),
    profileTokens: document.getElementById('profile-tokens'),
    paymentMessage: document.getElementById('payment-message')
};

// ===== API ФУНКЦИИ =====
async function api(endpoint, options = {}) {
    const url = `${API_URL}/api${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(state.token && { 'Authorization': `Bearer ${state.token}` }),
            ...options.headers
        },
        ...options
    };
    
    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
    }
    
    try {
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка сервера');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ===== АВТОРИЗАЦИЯ =====
function showAuthMessage(message, type = 'error') {
    elements.authMessage.textContent = message;
    elements.authMessage.className = `message ${type}`;
    elements.authMessage.classList.remove('hidden');
    setTimeout(() => {
        elements.authMessage.classList.add('hidden');
    }, 5000);
}

async function login(username, password) {
    try {
        const data = await api('/auth/login', {
            method: 'POST',
            body: { username, password }
        });
        
        state.token = data.token;
        state.username = data.username;
        state.tokens = data.tokens;
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        
        showMainPage();
    } catch (error) {
        showAuthMessage(error.message);
    }
}

async function register(username, password) {
    try {
        await api('/auth/register', {
            method: 'POST',
            body: { username, password }
        });
        
        showAuthMessage('Регистрация успешна! Теперь вы можете войти.', 'success');
        switchTab('login');
    } catch (error) {
        showAuthMessage(error.message);
    }
}

function logout() {
    state.token = null;
    state.username = null;
    state.tokens = 0;
    state.currentProject = null;
    state.selectedPage = null;
    
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    
    showAuthPage();
}

// ===== НАВИГАЦИЯ =====
function showAuthPage() {
    elements.authPage.classList.remove('hidden');
    elements.mainPage.classList.add('hidden');
}

function showMainPage() {
    elements.authPage.classList.add('hidden');
    elements.mainPage.classList.remove('hidden');
    elements.userName.textContent = state.username;
    elements.userTokens.textContent = state.tokens;
    elements.profileUsername.textContent = state.username;
    elements.profileTokens.textContent = state.tokens;
    
    loadProjects();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    if (tabName === 'login') {
        elements.loginForm.classList.remove('hidden');
        elements.registerForm.classList.add('hidden');
    } else {
        elements.loginForm.classList.add('hidden');
        elements.registerForm.classList.remove('hidden');
    }
}

function switchMainTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tabName === 'dashboard') {
        elements.dashboardTab.classList.add('active');
    } else {
        elements.profileTab.classList.add('active');
    }
}

// ===== ПРОЕКТЫ =====
async function loadProjects() {
    try {
        const projects = await api('/projects');
        renderProjects(projects);
    } catch (error) {
        console.error('Ошибка загрузки проектов:', error);
        elements.projectsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📁</div>
                <p>Ошибка загрузки проектов</p>
            </div>
        `;
    }
}

function renderProjects(projects) {
    if (projects.length === 0) {
        elements.projectsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📁</div>
                <h3>У вас пока нет проектов</h3>
                <p>Создайте первый проект, загрузив PDF с чертежом</p>
            </div>
        `;
        return;
    }

    elements.projectsList.innerHTML = projects.map(project => `
        <div class="project-card" data-id="${project.id}">
            <div class="project-card-header">
                <h4>${project.name}</h4>
                <span class="project-status ${project.status}">
                    ${project.status === 'processed' ? '✓ Обработан' : '⏳ Загружен'}
                </span>
            </div>
            <div class="project-meta">
                <p>Страниц: ${project.pageCount}</p>
                <p>Создан: ${new Date(project.createdAt).toLocaleDateString('ru-RU')}</p>
            </div>
            <div class="project-actions">
                ${project.status === 'processed'
                    ? `<button class="btn btn-primary btn-view" data-id="${project.id}">Смотреть результаты</button>`
                    : `<button class="btn btn-primary btn-process" data-id="${project.id}">Обработать</button>`
                }
                <button class="btn btn-danger btn-delete" data-id="${project.id}">Удалить</button>
            </div>
        </div>
    `).join('');

    // Обработчики
    document.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('btn')) {
                const id = card.dataset.id;
                const project = projects.find(p => p.id === id);
                if (project) openProject(project);
            }
        });
    });

    document.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const project = projects.find(p => p.id === btn.dataset.id);
            if (project) showResults(project);
        });
    });

    document.querySelectorAll('.btn-process').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const project = projects.find(p => p.id === btn.dataset.id);
            if (project) openProject(project);
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const project = projects.find(p => p.id === btn.dataset.id);
            if (project) deleteProject(project.id);
        });
    });
}

async function deleteProject(projectId) {
    if (!confirm('Вы уверены, что хотите удалить этот проект? Это действие нельзя отменить.')) {
        return;
    }

    try {
        await api(`/projects/${projectId}`, {
            method: 'DELETE'
        });

        loadProjects();
    } catch (error) {
        alert('Ошибка при удалении проекта: ' + error.message);
    }
}

function showNewProjectForm() {
    elements.newProjectForm.classList.remove('hidden');
    elements.projectsList.parentElement.classList.add('hidden');
}

function hideNewProjectForm() {
    elements.newProjectForm.classList.add('hidden');
    elements.projectsList.parentElement.classList.remove('hidden');
    elements.projectName.value = '';
    elements.projectFile.value = '';
}

async function uploadProject() {
    const name = elements.projectName.value.trim();
    const file = elements.projectFile.files[0];
    
    if (!name) {
        alert('Введите название проекта');
        return;
    }
    
    if (!file) {
        alert('Выберите PDF файл');
        return;
    }
    
    const formData = new FormData();
    formData.append('projectName', name);
    formData.append('pdf', file);
    
    elements.uploadProgress.classList.remove('hidden');
    elements.uploadProjectBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_URL}/api/projects/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error);
        }
        
        state.tokens = data.tokensLeft;
        elements.userTokens.textContent = state.tokens;
        elements.profileTokens.textContent = state.tokens;
        
        hideNewProjectForm();
        
        // Открываем проект для обработки
        state.currentProject = {
            ...data,
            id: data.projectId
        };
        openProjectForProcessing(state.currentProject);
        
    } catch (error) {
        alert(error.message);
    } finally {
        elements.uploadProgress.classList.add('hidden');
        elements.uploadProjectBtn.disabled = false;
    }
}

function openProject(project) {
    if (project.status === 'processed') {
        showResults(project);
    } else {
        openProjectForProcessing(project);
    }
}

async function openProjectForProcessing(project) {
    state.currentProject = project;
    state.selectedPage = null;
    
    elements.projectsList.parentElement.classList.add('hidden');
    elements.newProjectForm.classList.add('hidden');
    elements.projectResults.classList.add('hidden');
    elements.projectProcessing.classList.remove('hidden');
    
    elements.processingProjectName.textContent = project.name;
    elements.startProcessingBtn.disabled = true;
    
    // Показываем загрузку
    elements.pagesPreview.innerHTML = '<div class="loading">Загрузка превью страниц...</div>';
    
    try {
        // Загружаем PDF для отображения превью
        const pdfUrl = project.pages[0]?.image;
        if (!pdfUrl) {
            throw new Error('PDF не найден');
        }
        
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        
        // Генерируем превью для всех страниц
        const pagesContainer = document.createElement('div');
        pagesContainer.className = 'pages-grid';
        
        // Определяем центральную страницу
        const centerPage = Math.ceil(pdf.numPages / 2);
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page-item';
            pageDiv.dataset.page = i;
            
            // Для страниц далеко от центра - скрываем их (показываем только 5 страниц)
            const distanceFromCenter = Math.abs(i - centerPage);
            if (distanceFromCenter > 2) {
                pageDiv.style.display = 'none';
            }
            
            pageDiv.innerHTML = `
                <canvas id="page-canvas-${i}" class="page-canvas"></canvas>
                <div class="page-item-info">Страница ${i}</div>
            `;
            pagesContainer.appendChild(pageDiv);
            
            // Рендерим страницу
            const page = await pdf.getPage(i);
            const scale = 1.5;
            const viewport = page.getViewport({ scale });
            
            const canvas = pageDiv.querySelector('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
        }
        
        elements.pagesPreview.innerHTML = '';
        elements.pagesPreview.appendChild(pagesContainer);
        
        // Функция для обновления видимости страниц
        function updatePageVisibility(selectedPage) {
            const pageItems = document.querySelectorAll('.page-item');
            pageItems.forEach(item => {
                const pageNum = parseInt(item.dataset.page);
                const distance = Math.abs(pageNum - selectedPage);
                
                if (distance <= 2) {
                    item.style.display = 'block';
                    // Сортировка элементов для правильного порядка
                    item.style.order = pageNum;
                } else {
                    item.style.display = 'none';
                }
            });
        }
        
        // Обработчики выбора страницы
        document.querySelectorAll('.page-item').forEach(item => {
            item.addEventListener('click', () => {
                const clickedPage = parseInt(item.dataset.page);
                
                // Обновляем выбор
                document.querySelectorAll('.page-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                state.selectedPage = clickedPage;
                elements.startProcessingBtn.disabled = false;
                
                // Обновляем видимость страниц
                updatePageVisibility(clickedPage);
            });
        });
        
        // Автоматически выбираем центральную страницу
        const centerItem = document.querySelector(`.page-item[data-page="${centerPage}"]`);
        if (centerItem) {
            centerItem.click();
        }
        
        // Настраиваем кнопки навигации
        elements.totalPages.textContent = pdf.numPages;
        
        function updateNavigation() {
            const current = state.selectedPage || centerPage;
            elements.currentPageNum.textContent = current;
            elements.prevPageBtn.disabled = current <= 1;
            elements.nextPageBtn.disabled = current >= pdf.numPages;
        }
        
        elements.prevPageBtn.onclick = () => {
            if (state.selectedPage > 1) {
                const newPage = state.selectedPage - 1;
                const item = document.querySelector(`.page-item[data-page="${newPage}"]`);
                if (item) item.click();
                updateNavigation();
            }
        };
        
        elements.nextPageBtn.onclick = () => {
            if (state.selectedPage < pdf.numPages) {
                const newPage = state.selectedPage + 1;
                const item = document.querySelector(`.page-item[data-page="${newPage}"]`);
                if (item) item.click();
                updateNavigation();
            }
        };
        
        // Обновляем навигацию при клике на страницу
        document.querySelectorAll('.page-item').forEach(item => {
            item.addEventListener('click', updateNavigation);
        });
        
        updateNavigation();
        
    } catch (error) {
        console.error('Ошибка загрузки PDF:', error);
        elements.pagesPreview.innerHTML = `
            <div class="error-message">
                <p>Ошибка загрузки превью PDF: ${error.message}</p>
                <p>Пожалуйста, попробуйте обновить страницу</p>
            </div>
        `;
    }
}

async function startProcessing() {
    if (!state.selectedPage) return;
    
    elements.startProcessingBtn.disabled = true;
    elements.startProcessingBtn.textContent = 'Обработка...';
    
    try {
        const data = await api(`/projects/${state.currentProject.id}/process`, {
            method: 'POST',
            body: {
                pageNumber: state.selectedPage,
                installPiles: elements.installPiles.checked,
                pileDistance: elements.pileDistance.value
            }
        });
        
        state.tokens = data.tokensLeft;
        elements.userTokens.textContent = state.tokens;
        elements.profileTokens.textContent = state.tokens;
        
        // Обновляем проект
        const projects = await api('/projects');
        const updatedProject = projects.find(p => p.id === state.currentProject.id);
        if (updatedProject) {
            showResults(updatedProject);
        }
        
    } catch (error) {
        alert(error.message);
        elements.startProcessingBtn.disabled = false;
        elements.startProcessingBtn.textContent = 'Начать обработку (2 токена)';
    }
}

// ===== РЕЗУЛЬТАТЫ =====
function showResults(project) {
    state.currentProject = project;
    
    elements.projectProcessing.classList.add('hidden');
    elements.projectsList.parentElement.classList.add('hidden');
    elements.newProjectForm.classList.add('hidden');
    elements.projectResults.classList.remove('hidden');
    
    const analysis = project.analysis;
    
    // Статистика
    elements.statsWallLength.textContent = `${analysis.totalNewWallLength} м`;
    
    if (project.pileOptions?.installPiles) {
        elements.statsPilesCard.style.display = 'block';
        elements.statsPilesCount.textContent = `${analysis.pilesNeeded} шт`;
    } else {
        elements.statsPilesCard.style.display = 'none';
    }
    
    // 3D визуализация
    init3DVisualization(analysis.objects3D);
}

function init3DVisualization(objects3D) {
    const container = elements.container3d;
    container.innerHTML = '';
    
    // Сцена
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    
    // Камера
    const camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(10, 10, 10);
    
    // Рендерер
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    
    // Управление камерой
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Освещение
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Сетка пола
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    scene.add(gridHelper);
    
    // Добавление объектов
    objects3D.forEach(obj => {
        const geometry = new THREE.BoxGeometry(obj.width, obj.height, obj.depth);
        const material = new THREE.MeshLambertMaterial({ color: obj.color });
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.set(
            obj.x + obj.width / 2,
            obj.height / 2,
            obj.z + obj.depth / 2
        );
        
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    });
    
    // Анимация
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
    
    // Обработка изменения размера
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

async function exportExcel() {
    if (!state.currentProject) return;
    
    try {
        const response = await fetch(
            `${API_URL}/api/projects/${state.currentProject.id}/export/excel`,
            {
                headers: { 'Authorization': `Bearer ${state.token}` }
            }
        );
        
        if (!response.ok) {
            let errorMessage = 'Ошибка экспорта';
            try {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } else {
                    errorMessage = `Ошибка сервера: ${response.status} ${response.statusText}`;
                }
            } catch (e) {
                errorMessage = `Ошибка сервера: ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smeta_${state.currentProject.name}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Excel export error:', error);
        alert('Ошибка при скачивании Excel: ' + error.message);
    }
}

async function exportPdf() {
    if (!state.currentProject) return;
    
    try {
        const response = await fetch(
            `${API_URL}/api/projects/${state.currentProject.id}/export/pdf`,
            {
                headers: { 'Authorization': `Bearer ${state.token}` }
            }
        );
        
        if (!response.ok) {
            let errorMessage = 'Ошибка экспорта';
            try {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } else {
                    errorMessage = `Ошибка сервера: ${response.status} ${response.statusText}`;
                }
            } catch (e) {
                errorMessage = `Ошибка сервера: ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smeta_${state.currentProject.name}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('PDF export error:', error);
        alert('Ошибка при скачивании PDF: ' + error.message);
    }
}

function backToProjects() {
    elements.projectResults.classList.add('hidden');
    elements.projectProcessing.classList.add('hidden');
    elements.newProjectForm.classList.add('hidden');
    elements.projectsList.parentElement.classList.remove('hidden');
    loadProjects();
}

// ===== ЛИЧНЫЙ КАБИНЕТ =====
async function buyTokens(amount) {
    try {
        const data = await api('/user/buy-tokens', {
            method: 'POST',
            body: { amount }
        });
        
        state.tokens = data.tokens;
        elements.userTokens.textContent = state.tokens;
        elements.profileTokens.textContent = state.tokens;
        
        elements.paymentMessage.textContent = `Успешно добавлено ${amount} токенов!`;
        elements.paymentMessage.className = 'message success';
        
        setTimeout(() => {
            elements.paymentMessage.classList.add('hidden');
        }, 3000);
    } catch (error) {
        elements.paymentMessage.textContent = error.message;
        elements.paymentMessage.className = 'message error';
    }
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
document.addEventListener('DOMContentLoaded', () => {
    // Вкладки авторизации
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Форма входа
    elements.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        login(username, password);
    });
    
    // Форма регистрации
    elements.registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-password-confirm').value;
        
        if (password !== confirm) {
            showAuthMessage('Пароли не совпадают');
            return;
        }
        
        register(username, password);
    });
    
    // Выход
    elements.logoutBtn.addEventListener('click', logout);
    
    // Вкладки главной страницы
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.tab === 'dashboard') {
                backToProjects();
            }
            switchMainTab(tab.dataset.tab);
        });
    });
    
    // Новый проект
    elements.newProjectBtn.addEventListener('click', showNewProjectForm);
    elements.cancelProjectBtn.addEventListener('click', hideNewProjectForm);
    elements.uploadProjectBtn.addEventListener('click', uploadProject);
    
    // Обработка
    elements.startProcessingBtn.addEventListener('click', startProcessing);
    
    // Результаты
    elements.exportExcelBtn.addEventListener('click', exportExcel);
    elements.exportPdfBtn.addEventListener('click', exportPdf);
    elements.backToProjectsBtn.addEventListener('click', backToProjects);
    
    // Назад со страницы обработки
    document.getElementById('back-from-processing-btn').addEventListener('click', backToProjects);
    
    // Покупка токенов
    document.querySelectorAll('.package-card').forEach(card => {
        card.addEventListener('click', () => {
            const tokens = parseInt(card.dataset.tokens);
            buyTokens(tokens);
        });
    });
    
    // Проверка авторизации при загрузке
    if (state.token) {
        api('/user')
            .then(data => {
                state.tokens = data.tokens;
                showMainPage();
            })
            .catch(() => {
                logout();
            });
    }
});
