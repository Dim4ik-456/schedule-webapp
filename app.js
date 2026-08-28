// Telegram WebApp initialization
const tg = window.Telegram.WebApp;

// Initialize Telegram Mini App
tg.ready();
tg.expand();
if (tg.disableVerticalSwipes) {
    tg.disableVerticalSwipes();
}

// Theme colors
tg.setHeaderColor('#0f1419');
tg.setBackgroundColor('#0f1419');

// App State
let currentGroup = 'БИ 1-3';
let currentWeekOffset = 0; // offset from current week
let currentDayIndex = 0; // 0 = Monday
let scheduleData = null;
let currentWeekNumber = 1;
let currentWeekParity = 'odd';

// Day names mapping
const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const dayShortNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const dayFullNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const monthNamesFull = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// Load schedule data
async function loadSchedule() {
    try {
        const response = await fetch('schedule_data.json');
        scheduleData = await response.json();
        initApp();
    } catch (e) {
        console.error('Failed to load schedule:', e);
        showError('Не удалось загрузить расписание');
    }
}

// Calculate week info based on start date
function getWeekInfo(offset = 0) {
    const startDate = new Date(scheduleData.meta.start_date);
    const now = new Date();

    // Calculate current week from start date
    const diffTime = now - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const currentStudyWeek = Math.max(1, Math.min(16, Math.floor(diffDays / 7) + 1 + offset));

    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + (currentStudyWeek - 1) * 7 + offset * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const isOdd = scheduleData.meta.odd_weeks.includes(currentStudyWeek);

    return {
        weekNumber: currentStudyWeek,
        isOdd: isOdd,
        parity: isOdd ? 'odd' : 'even',
        parityText: isOdd ? 'Нечётная' : 'Чётная',
        start: weekStart,
        end: weekEnd,
        monthText: getMonthRangeText(weekStart, weekEnd)
    };
}

function getMonthRangeText(start, end) {
    const startMonth = monthNamesFull[start.getMonth()];
    const endMonth = monthNamesFull[end.getMonth()];
    if (startMonth === endMonth) {
        return startMonth;
    }
    return `${startMonth} — ${endMonth}`;
}

function formatDate(date) {
    return `${date.getDate()} ${monthNames[date.getMonth()]}`;
}

// Initialize app
function initApp() {
    const weekInfo = getWeekInfo(currentWeekOffset);
    currentWeekNumber = weekInfo.weekNumber;
    currentWeekParity = weekInfo.parity;

    updateWeekDisplay(weekInfo);
    updateDaysStrip(weekInfo);
    renderSchedule();
    setupEventListeners();
}

// Update week display
function updateWeekDisplay(weekInfo) {
    document.getElementById('weekMonth').textContent = weekInfo.monthText;
    document.getElementById('weekType').textContent = weekInfo.parityText;
    document.getElementById('weekRange').textContent = 
        `${formatDate(weekInfo.start)} — ${formatDate(weekInfo.end)} · ${weekInfo.weekNumber}-я неделя`;
}

// Update days strip with dates
function updateDaysStrip(weekInfo) {
    const strip = document.getElementById('daysStrip');
    const start = weekInfo.start;

    strip.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);

        const dayDiv = document.createElement('div');
        dayDiv.className = `day ${i === currentDayIndex ? 'active' : ''}`;
        dayDiv.dataset.day = i;
        dayDiv.innerHTML = `
            <span class="day-name">${dayShortNames[i]}</span>
            <span class="day-num">${date.getDate()}</span>
        `;
        dayDiv.addEventListener('click', () => selectDay(i));
        strip.appendChild(dayDiv);
    }
}

// Select day
function selectDay(index) {
    currentDayIndex = index;
    document.querySelectorAll('.day').forEach((el, i) => {
        el.classList.toggle('active', i === index);
    });
    renderSchedule();
}

// Check if lesson is for current week
function isLessonForWeek(lesson, weekNum, parity) {
    if (lesson.week === 'all') {
        if (!lesson.weeks) return true;
        // Parse week ranges
        const ranges = lesson.weeks.split(',').map(r => r.trim());
        for (const range of ranges) {
            if (range.includes('-')) {
                const [start, end] = range.split('-').map(Number);
                if (weekNum >= start && weekNum <= end) return true;
            } else {
                if (Number(range) === weekNum) return true;
            }
        }
        return false;
    }

    if (lesson.week !== parity) return false;

    if (!lesson.weeks) return true;
    const ranges = lesson.weeks.split(',').map(r => r.trim());
    for (const range of ranges) {
        if (range.includes('-')) {
            const [start, end] = range.split('-').map(Number);
            if (weekNum >= start && weekNum <= end) return true;
        } else {
            if (Number(range) === weekNum) return true;
        }
    }
    return false;
}

// Get lesson type class
function getLessonTypeClass(subject) {
    const lower = subject.toLowerCase();
    if (lower.includes('(л)')) return 'lecture';
    if (lower.includes('(пз)')) return 'practice';
    if (lower.includes('(лз)')) return 'lab';
    if (lower.includes('физическая культура')) return 'sport';
    if (lower.includes('проектное обучение')) return 'project';
    return 'lecture';
}

// Get lesson type badge text
function getLessonTypeBadge(subject) {
    const lower = subject.toLowerCase();
    if (lower.includes('(л)')) return 'Лекция';
    if (lower.includes('(пз)')) return 'Практика';
    if (lower.includes('(лз)')) return 'Лабораторная';
    if (lower.includes('физическая культура')) return 'Спорт';
    if (lower.includes('проектное обучение')) return 'Проект';
    return '';
}

// Render schedule for selected day
function renderSchedule() {
    const container = document.getElementById('scheduleContent');
    const group = scheduleData.groups[currentGroup];

    if (!group) {
        container.innerHTML = emptyStateHTML('Группа не найдена');
        return;
    }

    const dayKey = dayNames[currentDayIndex];
    const lessons = group.schedule[dayKey] || [];

    // Filter lessons for current week
    const filteredLessons = lessons.filter(l => isLessonForWeek(l, currentWeekNumber, currentWeekParity));

    if (filteredLessons.length === 0) {
        container.innerHTML = emptyStateHTML(
            'Нет пар в этот день',
            'В этот день занятий нет. Отдохни или займись самоподготовкой!'
        );
        return;
    }

    container.innerHTML = filteredLessons.map((lesson, index) => {
        const typeClass = getLessonTypeClass(lesson.subject);
        const typeBadge = getLessonTypeBadge(lesson.subject);
        const weekBadge = lesson.week === 'all' ? '' : 
            `<span class="lesson-week-badge ${lesson.week}">${lesson.week === 'odd' ? 'Нечёт' : 'Чёт'}</span>`;

        const isFullDay = lesson.full_day;

        if (isFullDay) {
            return `
                <div class="lesson-card ${typeClass} full-day" style="animation-delay: ${index * 0.05}s">
                    ${weekBadge}
                    <div class="lesson-time">${lesson.time}</div>
                    <div class="lesson-title">${lesson.subject}</div>
                    <div class="lesson-meta">
                        <div class="lesson-teacher">${lesson.teacher !== '—' ? lesson.teacher : 'Весь день занят'}</div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="lesson-card ${typeClass}" style="animation-delay: ${index * 0.05}s">
                ${weekBadge}
                <div class="lesson-time">${lesson.time}</div>
                <div class="lesson-title">${lesson.subject}</div>
                <div class="lesson-meta">
                    ${lesson.teacher !== '—' ? `<div class="lesson-teacher">${lesson.teacher}</div>` : ''}
                    ${lesson.room !== '—' ? `<div class="lesson-room">${lesson.room}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function emptyStateHTML(title, text = '') {
    return `
        <div class="empty-state">
            <div class="empty-icon">⏳</div>
            <div class="empty-title">${title}</div>
            ${text ? `<div class="empty-text">${text}</div>` : ''}
        </div>
    `;
}

// Setup event listeners
function setupEventListeners() {
    // Week navigation
    document.getElementById('prevWeek').addEventListener('click', () => {
        currentWeekOffset--;
        const weekInfo = getWeekInfo(currentWeekOffset);
        currentWeekNumber = weekInfo.weekNumber;
        currentWeekParity = weekInfo.parity;
        updateWeekDisplay(weekInfo);
        updateDaysStrip(weekInfo);
        renderSchedule();
    });

    document.getElementById('nextWeek').addEventListener('click', () => {
        currentWeekOffset++;
        const weekInfo = getWeekInfo(currentWeekOffset);
        currentWeekNumber = weekInfo.weekNumber;
        currentWeekParity = weekInfo.parity;
        updateWeekDisplay(weekInfo);
        updateDaysStrip(weekInfo);
        renderSchedule();
    });

    // Group tabs
    document.querySelectorAll('.tab[data-group]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab[data-group]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentGroup = tab.dataset.group;
            renderSchedule();
        });
    });

    // Bottom navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            const page = item.dataset.page;
            if (page === 'schedule') {
                renderSchedule();
            } else {
                showPagePlaceholder(page);
            }
        });
    });
}

function showPagePlaceholder(page) {
    const container = document.getElementById('scheduleContent');
    const titles = {
        sport: 'Спортивные занятия',
        other: 'Другие разделы',
        profile: 'Профиль'
    };
    container.innerHTML = emptyStateHTML(titles[page] || 'Раздел в разработке', 'Этот раздел скоро появится!');
}

function showError(message) {
    document.getElementById('scheduleContent').innerHTML = emptyStateHTML('Ошибка', message);
}

// Start app
loadSchedule();
