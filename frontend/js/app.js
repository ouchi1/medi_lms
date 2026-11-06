import { API } from './modules/api.js';

// ប្រកាសអថេរទាំងអស់នៅខាងលើគេបង្អស់
let authMode = 'login';
let activeExam = { subjectId: null, questions: [], answers: {}, currentIndex: 0 };
let skippedQuestions = [];
let currentSchoolFilter = ''; 

// 🔥 Function សម្រាប់បំប្លែង Link YouTube គ្រប់ទម្រង់ទៅជា Embed Link 🔥
function getYouTubeEmbedUrl(url) {
    if (!url) return '';
    if (url.includes('/embed/')) return url;

    let videoId = '';
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'youtu.be') {
            videoId = urlObj.pathname.slice(1);
        } else if (urlObj.hostname.includes('youtube.com')) {
            videoId = urlObj.searchParams.get('v');
        }
    } catch (e) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            videoId = match[2];
        }
    }

    if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
    }
    return url;
}

// មុខងារជំនួយសម្រាប់ទាញយកឈ្មោះតម្រៀបតាមថ្នាក់ (Hierarchical Names) ដាក់នៅកន្លែងតែមួយ
function getFolderPathName(subject, allList) {
    let path = [subject.name];
    let current = subject;
    while (current.parent_id !== null && current.parent_id !== undefined) {
        let parent = allList.find(s => s.id === current.parent_id);
        if (parent) {
            path.unshift(parent.name);
            current = parent;
        } else {
            break;
        }
    }
    return path.join(' ➔ ');
}

// មុខងារជំនួយសម្រាប់បម្លែង File ទៅជា Base64
function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) lucide.createIcons();
    initApp();
});

function initApp() {
    renderUserSession();
    setupNavigation();
    setupEvents();
    setupDarkMode(); // 🟢 ហៅមុខងារ Dark Mode
    loadLessons();
    loadQCMSubjects();

    const savedExamState = localStorage.getItem('exam_state');
    if (savedExamState) {
        try {
            const parsedState = JSON.parse(savedExamState);
            activeExam = parsedState;
            skippedQuestions = parsedState.skippedQuestions || [];

            document.getElementById('school-card-view').classList.add('hidden');
            document.getElementById('school-details-view').classList.add('hidden');
            document.getElementById('qcm-exam-view').classList.remove('hidden');
            document.getElementById('qcm-result-view').classList.add('hidden');
            
            renderQuestion();
            
            const navQcmBtn = document.getElementById('nav-qcm');
            if (navQcmBtn) navQcmBtn.click();
            localStorage.setItem('active_tab', 'nav-qcm');
        } catch (error) {
            console.error("Error parsing saved exam state:", error);
            localStorage.removeItem('exam_state'); 
        }
    }
}

// ១. គ្រប់គ្រង Navigation & Tabs
function setupNavigation() {
    const tabs = {
        'nav-home': 'tab-home',
        'nav-lessons': 'tab-lessons',
        'nav-qcm': 'tab-qcm',
        'nav-admin': 'tab-admin',
        'btn-logo': 'tab-home'
    };

    Object.keys(tabs).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.onclick = () => {
                document.querySelectorAll('.nav-btn').forEach(b => {
                    b.classList.remove('bg-white', 'dark:bg-slate-700', 'text-brand-600', 'dark:text-indigo-400', 'shadow-sm');
                    b.classList.add('text-slate-600', 'dark:text-slate-300');
                });
                if (btnId !== 'btn-logo' && btnId !== 'nav-admin') {
                    btn.classList.add('bg-white', 'dark:bg-slate-700', 'text-brand-600', 'dark:text-indigo-400', 'shadow-sm');
                    btn.classList.remove('text-slate-600', 'dark:text-slate-300');
                }

                document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
                document.getElementById(tabs[btnId]).classList.remove('hidden');

                localStorage.setItem('active_tab', btnId);

                if (btnId === 'nav-qcm' || btnId === 'nav-admin') {
                    if (btnId === 'nav-qcm') {
                        if (!localStorage.getItem('exam_state')) {
                            document.getElementById('school-card-view').classList.remove('hidden');
                            document.getElementById('school-details-view').classList.add('hidden');
                            document.getElementById('qcm-exam-view').classList.add('hidden');
                            document.getElementById('qcm-result-view').classList.add('hidden');
                        }
                    }
                    loadQCMSubjects();
                } else if (btnId === 'nav-lessons') {
                    loadLessons();
                }
            };
        }
    });

    const savedTab = localStorage.getItem('active_tab');
    if (savedTab && document.getElementById(savedTab)) {
        document.getElementById(savedTab).click();
    }

    const cardTrackResult = document.getElementById('card-track-result');
    if (cardTrackResult) {
        cardTrackResult.onclick = () => {
            const navQcmBtn = document.getElementById('nav-qcm');
            if (navQcmBtn) {
                navQcmBtn.click();
            }

            const savedExamState = localStorage.getItem('exam_state');
            if (!savedExamState) {
                alert('អ្នកមិនទាន់បានធ្វើការប្រឡងណាមួយនៅឡើយទេ! សូមជ្រើសរើសមុខវិជ្ជាដើម្បីប្រឡងសិន។');
            }
        };
    }
}

// ២. Render User Session
function renderUserSession() {
    const user = JSON.parse(localStorage.getItem('medi_user'));
    const guestView = document.getElementById('auth-guest-view');
    const userView = document.getElementById('auth-user-view');
    const adminBtn = document.getElementById('nav-admin');

    if (user) {
        guestView.classList.add('hidden');
        userView.classList.remove('hidden');
        document.getElementById('user-display-name').innerText = user.name;
        document.getElementById('user-role-badge').innerText = user.role.toUpperCase();

        const role = user.role.toUpperCase();
        if (role === 'ADMIN' || role === 'TEACHER') {
            if (adminBtn) adminBtn.classList.remove('hidden');
            
            document.querySelectorAll('.admin-only').forEach(el => {
                if (el) el.classList.remove('hidden');
            });
        } else {
            if (adminBtn) adminBtn.classList.add('hidden');
            
            document.querySelectorAll('.admin-only').forEach(el => {
                if (el) el.classList.add('hidden');
            });
        }
    } else {
        guestView.classList.remove('hidden');
        userView.classList.add('hidden');
        if (adminBtn) adminBtn.classList.add('hidden');
        
        document.querySelectorAll('.admin-only').forEach(el => {
            if (el) el.classList.add('hidden');
        });
    }
}

// ៣. ទាញយកមេរៀនវីដេអូ
async function loadLessons() {
    const foldersGrid = document.getElementById('lesson-folders-grid');
    const videosView = document.getElementById('lesson-videos-view');
    const videosGrid = document.getElementById('lessons-grid');
    const currentFolderTitle = document.getElementById('current-folder-title');
    const btnBackToFolders = document.getElementById('btn-back-to-folders');
    const lessonSelectSubject = document.getElementById('lesson-select-subject');

    if (!foldersGrid) return;

    try {
        const subjects = await API.request('/subjects'); 
        const lessons = await API.getLessons();

        if (!subjects || !Array.isArray(subjects) || !lessons) return;

        if (lessonSelectSubject) {
            const videoSubjects = subjects.filter(s => s.type === 'video');
            lessonSelectSubject.innerHTML = `<option value="">-- ជ្រើសរើសមុខវិជ្ជាវីដេអូ --</option>` + videoSubjects.map(sub => {
                return `<option value="${sub.id}">${sub.name} (ID: ${sub.id})</option>`;
            }).join('');
        }

        const videoFolders = subjects.filter(s => s.parent_id === null && s.type === 'video');
        const videoChildSubjects = subjects.filter(s => s.parent_id !== null && s.type === 'video');

        if (!videoFolders.length) {
            foldersGrid.innerHTML = `<div class="col-span-3 text-center py-10 text-slate-400">មិនទាន់មាន Folder មេសម្រាប់វីដេអូនៅឡើយទេ</div>`;
            return;
        }

        const user = JSON.parse(localStorage.getItem('medi_user'));
        const isAdmin = user && (user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'TEACHER');

        foldersGrid.innerHTML = videoFolders.map(folder => {
            const childrenIds = videoChildSubjects.filter(s => s.parent_id === folder.id).map(s => s.id);
            const allIds = [folder.id, ...childrenIds];
            const lessonCount = lessons.filter(l => allIds.includes(l.subject_id)).length;

            return `
                <div class="folder-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition relative flex flex-col items-center text-center" data-folder-id="${folder.id}" data-folder-name="${folder.name}">
                    ${isAdmin ? `
                        <div class="absolute top-3 right-3 flex items-center gap-1 z-10">
                            <button type="button" data-id="${folder.id}" data-name="${folder.name}" class="btn-edit-video-folder p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg transition" title="កែប្រែឈ្មោះ">✏️</button>
                            <button type="button" data-id="${folder.id}" class="btn-delete-video-folder p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-slate-700 rounded-lg transition" title="លុប Folder">🗑️</button>
                        </div>
                    ` : ''}
                    <div class="folder-content-click cursor-pointer w-full flex flex-col items-center">
                        <div class="w-16 h-16 rounded-xl bg-amber-50 dark:bg-slate-700 text-amber-600 flex items-center justify-center font-bold text-3xl mb-4">📁</div>
                        <h3 class="font-bold text-slate-900 dark:text-white text-lg mb-1">${folder.name}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${lessonCount} វីដេអូ</p>
                    </div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.folder-content-click').forEach((item, idx) => {
            item.onclick = () => {
                const card = document.querySelectorAll('.folder-card')[idx];
                const folderId = parseInt(card.dataset.folderId);
                const folderName = card.dataset.folderName;

                foldersGrid.classList.add('hidden');
                videosView.classList.remove('hidden');
                currentFolderTitle.innerText = folderName;

                const openAddLessonBtn = document.getElementById('btn-open-add-lesson-modal');
                if (openAddLessonBtn) {
                    openAddLessonBtn.dataset.currentFolderId = folderId;
                }

                const childrenIds = videoChildSubjects.filter(s => s.parent_id === folderId).map(s => s.id);
                const allIds = [folderId, ...childrenIds];
                const folderLessons = lessons.filter(l => allIds.includes(l.subject_id));

                if (!folderLessons.length) {
                    videosGrid.innerHTML = `<div class="col-span-3 text-center py-10 text-slate-400">មិនទាន់មានវីដេអូនៅក្នុង Folder នេះទេ</div>`;
                    return;
                }

                videosGrid.innerHTML = folderLessons.map(les => `
                    <div class="bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 p-4 shadow-sm hover:shadow-md transition relative flex flex-col justify-between">
                        <div>
                            <div class="aspect-video bg-slate-900 rounded-xl overflow-hidden mb-3">
                                <iframe src="${getYouTubeEmbedUrl(les.video_url)}" class="w-full h-full" frameborder="0" allowfullscreen></iframe>
                            </div>
                            <div class="flex items-center justify-between mb-1">
                                <span class="text-xs font-bold text-brand-600 uppercase tracking-wider">${les.subject_name || 'វីដេអូមេរៀន'}</span>
                                ${isAdmin ? `
                                    <div class="flex items-center gap-1">
                                        <button type="button" data-id="${les.id}" data-title="${les.title}" data-url="${les.video_url}" data-subject="${les.subject_id}" class="btn-edit-lesson text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg font-bold transition">✏️ កែ</button>
                                        <button type="button" data-id="${les.id}" class="btn-delete-lesson text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg font-bold transition">🗑️ លុប</button>
                                    </div>
                                ` : ''}
                            </div>
                            <h4 class="font-bold text-slate-900 dark:text-white text-sm sm:text-base">${les.title}</h4>
                        </div>
                    </div>
                `).join('');

                document.querySelectorAll('.btn-edit-lesson').forEach(btn => {
                    btn.onclick = async () => {
                        document.getElementById('edit-lesson-id').value = btn.dataset.id;
                        document.getElementById('edit-lesson-title').value = btn.dataset.title;
                        document.getElementById('edit-lesson-video-url').value = btn.dataset.url;
                        
                        const editSubjectSelect = document.getElementById('edit-lesson-subject');
                        if (editSubjectSelect) {
                            try {
                                const subs = await API.request('/subjects');
                                const videoSubs = subs.filter(s => s.type === 'video');
                                editSubjectSelect.innerHTML = `<option value="">-- ជ្រើសរើសមុខវិជ្ជាវីដេអូ --</option>` + videoSubs.map(sub => {
                                    return `<option value="${sub.id}">${sub.name} (ID: ${sub.id})</option>`;
                                }).join('');
                                editSubjectSelect.value = btn.dataset.subject;
                            } catch (err) { console.error(err); }
                        }
                        document.getElementById('edit-lesson-modal').classList.remove('hidden');
                    };
                });

                document.querySelectorAll('.btn-delete-lesson').forEach(btn => {
                    btn.onclick = async () => {
                        if (confirm('តើអ្នកពិតជាចង់លុបមេរៀនវីដេអូនេះចេញមែនទេ?')) {
                            try {
                                const res = await API.deleteLesson(btn.dataset.id);
                                alert(res.message);
                                loadLessons();
                            } catch (err) { alert(err.message); }
                        }
                    };
                });
            };
        });

        document.querySelectorAll('.btn-edit-video-folder').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const oldName = btn.dataset.name;
                const newName = prompt('សូមបញ្ចូលឈ្មោះ Folder វីដេអូថ្មី:', oldName);
                if (newName && newName.trim() !== "" && newName !== oldName) {
                    try {
                        const res = await API.updateSubject(id, newName.trim(), null);
                        alert(res.message || 'កែប្រែ Folder ជោគជ័យ!');
                        loadLessons();
                        loadQCMSubjects();
                    } catch (err) {
                        alert('មានបញ្ហា: ' + err.message);
                    }
                }
            };
        });

        document.querySelectorAll('.btn-delete-video-folder').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('តើអ្នកពិតជាចង់លុប Folder នេះមែនទេ?')) {
                    try {
                        const res = await API.deleteSubject(btn.dataset.id);
                        alert(res.message || 'លុប Folder បានជោគជ័យ!');
                        loadLessons();
                        loadQCMSubjects();
                    } catch (err) {
                        alert('មានបញ្ហា: ' + err.message);
                    }
                }
            };
        });

        if (btnBackToFolders) {
            btnBackToFolders.onclick = () => {
                videosView.classList.add('hidden');
                foldersGrid.classList.remove('hidden');
            };
        }

        const openAddLessonBtn = document.getElementById('btn-open-add-lesson-modal');
        if (openAddLessonBtn) {
            openAddLessonBtn.onclick = () => {
                const currentFolderId = openAddLessonBtn.dataset.currentFolderId;
                if (!currentFolderId) return alert('សូមជ្រើសរើស Folder ជាមុនសិន!');

                document.getElementById('inline-lesson-subject-id').value = currentFolderId;
                document.getElementById('inline-add-lesson-modal').classList.remove('hidden');
            };
        }
    } catch (e) { 
        console.error('Error loading lessons:', e.message); 
    }
}

// ៤. ទាញយកមុខវិជ្ជា QCM និងសាលា
async function loadQCMSubjects() {
    const grid = document.getElementById('qcm-subjects-grid');
    const yearSelect = document.getElementById('year-filter-select');
    const schoolCard = document.getElementById('school-card-view');
    const schoolDetails = document.getElementById('school-details-view');
    const btnBackSchool = document.getElementById('btn-back-to-school');
    
    const currentSchoolLogo = document.getElementById('current-school-logo');
    const currentSchoolName = document.getElementById('current-school-name');

    try {
        const subjects = await API.getQCMSubjects();
        let schools = [];
        
        try {
            schools = await API.getSchools();
            if (!Array.isArray(schools) || schools.length === 0) throw new Error("No schools");
        } catch (schoolError) {
            schools = [
                { id: 1, name: 'សាលារៀនវេជ្ជសាស្ត្រ', logo_type: 'emoji', logo_url: '🏥', description: 'Medical School' },
                { id: 2, name: 'សាលារៀនគិលានុបដ្ឋាយិកា', logo_type: 'emoji', logo_url: '💉', description: 'Nursing School' },
                { id: 3, name: 'សាលារៀនទន្តសាស្ត្រ', logo_type: 'emoji', logo_url: '🦷', description: 'Dentistry School' }
            ];
        }

        renderAdminSchoolsList(schools);

        if (!subjects || !Array.isArray(subjects)) return;

        const getParentId = (s) => {
            let pid = s.parent_id !== undefined ? s.parent_id : (s.parentId !== undefined ? s.parentId : s.parent);
            if (pid === undefined || pid === null || String(pid).trim().toLowerCase() === 'null' || String(pid).trim() === '0' || String(pid).trim() === '') {
                return null;
            }
            return parseInt(pid, 10);
        };

        if (yearSelect) {
            let yearOptions = `<option value="all">-- បង្ហាញទាំងអស់ --</option>`;
            for (let y = 1; y <= 8; y++) {
                for (let s = 1; s <= 2; s++) {
                    yearOptions += `<option value="Y${y}S${s}">Y${y}S${s}</option>`;
                }
            }
            yearSelect.innerHTML = yearOptions;
        }

        const schoolGrid = schoolCard.querySelector('.grid');
        schoolGrid.innerHTML = schools.map(school => {
            let cleanLogo = school.logo_url;
            if (!cleanLogo || typeof cleanLogo !== 'string' || cleanLogo.includes('object')) {
                cleanLogo = '🏫';
            }

            let logoHtml = cleanLogo.startsWith('http') || cleanLogo.startsWith('data:image') ? 
                `<img src="${cleanLogo}" alt="logo" class="w-20 h-20 object-contain rounded-2xl mb-4 bg-white p-1 border border-slate-200 shadow-sm">` : 
                `<div class="text-4xl mb-4">${cleanLogo}</div>`;

            return `
                <div class="school-select-card bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg transition cursor-pointer flex flex-col items-center text-center group" data-school-id="${school.id}" data-school-name="${school.name}">
                    ${logoHtml}
                    <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">${school.name}</h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400">${school.description || ''}</p>
                </div>
            `;
        }).join('');

        const schoolIdSelect = document.getElementById('new-folder-school-id');
        if (schoolIdSelect) {
            schoolIdSelect.innerHTML = `<option value="">-- ជ្រើសរើសសាលា --</option>` + schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }

        const qcmOnlySubjects = subjects.filter(s => s.type === 'qcm');

        const qcmParentOptions = qcmOnlySubjects.map(s => {
            const fullNamePath = getFolderPathName(s, qcmOnlySubjects);
            return `<option value="${s.id}">${fullNamePath} (ID: ${s.id})</option>`;
        }).join('');

        const parentIdSelect = document.getElementById('new-folder-parent-id');
        if (parentIdSelect) {
            parentIdSelect.innerHTML = `<option value="">-- ជា Folder មេ (No Parent) --</option>` + qcmParentOptions;
        }

        const subjectParentSelect = document.getElementById('subject-parent-select');
        if (subjectParentSelect) {
            subjectParentSelect.innerHTML = `<option value="">-- ជាមុខវិជ្ជាមេទូទៅ (No Parent) --</option>` + qcmParentOptions;
        }

        document.querySelectorAll('.school-select-card').forEach(card => {
            card.onclick = () => {
                const schoolId = parseInt(card.dataset.schoolId);
                const schoolName = card.dataset.schoolName;
                currentSchoolFilter = schoolName;

                const schoolData = schools.find(s => s.id === schoolId);
                let cleanLogo = schoolData.logo_url || '🏫';
                if (cleanLogo.startsWith('http') || cleanLogo.startsWith('data:image')) {
                    currentSchoolLogo.innerHTML = `<img src="${cleanLogo}" class="w-10 h-10 object-contain rounded-lg">`;
                    currentSchoolLogo.className = 'w-10 h-10';
                } else {
                    currentSchoolLogo.innerHTML = cleanLogo;
                    currentSchoolLogo.className = 'w-10 h-10 flex items-center justify-center text-xl';
                }
                currentSchoolName.innerText = schoolName;

                schoolCard.classList.add('hidden');
                schoolDetails.classList.remove('hidden');
                
                const currentYear = yearSelect ? yearSelect.value : 'all';
                renderSubjectGrid(subjects, schoolId, currentYear, getParentId);
            };
        });

        if (btnBackSchool) {
            btnBackSchool.onclick = () => {
                schoolDetails.classList.add('hidden');
                schoolCard.classList.remove('hidden');
                currentSchoolFilter = ''; 
            };
        }

        if (yearSelect) {
            yearSelect.onchange = (e) => {
                const selectedYear = e.target.value;
                const activeCard = document.querySelector('.school-select-card');
                const schoolId = activeCard ? parseInt(activeCard.dataset.schoolId) : 1;
                renderSubjectGrid(subjects, schoolId, selectedYear, getParentId);
            };
        }

        if (subjects.length > 0) {
            const qcmOnlyOptions = qcmOnlySubjects.map(s => {
                const hasParent = getParentId(s) !== null;
                return `<option value="${s.id}">${hasParent ? `↳ ` : ''}${s.name} (ID: ${s.id})</option>`;
            }).join('');
            
            const adminSelect = document.getElementById('qcm-select-subject');
            const adminFilterSelect = document.getElementById('admin-filter-subject');
            const excelImportSelect = document.getElementById('excel-import-subject-id');

            if (adminSelect) adminSelect.innerHTML = qcmOnlyOptions;
            if (excelImportSelect) excelImportSelect.innerHTML = `<option value="">-- ជ្រើសរើសមុខវិជ្ជា --</option>` + qcmOnlyOptions;

            if (adminFilterSelect) {
                adminFilterSelect.innerHTML = qcmOnlyOptions;
                const childSubs = qcmOnlySubjects.filter(s => getParentId(s) !== null);
                const defaultSubId = childSubs.length > 0 ? childSubs[0].id : (qcmOnlySubjects[0] ? qcmOnlySubjects[0].id : '');
                if (defaultSubId) loadAdminQuestions(defaultSubId);
            }

            renderAdminSubjectsList(qcmOnlySubjects, getParentId);
        }
    } catch (e) { 
        console.error('Error loading subjects:', e.message); 
    }
}

// ៥. Function Render Subject Grid
function renderSubjectGrid(allSubjects, schoolId, yearFilter, getParentId) {
    const grid = document.getElementById('qcm-subjects-grid');
    if (!grid) return;

    let filteredSubjects = allSubjects.filter(s => s.type === 'qcm');

    if (schoolId) {
        filteredSubjects = filteredSubjects.filter(s => {
            if (getParentId(s) === null) {
                return parseInt(s.school_id) === parseInt(schoolId);
            }
            return true; 
        });
    }

    if (yearFilter && yearFilter !== 'all') {
        filteredSubjects = filteredSubjects.filter(s => {
            const nameMatch = s.name && s.name.toUpperCase().includes(yearFilter.toUpperCase());
            const descMatch = s.description && s.description.toUpperCase().includes(yearFilter.toUpperCase());
            
            if (getParentId(s) === null) {
                const hasMatchingChild = allSubjects.some(child => 
                    getParentId(child) === parseInt(s.id) && 
                    ((child.name && child.name.toUpperCase().includes(yearFilter.toUpperCase())) ||
                     (child.description && child.description.toUpperCase().includes(yearFilter.toUpperCase())))
                );
                return nameMatch || descMatch || hasMatchingChild;
            } else {
                const parentFolder = allSubjects.find(p => p.id === getParentId(s));
                const parentMatch = parentFolder && (
                    (parentFolder.name && parentFolder.name.toUpperCase().includes(yearFilter.toUpperCase())) ||
                    (parentFolder.description && parentFolder.description.toUpperCase().includes(yearFilter.toUpperCase()))
                );
                return nameMatch || descMatch || parentMatch;
            }
        });
    }

    const rootFolders = filteredSubjects.filter(s => getParentId(s) === null);

    if (!rootFolders.length && !filteredSubjects.length) {
        grid.innerHTML = `<div class="col-span-3 text-center py-10 text-slate-400">មិនមាន Folder ឬមុខវិជ្ជាសម្រាប់ឆ្នាំសិក្សា ${yearFilter} នេះទេ</div>`;
        return;
    }

    let htmlContent = '';

    rootFolders.forEach((rootFolder) => {
        const level1Children = allSubjects.filter(s => getParentId(s) === parseInt(rootFolder.id) && s.type === 'qcm');

        htmlContent += `
            <div class="col-span-1 md:col-span-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm mb-4">
                <div id="folder-btn-${rootFolder.id}" class="flex items-center justify-between cursor-pointer select-none">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-xl bg-amber-50 dark:bg-slate-700 text-amber-600 flex items-center justify-center font-bold text-2xl">📁</div>
                        <div>
                            <h3 class="font-bold text-slate-900 dark:text-white text-xl">${rootFolder.name}</h3>
                            <p class="text-xs text-slate-500 dark:text-slate-400 font-medium">ចុចទីនេះដើម្បីបង្ហាញ/លាក់ថ្នាក់រៀនខាងក្នុង</p>
                        </div>
                    </div>
                    <span id="folder-arrow-${rootFolder.id}" class="text-xl font-bold text-slate-400 transition-transform">▼</span>
                </div>
                
                <div id="folder-container-${rootFolder.id}" class="hidden pt-4 mt-4 border-t border-slate-100 dark:border-slate-700 space-y-4">
        `;

        if (level1Children.length > 0) {
            level1Children.forEach(l1Child => {
                const level2Children = allSubjects.filter(s => getParentId(s) === parseInt(l1Child.id) && s.type === 'qcm');

                if (level2Children.length > 0) {
                    htmlContent += `
                        <div class="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                            <div id="subfolder-btn-${l1Child.id}" class="flex items-center justify-between cursor-pointer select-none">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-lg bg-amber-100 dark:bg-slate-800 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-xl">📂</div>
                                    <div>
                                        <h4 class="font-bold text-slate-900 dark:text-white text-base">${l1Child.name}</h4>
                                        <p class="text-[11px] text-slate-500 dark:text-slate-400">មាន ${level2Children.length} មុខវិជ្ជា/ថ្នាក់ខាងក្នុង</p>
                                    </div>
                                </div>
                                <span id="subfolder-arrow-${l1Child.id}" class="text-sm font-bold text-slate-400 transition-transform">▼</span>
                            </div>
                            
                            <div id="subfolder-container-${l1Child.id}" class="hidden space-y-3 pt-3 mt-3 border-t border-slate-200 dark:border-slate-700">
                                ${level2Children.map(l2Child => {
                                    const grandChildren = allSubjects.filter(s => getParentId(s) === parseInt(l2Child.id) && s.type === 'qcm');
                                    
                                    if (grandChildren.length > 0) {
                                        return `
                                            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                                                <div id="deepfolder-btn-${l2Child.id}" class="flex items-center justify-between cursor-pointer select-none mb-2">
                                                    <div class="flex items-center gap-2.5">
                                                        <span class="text-lg">📁</span>
                                                        <h5 class="font-bold text-slate-800 dark:text-slate-200 text-sm">${l2Child.name}</h5>
                                                    </div>
                                                    <span id="deepfolder-arrow-${l2Child.id}" class="text-xs font-bold text-slate-400">▼</span>
                                                </div>
                                                <div id="deepfolder-container-${l2Child.id}" class="hidden grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                                                    ${grandChildren.map(gc => `
                                                        <div data-id="${gc.id}" class="subject-card bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm hover:border-brand-500 transition cursor-pointer">
                                                            <div class="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-slate-800 text-brand-600 flex items-center justify-center font-bold text-xs mb-1.5">📄</div>
                                                            <h6 class="font-bold text-slate-900 dark:text-white text-xs mb-1">${gc.name}</h6>
                                                            <p class="text-[10px] text-slate-500 dark:text-slate-400 mb-2">${gc.question_count || 0} សំណួរ</p>
                                                            <span class="text-[11px] font-bold text-brand-600">ធ្វើតេស្ត →</span>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            </div>
                                        `;
                                    } else {
                                        return `
                                            <div data-id="${l2Child.id}" class="subject-card bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm hover:border-brand-500 transition cursor-pointer flex items-center justify-between">
                                                <div class="flex items-center gap-2.5">
                                                    <div class="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-slate-700 text-brand-600 flex items-center justify-center font-bold text-xs">📄</div>
                                                    <div>
                                                        <h5 class="font-bold text-slate-900 dark:text-white text-xs">${l2Child.name}</h5>
                                                        <p class="text-[10px] text-slate-500 dark:text-slate-400">${l2Child.question_count || 0} សំណួរ</p>
                                                    </div>
                                                </div>
                                                <span class="text-xs font-bold text-brand-600">ធ្វើតេស្ត →</span>
                                            </div>
                                        `;
                                    }
                                }).join('')}
                            </div>
                        </div>
                    `;
                } else {
                    htmlContent += `
                        <div data-id="${l1Child.id}" class="subject-card bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:border-brand-500 transition cursor-pointer">
                            <div class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-slate-800 text-brand-600 flex items-center justify-center font-bold text-sm mb-2">📄</div>
                            <h4 class="font-bold text-slate-900 dark:text-white text-sm mb-1">${l1Child.name}</h4>
                            <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-3">${l1Child.question_count || 0} សំណួរ</p>
                            <span class="text-xs font-bold text-brand-600">ចាប់ផ្តើមធ្វើតេស្ត →</span>
                        </div>
                    `;
                }
            });
        } else {
            htmlContent += `<div class="text-sm text-slate-400 py-2">មិនទាន់មានទិន្នន័យនៅខាងក្នុងទេ</div>`;
        }

        htmlContent += `
                </div>
            </div>
        `;
    });

    grid.innerHTML = htmlContent;

    rootFolders.forEach(folder => {
        const folderBtn = document.getElementById(`folder-btn-${folder.id}`);
        const subContainer = document.getElementById(`folder-container-${folder.id}`);
        const arrow = document.getElementById(`folder-arrow-${folder.id}`);

        if (folderBtn && subContainer && arrow) {
            folderBtn.onclick = () => {
                subContainer.classList.toggle('hidden');
                arrow.classList.toggle('rotate-180');
            };
        }

        const level1Children = allSubjects.filter(s => getParentId(s) === parseInt(folder.id) && s.type === 'qcm');
        level1Children.forEach(l1Child => {
            const subBtn = document.getElementById(`subfolder-btn-${l1Child.id}`);
            const subCont = document.getElementById(`subfolder-container-${l1Child.id}`);
            const subArrow = document.getElementById(`subfolder-arrow-${l1Child.id}`);

            if (subBtn && subCont && subArrow) {
                subBtn.onclick = (e) => {
                    e.stopPropagation();
                    subCont.classList.toggle('hidden');
                    subArrow.classList.toggle('rotate-180');
                };
            }

            const level2Children = allSubjects.filter(s => getParentId(s) === parseInt(l1Child.id) && s.type === 'qcm');
            level2Children.forEach(l2Child => {
                const deepBtn = document.getElementById(`deepfolder-btn-${l2Child.id}`);
                const deepCont = document.getElementById(`deepfolder-container-${l2Child.id}`);
                const deepArrow = document.getElementById(`deepfolder-arrow-${l2Child.id}`);

                if (deepBtn && deepCont && deepArrow) {
                    deepBtn.onclick = (e) => {
                        e.stopPropagation();
                        deepCont.classList.toggle('hidden');
                        deepArrow.classList.toggle('rotate-180');
                    };
                }
            });
        });
    });

    document.querySelectorAll('.subject-card').forEach(card => {
        card.onclick = (e) => {
            e.stopPropagation();
            const id = parseInt(card.dataset.id);
            if (id) startExam(id);
        };
    });
}

// ៦. ទាញយកសំណួរមកបង្ហាញក្នុង Admin Panel
async function loadAdminQuestions(subjectId) {
    const listContainer = document.getElementById('admin-questions-list');
    if (!listContainer) return;

    try {
        const questions = await API.getQCMQuestions(subjectId);
        renderAdminQuestionsList(questions, subjectId);
    } catch (e) { console.error(e.message); }
}

function renderAdminQuestionsList(questions, subjectId) {
    const listContainer = document.getElementById('admin-questions-list');
    const searchInput = document.getElementById('admin-search-question');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filteredQuestions = questions.filter(q => {
        const matchText = q.question_text.toLowerCase().includes(searchTerm);
        const matchId = String(q.id).includes(searchTerm);
        return matchText || matchId;
    });

    if (!filteredQuestions.length) {
        listContainer.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">រកមិនឃើញសំណួរដែលត្រូវនឹងការស្វែងរកទេ</p>`;
        return;
    }

    listContainer.innerHTML = filteredQuestions.map((q, idx) => `
        <div class="flex items-center justify-between p-3.5 border dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition mb-2">
            <div class="pr-4">
                <p class="font-semibold text-sm text-slate-800 dark:text-slate-200">${idx + 1}. ${q.question_text}</p>
                <span class="text-xs text-slate-400">ID: ${q.id} | ${q.options.length} ជម្រើសចម្លើយ</span>
            </div>
            <button type="button" data-id="${q.id}" class="btn-delete-qcm px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg text-xs font-bold transition shrink-0">
                🗑️ លុប
            </button>
        </div>
    `).join('');

    document.querySelectorAll('.btn-delete-qcm').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('តើអ្នកពិតជាចង់លុបសំណួរនេះចេញមែនទេ?')) {
                try {
                    const res = await API.deleteQCMQuestion(btn.dataset.id);
                    alert(res.message);
                    loadAdminQuestions(subjectId);
                    loadQCMSubjects();
                } catch (err) { alert(err.message); }
            }
        };
    });
}

function renderAdminSchoolsList(schools) {
    const container = document.getElementById('admin-schools-list');
    if (!container) return;

    container.innerHTML = schools.map(school => {
        let logoDisplay = '🏫';
        if (typeof school.logo_url === 'string' && !school.logo_url.startsWith('[object')) {
            logoDisplay = school.logo_url;
        }

        let logoHtml = logoDisplay.startsWith('http') || logoDisplay.startsWith('data:image') 
            ? `<img src="${logoDisplay}" class="w-8 h-8 object-contain rounded-lg">` 
            : `<span class="text-2xl">${logoDisplay}</span>`;

        return `
            <div class="flex items-center justify-between p-3.5 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm mb-2">
                <div class="flex items-center gap-3">
                    ${logoHtml}
                    <div>
                        <p class="font-bold text-sm text-slate-900 dark:text-white">${school.name}</p>
                        <span class="text-xs text-slate-500 dark:text-slate-400">${school.description || ''}</span>
                    </div>
                </div>
                
                <div class="flex items-center gap-2">
                    <button type="button" data-id="${school.id}" data-name="${school.name}" data-logo="${typeof school.logo_url === 'string' ? school.logo_url : ''}" data-logotype="${school.logo_type || 'emoji'}" data-desc="${school.description || ''}" class="btn-edit-school px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-bold transition">
                        ✏️ កែឈ្មោះ និងរូប
                    </button>
                    <button type="button" data-id="${school.id}" class="btn-delete-school px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg text-xs font-bold transition">
                        🗑️ លុប
                    </button>
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.btn-edit-school').forEach(btn => {
        btn.onclick = () => {
            document.getElementById('edit-school-id').value = btn.dataset.id;
            document.getElementById('edit-school-name').value = btn.dataset.name;
            document.getElementById('edit-school-desc').value = btn.dataset.desc || '';

            const logoUrl = btn.dataset.logo || '';
            const logoType = btn.dataset.logotype || 'emoji';

            const radio = document.querySelector(`input[name="edit_logo_type"][value="${logoType}"]`);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
            }

            if (logoType === 'upload' || logoType === 'url') {
                document.getElementById('edit-school-icon-url').value = logoUrl;
            } else {
                document.getElementById('edit-school-icon-emoji').value = logoUrl;
            }

            document.getElementById('edit-school-modal').classList.remove('hidden');
        };
    });

    document.querySelectorAll('.btn-delete-school').forEach(btn => {
        btn.onclick = async () => {
            if (confirm('តើអ្នកពិតជាចង់លុបសាលារៀននេះមែនទេ?')) {
                try {
                    const res = await API.request(`/schools/${btn.dataset.id}`, {
                        method: 'DELETE'
                    });
                    alert(res.message || 'លុបសាលារៀនបានជោគជ័យ!');
                    
                    const schools = await API.getSchools();
                    renderAdminSchoolsList(schools);
                    loadQCMSubjects();
                } catch (err) {
                    alert('មានបញ្ហាក្នុងការលុប: ' + err.message);
                }
            }
        };
    });
}

function renderAdminSubjectsList(subjects, getParentId) {
    const adminSubjectsList = document.getElementById('admin-subjects-list');
    if (!adminSubjectsList) return;
    
    let adminListHtml = '';
    const parentFolders = subjects.filter(s => getParentId(s) === null);

    parentFolders.forEach(folder => {
        const level1Children = subjects.filter(s => getParentId(s) === parseInt(folder.id));
        
        const schoolBadge = folder.school_id 
            ? `<span class="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md ml-2">សាលា ID: ${folder.school_id}</span>` 
            : `<span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md ml-2">គ្មានសាលា</span>`;
            
        const typeBadge = folder.type === 'video'
            ? `<span class="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md ml-2">វីដេអូ</span>`
            : `<span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md ml-2">QCM</span>`;

        adminListHtml += `
            <div class="mb-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                <div id="admin-folder-toggle-${folder.id}" class="flex items-center justify-between cursor-pointer select-none">
                    <div class="flex items-center gap-3">
                        <span id="admin-arrow-${folder.id}" class="text-sm font-bold text-slate-500 transition-transform">▼</span>
                        <div>
                            <p class="font-bold text-sm text-slate-900 dark:text-white flex items-center">📁 ${folder.name} (ID: ${folder.id}) ${schoolBadge} ${typeBadge}</p>
                            <span class="text-xs text-slate-500">Folder មេ (${level1Children.length} ថ្នាក់កូន)</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button type="button" data-id="${folder.id}" data-name="${folder.name}" data-parent="" class="btn-edit-subject px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-bold transition">✏️ កែឈ្មោះ</button>
                        <button type="button" data-id="${folder.id}" class="btn-delete-subject px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg text-xs font-bold transition">🗑️ លុប</button>
                    </div>
                </div>
                
                <div id="admin-folder-container-${folder.id}" class="hidden pt-3 mt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
        `;

        if (level1Children.length > 0) {
            level1Children.forEach(l1 => {
                const level2Children = subjects.filter(s => getParentId(s) === parseInt(l1.id));
                
                adminListHtml += `
                    <div class="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 ml-4">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span>📂</span>
                                <span class="font-semibold text-xs text-slate-800 dark:text-slate-200">${l1.name} (ID: ${l1.id})</span>
                            </div>
                            <div class="flex items-center gap-1">
                                <button type="button" data-id="${l1.id}" data-name="${l1.name}" data-parent="${folder.id}" class="btn-edit-subject px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded text-[11px] font-bold transition">✏️ កែ</button>
                                <button type="button" data-id="${l1.id}" class="btn-delete-subject px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded text-[11px] font-bold transition">🗑️ លុប</button>
                            </div>
                        </div>
                `;

                if (level2Children.length > 0) {
                    adminListHtml += `<div class="pl-6 mt-2 space-y-1.5 border-t border-slate-200 dark:border-slate-700 pt-2">`;
                    level2Children.forEach(l2 => {
                        adminListHtml += `
                            <div class="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                                <div class="flex items-center gap-2">
                                    <span class="text-xs">📄</span>
                                    <span class="text-xs text-slate-700 dark:text-slate-300 font-medium">${l2.name} (ID: ${l2.id}) - ${l2.question_count || 0} សំណួរ</span>
                                </div>
                                <div class="flex items-center gap-1">
                                    <button type="button" data-id="${l2.id}" data-name="${l2.name}" data-parent="${l1.id}" class="btn-edit-subject px-2 py-0.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded text-[10px] font-bold transition">✏️</button>
                                    <button type="button" data-id="${l2.id}" class="btn-delete-subject px-2 py-0.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded text-[10px] font-bold transition">🗑️</button>
                                </div>
                            </div>
                        `;
                    });
                    adminListHtml += `</div>`;
                }

                adminListHtml += `</div>`;
            });
        } else {
            adminListHtml += `<p class="text-xs text-slate-400 py-1 ml-4">គ្មាន Folder កូននៅខាងក្នុងទេ</p>`;
        }

        adminListHtml += `
                </div>
            </div>
        `;
    });

    adminSubjectsList.innerHTML = adminListHtml || `<p class="text-sm text-slate-400 text-center py-4">មិនទាន់មានទិន្នន័យទេ</p>`;

    parentFolders.forEach(folder => {
        const toggleBtn = document.getElementById(`admin-folder-toggle-${folder.id}`);
        const container = document.getElementById(`admin-folder-container-${folder.id}`);
        const arrow = document.getElementById(`admin-arrow-${folder.id}`);

        if (toggleBtn && container && arrow) {
            toggleBtn.onclick = () => {
                container.classList.toggle('hidden');
                arrow.classList.toggle('rotate-180');
            };
        }
    });

    document.querySelectorAll('.btn-delete-subject').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm('តើអ្នកពិតជាចង់លុបមុខវិជ្ជានេះចេញមែនទេ?')) {
                try {
                    const res = await API.deleteSubject(btn.dataset.id);
                    alert(res.message);
                    loadQCMSubjects();
                    loadLessons();
                } catch (err) { alert(err.message); }
            }
        };
    });

    document.querySelectorAll('.btn-edit-subject').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const oldName = btn.dataset.name;
            const oldParentId = btn.dataset.parent; 
            
            const newName = prompt('សូមបញ្ចូលឈ្មោះមុខវិជ្ជាថ្មី:', oldName);
            
            if (newName && newName.trim() !== "" && newName !== oldName) {
                try {
                    const res = await API.updateSubject(id, newName.trim(), oldParentId || null);
                    alert(res.message);
                    loadQCMSubjects();
                    loadLessons();
                } catch (err) {
                    alert('មានបញ្ហាក្នុងការកែឈ្មោះ: ' + err.message);
                }
            }
        };
    });
}

// ៧. ទាញយកសំណួរ QCM
async function startExam(subjectId) {
    try {
        const questions = await API.getQCMQuestions(subjectId);
        if (!questions || !questions.length) {
            return alert('មុខវិជ្ជានេះមិនទាន់មានសំណួរនៅឡើយទេ!');
        }

        activeExam = { subjectId, questions, answers: {}, currentIndex: 0 };
        skippedQuestions = []; 

        localStorage.setItem('exam_state', JSON.stringify({
            subjectId: subjectId,
            questions: questions,
            answers: {},
            currentIndex: 0,
            skippedQuestions: []
        }));

        document.getElementById('school-card-view').classList.add('hidden');
        document.getElementById('school-details-view').classList.add('hidden');
        document.getElementById('qcm-exam-view').classList.remove('hidden');
        document.getElementById('qcm-result-view').classList.add('hidden');
        
        renderQuestion();
    } catch (e) { alert(e.message); }
}

function renderQuestion() {
    const { questions, currentIndex, answers } = activeExam;
    const q = questions[currentIndex];
    
    document.getElementById('exam-question-text').innerText = `សំណួរទី ${currentIndex + 1}/${questions.length}: ${q.question_text}`;

    const container = document.getElementById('exam-options-container');
    container.innerHTML = q.options.map((opt, idx) => `
        <button type="button" data-id="${opt.id}" class="opt-btn w-full p-4 text-left rounded-xl border dark:border-slate-700 transition ${answers[q.id] === opt.id ? 'border-brand-600 bg-brand-50 dark:bg-indigo-950 font-bold text-brand-900 dark:text-indigo-200' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}">
            <span class="inline-block w-6 font-bold">${String.fromCharCode(65 + idx)}.</span> ${opt.option_text}
        </button>
    `).join('');

    document.querySelectorAll('.opt-btn').forEach(btn => {
        btn.onclick = () => {
            activeExam.answers[q.id] = parseInt(btn.dataset.id);
            
            const skippedIndex = skippedQuestions.indexOf(activeExam.currentIndex);
            if (skippedIndex > -1) {
                skippedQuestions.splice(skippedIndex, 1);
            }

            localStorage.setItem('exam_state', JSON.stringify({
                subjectId: activeExam.subjectId,
                questions: activeExam.questions,
                answers: activeExam.answers,
                currentIndex: activeExam.currentIndex,
                skippedQuestions: skippedQuestions
            }));

            renderQuestion(); 
        };
    });

    document.getElementById('btn-prev-q').disabled = currentIndex === 0;
    document.getElementById('btn-next-q').classList.toggle('hidden', currentIndex === questions.length - 1);
    document.getElementById('btn-submit-qcm').classList.toggle('hidden', currentIndex !== questions.length - 1);

    renderQuestionGrid();
}

function renderQuestionGrid() {
    const grid = document.getElementById('question-number-grid');
    if (!grid) return;

    grid.innerHTML = activeExam.questions.map((q, idx) => {
        const isAnswered = activeExam.answers[q.id] !== undefined;
        const isSkipped = skippedQuestions.includes(idx);
        const isActive = idx === activeExam.currentIndex;

        let btnClass = "";
        if (isAnswered || isActive) {
            btnClass = 'bg-brand-600 text-white shadow-md font-bold border border-brand-700';
        } else if (isSkipped) {
            btnClass = 'bg-red-500 text-white shadow-sm font-bold border border-red-600 hover:bg-red-600';
        } else {
            btnClass = 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-2 border-slate-300 dark:border-slate-600 font-semibold hover:bg-slate-50';
        }

        return `
            <button type="button" data-index="${idx}" class="question-nav-btn w-9 h-9 rounded-lg text-sm flex items-center justify-center transition-all ${btnClass}">
                ${idx + 1}
            </button>
        `;
    }).join('');

    document.querySelectorAll('.question-nav-btn').forEach(btn => {
        btn.onclick = () => {
            const targetIndex = parseInt(btn.dataset.index);
            const currentQ = activeExam.questions[activeExam.currentIndex];
            if (activeExam.answers[currentQ.id] === undefined) {
                if (!skippedQuestions.includes(activeExam.currentIndex)) {
                    skippedQuestions.push(activeExam.currentIndex);
                }
            }

            activeExam.currentIndex = targetIndex;
            localStorage.setItem('exam_state', JSON.stringify({
                subjectId: activeExam.subjectId,
                questions: activeExam.questions,
                answers: activeExam.answers,
                currentIndex: activeExam.currentIndex,
                skippedQuestions: skippedQuestions
            }));

            renderQuestion();
        };
    });
}

// ៨. Setup Event Listeners
function setupEvents() {
    const authModal = document.getElementById('auth-modal');
    const modalTitle = document.getElementById('auth-modal-title');
    const regNameGroup = document.getElementById('reg-name-group');
    const authPasswordInput = document.getElementById('auth-password');
    const forgotLinkContainer = document.getElementById('forgot-password-link-container');
    const authSubmitBtn = document.getElementById('btn-auth-submit');

    // 🟢 ប៊ូតុងបើក Login Modal
    const btnOpenLogin = document.getElementById('btn-open-login');
    if (btnOpenLogin) {
        btnOpenLogin.onclick = () => {
            authMode = 'login';
            modalTitle.innerText = 'ចូលប្រព័ន្ធ';
            regNameGroup.classList.add('hidden');
            authPasswordInput.placeholder = 'ពាក្យសម្ងាត់';
            if (forgotLinkContainer) forgotLinkContainer.classList.remove('hidden');
            if (authSubmitBtn) authSubmitBtn.innerText = 'ចូលប្រព័ន្ធ';
            authModal.classList.remove('hidden');
        };
    }

    // 🟢 ប៊ូតុងបិទ Modal (✕) ទូទៅ និងការចុចលើផ្ទៃក្រៅ (Backdrop)
    const modalCloseButtons = document.querySelectorAll('[id^="btn-close-"], .btn-close-modal');
    modalCloseButtons.forEach(btn => {
        btn.onclick = (e) => {
            const modal = btn.closest('.fixed');
            if (modal) {
                modal.classList.add('hidden');
            }
        };
    });

    document.querySelectorAll('.fixed').forEach(modal => {
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        };
    });

    // 🟢 គ្រប់គ្រងការប្តូររវាង Emoji, Upload និង URL ពេលបន្ថែមសាលារៀនថ្មី
    const schoolLogoRadios = document.querySelectorAll('input[name="logo_type"]');
    schoolLogoRadios.forEach(radio => {
        radio.onchange = (e) => {
            const val = e.target.value;
            const emojiDiv = document.getElementById('logo-input-emoji');
            const uploadDiv = document.getElementById('logo-input-upload');
            const urlDiv = document.getElementById('logo-input-url');

            if (emojiDiv) emojiDiv.classList.add('hidden');
            if (uploadDiv) uploadDiv.classList.add('hidden');
            if (urlDiv) urlDiv.classList.add('hidden');

            if (val === 'emoji' && emojiDiv) emojiDiv.classList.remove('hidden');
            if (val === 'upload' && uploadDiv) uploadDiv.classList.remove('hidden');
            if (val === 'url' && urlDiv) urlDiv.classList.remove('hidden');
        };
    });

    // 🟢 គ្រប់គ្រងការ Submit Form បន្ថែមសាលារៀនថ្មី
    const formAddSchool = document.getElementById('form-add-school');
    if (formAddSchool) {
        formAddSchool.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('school-name').value.trim();
            const description = document.getElementById('school-desc').value.trim();
            
            const logoTypeEl = document.querySelector('input[name="logo_type"]:checked');
            const logoType = logoTypeEl ? logoTypeEl.value : 'emoji';
            
            let logoUrl = '';
            if (logoType === 'emoji') {
                logoUrl = document.getElementById('school-icon-emoji').value.trim() || '🏫';
            } else if (logoType === 'url') {
                logoUrl = document.getElementById('school-icon-url').value.trim();
            } else if (logoType === 'upload') {
                const fileInput = document.getElementById('school-icon-file');
                if (fileInput && fileInput.files[0]) {
                    logoUrl = await toBase64(fileInput.files[0]);
                }
            }

            if (!name) {
                return alert('សូមបញ្ចូលឈ្មោះសាលារៀន!');
            }

            try {
                const res = await API.request('/schools', {
                    method: 'POST',
                    body: JSON.stringify({ name, description, logo_type: logoType, logo_url: logoUrl })
                });

                alert(res.message || 'បង្កើតសាលារៀនថ្មីបានជោគជ័យ!');
                formAddSchool.reset();
                loadQCMSubjects();
            } catch (err) {
                alert('មានបញ្ហា: ' + err.message);
            }
        };
    }

    // Form Submit Login
    const formAuth = document.getElementById('form-auth');
    if (formAuth) {
        formAuth.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;

            try {
                const res = await API.login(email, password);
                localStorage.setItem('token', res.token);
                localStorage.setItem('medi_user', JSON.stringify(res.user));
                renderUserSession();
                loadLessons();
                authModal.classList.add('hidden');
            } catch (err) { alert(err.message); }
        };
    }

    // Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.onclick = () => {
            localStorage.removeItem('token');
            localStorage.removeItem('medi_user');
            localStorage.removeItem('exam_state'); 
            renderUserSession();
            loadLessons();
        };
    }

    // Admin Quick Add Student with Expire Date
    const formAdminAddStudent = document.getElementById('form-admin-add-student');
    if (formAdminAddStudent) {
        formAdminAddStudent.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('admin-student-name').value.trim();
            const email = document.getElementById('admin-student-email').value.trim();
            const password = document.getElementById('admin-student-password').value.trim();
            const expireDate = document.getElementById('admin-student-expire').value;

            if (!name || !email || !password || !expireDate) {
                return alert('សូមបំពេញព័ត៌មានឱ្យបានគ្រប់គ្រាន់!');
            }

            try {
                await API.request('/admin/students', {
                    method: 'POST',
                    body: JSON.stringify({ name, email, password, expire_date: expireDate, role: 'student' })
                });

                alert('បង្កើតគណនីសិស្ស និងកំណត់ថ្ងៃផុតកំណត់បានជោគជ័យ!');
                formAdminAddStudent.reset();
            } catch (err) {
                alert('មានបញ្ហា: ' + err.message);
            }
        };
    }

    // Exam Nav Buttons
    const btnPrevQ = document.getElementById('btn-prev-q');
    if (btnPrevQ) {
        btnPrevQ.onclick = () => {
            if (activeExam.currentIndex > 0) { 
                activeExam.currentIndex--; 
                localStorage.setItem('exam_state', JSON.stringify({...activeExam, skippedQuestions}));
                renderQuestion(); 
            }
        };
    }

    const btnNextQ = document.getElementById('btn-next-q');
    if (btnNextQ) {
        btnNextQ.onclick = () => {
            const currentQ = activeExam.questions[activeExam.currentIndex];
            const isAnswered = activeExam.answers[currentQ.id] !== undefined;

            if (!isAnswered) {
                if (!skippedQuestions.includes(activeExam.currentIndex)) {
                    skippedQuestions.push(activeExam.currentIndex);
                }
            }

            if (activeExam.currentIndex < activeExam.questions.length - 1) { 
                activeExam.currentIndex++; 
                localStorage.setItem('exam_state', JSON.stringify({...activeExam, skippedQuestions}));
                renderQuestion(); 
            }
        };
    }

    const btnExitExam = document.getElementById('btn-exit-exam');
    if (btnExitExam) {
        btnExitExam.onclick = () => {
            localStorage.removeItem('exam_state'); 
            document.getElementById('qcm-exam-view').classList.add('hidden');
            document.getElementById('school-details-view').classList.remove('hidden');
        };
    }

    const btnSubmitQcm = document.getElementById('btn-submit-qcm');
    if (btnSubmitQcm) {
        btnSubmitQcm.onclick = () => {
            const unansweredCount = activeExam.questions.filter(q => activeExam.answers[q.id] === undefined).length;

            if (unansweredCount > 0) {
                return alert(`អ្នកមិនទាន់ឆ្លើយសំណួរចំនួន ${unansweredCount} នៅឡើយទេ! សូមឆ្លើយឱ្យគ្រប់មុននឹងបញ្ចប់។`);
            }

            let score = 0;
            const { questions, answers } = activeExam;

            questions.forEach(q => {
                const correctOpt = q.options.find(o => o.is_correct === 1 || o.is_correct === true);
                if (correctOpt && answers[q.id] === correctOpt.id) {
                    score++;
                }
            });
            
            localStorage.removeItem('exam_state'); 

            document.getElementById('qcm-exam-view').classList.add('hidden');
            document.getElementById('qcm-result-view').classList.remove('hidden');
            document.getElementById('result-score-text').innerText = `${score} / ${questions.length}`;

            const reviewContainer = document.getElementById('exam-review-container');
            if (reviewContainer) {
                reviewContainer.innerHTML = questions.map((q, idx) => {
                    const studentAnsId = answers[q.id];
                    const correctOpt = q.options.find(o => o.is_correct === 1 || o.is_correct === true);
                    const isCorrect = studentAnsId === correctOpt.id;

                    return `
                        <div class="p-4 rounded-2xl border ${isCorrect ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'} space-y-2">
                            <div class="flex items-start justify-between gap-2">
                                <p class="font-bold text-sm text-slate-900">សំណួរទី ${idx + 1}: ${q.question_text}</p>
                                <span class="px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">
                                    ${isCorrect ? '✓ ត្រឹមត្រូវ' : '✕ មិនត្រឹមត្រូវ'}
                                </span>
                            </div>
                            
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                                <div class="p-2 rounded-xl bg-white border ${isCorrect ? 'border-emerald-200 text-emerald-900 font-semibold' : 'border-red-200 text-red-900'}">
                                    <b>ចម្លើយរបស់អ្នក:</b> ${q.options.find(o => o.id === studentAnsId)?.option_text || 'មិនបានឆ្លើយ'}
                                </div>
                                <div class="p-2 rounded-xl bg-white border border-emerald-200 text-emerald-900 font-semibold">
                                    <b>ចម្លើយត្រឹមត្រូវ:</b> ${correctOpt ? correctOpt.option_text : ''}
                                </div>
                            </div>

                            ${q.explanation ? `
                                <div class="text-xs text-slate-600 bg-white/80 p-2.5 rounded-xl border border-slate-200 mt-2">
                                    <b>💡ការពន្យល់:</b> ${q.explanation}
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('');
            }
        };
    }

    const btnRetakeExam = document.getElementById('btn-retake-exam');
    if (btnRetakeExam) {
        btnRetakeExam.onclick = () => {
            document.getElementById('qcm-result-view').classList.add('hidden');
            document.getElementById('school-details-view').classList.remove('hidden');
        };
    }
}

// 🟢 មុខងារគ្រប់គ្រង Dark Mode
function setupDarkMode() {
    const themeToggleBtn = document.getElementById('btn-theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
        if (themeIcon) themeIcon.innerText = '☀️';
    }

    if (themeToggleBtn) {
        themeToggleBtn.onclick = () => {
            document.documentElement.classList.toggle('dark');
            
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            
            if (themeIcon) {
                themeIcon.innerText = isDark ? '☀️' : '🌙';
            }
        };
    }
}