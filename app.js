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
let currentGroup = 'БИ 2-3';
let currentWeekOffset = 0;
let currentDayIndex = 0;
let scheduleData = null;
let currentWeekNumber = 1;
let currentWeekParity = 'odd';
let semesterStart = null;

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
        semesterStart = new Date(scheduleData.meta.start_date);
        // Set to start of day
        semesterStart.setHours(0, 0, 0, 0);
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
    weekStart.setDate(startDate.getDate() + (currentStudyWeek - 1) * 7);

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
        monthText: getMonthRangeText(weekStart, weekEnd),
        isVacation: weekEnd < semesterStart,
        isPartialVacation: weekStart < semesterStart && weekEnd >= semesterStart
    };
}

function getMonthRangeText(start, end) {
    const startMonth = monthNamesFull[start.getMonth()];
    const endMonth = monthNamesFull[end.getMonth()];
    if (startMonth === endMonth) {
        return startMonth;
    }
    return startMonth + ' — ' + endMonth;
}

function formatDate(date) {
    return date.getDate() + ' ' + monthNames[date.getMonth()];
}

function isDateBeforeSemester(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d < semesterStart;
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
        formatDate(weekInfo.start) + ' — ' + formatDate(weekInfo.end) + ' · ' + weekInfo.weekNumber + '-я неделя';
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
        dayDiv.className = 'day ' + (i === currentDayIndex ? 'active' : '');
        dayDiv.dataset.day = i;
        dayDiv.innerHTML =
            '<span class="day-name">' + dayShortNames[i] + '</span>' +
            '<span class="day-num">' + date.getDate() + '</span>';
        dayDiv.addEventListener('click', () => selectDay(i));
        strip.appendChild(dayDiv);
    }
}

// Select day
function selectDay(index) {
    if (index === currentDayIndex) return; // Don't re-render if same day
    currentDayIndex = index;
    document.querySelectorAll('.day').forEach((el, i) => {
        el.classList.toggle('active', i === index);
    });
    renderSchedule();
}

// Parse week ranges into array of week numbers
function getLessonWeeks(lesson) {
    const weeks = [];
    if (!lesson.weeks) {
        // If no weeks specified, assume all weeks 1-16
        for (let w = 1; w <= 16; w++) {
            if (lesson.week === 'all' ||
                (lesson.week === 'odd' && w % 2 === 1) ||
                (lesson.week === 'even' && w % 2 === 0)) {
                weeks.push(w);
            }
        }
        return weeks;
    }

    const ranges = lesson.weeks.split(',').map(r => r.trim());
    for (const range of ranges) {
        if (range.includes('-')) {
            const parts = range.split('-').map(Number);
            for (let w = parts[0]; w <= parts[1]; w++) {
                if (lesson.week === 'all' ||
                    (lesson.week === 'odd' && w % 2 === 1) ||
                    (lesson.week === 'even' && w % 2 === 0)) {
                    weeks.push(w);
                }
            }
        } else {
            const w = Number(range);
            if (lesson.week === 'all' ||
                (lesson.week === 'odd' && w % 2 === 1) ||
                (lesson.week === 'even' && w % 2 === 0)) {
                weeks.push(w);
            }
        }
    }
    return [...new Set(weeks)].sort((a, b) => a - b);
}

// Get lesson status for current week
function getLessonStatus(lesson, weekNum) {
    const lessonWeeks = getLessonWeeks(lesson);

    if (lessonWeeks.includes(weekNum)) {
        return { status: 'active', startWeek: null };
    }

    const futureWeeks = lessonWeeks.filter(w => w > weekNum);
    if (futureWeeks.length > 0) {
        return { status: 'future', startWeek: futureWeeks[0] };
    }

    return { status: 'past', startWeek: null };
}

// Check if lesson is for current week (legacy, used for active filter)
function isLessonForWeek(lesson, weekNum, parity) {
    if (lesson.week === 'all') {
        if (!lesson.weeks) return true;
        const ranges = lesson.weeks.split(',').map(r => r.trim());
        for (const range of ranges) {
            if (range.includes('-')) {
                const parts = range.split('-').map(Number);
                if (weekNum >= parts[0] && weekNum <= parts[1]) return true;
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
            const parts = range.split('-').map(Number);
            if (weekNum >= parts[0] && weekNum <= parts[1]) return true;
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

    const weekInfo = getWeekInfo(currentWeekOffset);

    // Check if selected day is before semester start
    const start = weekInfo.start;
    const selectedDate = new Date(start);
    selectedDate.setDate(start.getDate() + currentDayIndex);

    if (isDateBeforeSemester(selectedDate)) {
        const daysUntil = Math.ceil((semesterStart - selectedDate) / (1000 * 60 * 60 * 24));
        container.innerHTML = vacationStateHTML(daysUntil);
        return;
    }

    const dayKey = dayNames[currentDayIndex];
    const lessons = group.schedule[dayKey] || [];

    if (lessons.length === 0) {
        container.innerHTML = emptyStateHTML(
            'Нет пар в этот день',
            'В этот день занятий нет. Отдохни или займись самоподготовкой!'
        );
        return;
    }

    // Sort and categorize lessons
    const lessonItems = [];
    for (const lesson of lessons) {
        const statusInfo = getLessonStatus(lesson, currentWeekNumber);
        if (statusInfo.status === 'past') continue; // Skip past lessons
        lessonItems.push({ lesson, status: statusInfo.status, startWeek: statusInfo.startWeek });
    }

    // Sort: active first, then future
    lessonItems.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return 0;
    });

    if (lessonItems.length === 0) {
        container.innerHTML = emptyStateHTML(
            'Нет пар в этот день',
            'На этой неделе занятий нет, но они будут позже в семестре.'
        );
        return;
    }

    container.innerHTML = lessonItems.map((item, index) => {
        const lesson = item.lesson;
        const isFuture = item.status === 'future';
        const typeClass = getLessonTypeClass(lesson.subject);
        const weekBadge = lesson.week === 'all' ? '' :
            '<span class="lesson-week-badge ' + lesson.week + '">' +
            (lesson.week === 'odd' ? 'Нечёт' : 'Чёт') + '</span>';

        const futureBadge = isFuture ?
            '<span class="future-badge">С ' + item.startWeek + ' недели</span>' : '';

        const isFullDay = lesson.full_day;
        const futureClass = isFuture ? 'future' : '';
        const animateClass = 'animate';

        if (isFullDay) {
            return '<div class="lesson-card ' + typeClass + ' full-day ' + futureClass + ' ' + animateClass + '" style="animation-delay: ' + (index * 0.05) + 's">' +
                futureBadge + weekBadge +
                '<div class="lesson-time">' + lesson.time + '</div>' +
                '<div class="lesson-title">' + lesson.subject + '</div>' +
                '<div class="lesson-meta">' +
                '<div class="lesson-teacher">' + (lesson.teacher !== '—' ? lesson.teacher : 'Весь день занят') + '</div>' +
                '</div></div>';
        }

        return '<div class="lesson-card ' + typeClass + ' ' + futureClass + ' ' + animateClass + '" style="animation-delay: ' + (index * 0.05) + 's">' +
            futureBadge + weekBadge +
            '<div class="lesson-time">' + lesson.time + '</div>' +
            '<div class="lesson-title">' + lesson.subject + '</div>' +
            '<div class="lesson-meta">' +
            (lesson.teacher !== '—' ? '<div class="lesson-teacher">' + lesson.teacher + '</div>' : '') +
            (lesson.room !== '—' ? '<div class="lesson-room">' + lesson.room + '</div>' : '') +
            '</div></div>';
    }).join('');
}

function emptyStateHTML(title, text) {
    return '<div class="empty-state">' +
        '<div class="empty-icon">⏳</div>' +
        '<div class="empty-title">' + title + '</div>' +
        (text ? '<div class="empty-text">' + text + '</div>' : '') +
        '</div>';
}

function pluralizeDays(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'дней';
    if (mod10 === 1) return 'день';
    if (mod10 >= 2 && mod10 <= 4) return 'дня';
    return 'дней';
}

function vacationStateHTML(daysUntil) {
    const dayWord = pluralizeDays(daysUntil);
    return '<div class="vacation-state">' +
        '<div class="vacation-icon">🏖️</div>' +
        '<div class="vacation-title">Каникулы!</div>' +
        '<div class="vacation-text">Семестр ещё не начался.<br>Отдыхай и набирайся сил!</div>' +
        '<div class="vacation-countdown">До начала семестра: ' + daysUntil + ' ' + dayWord + '</div>' +
        '</div>';
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
        other: 'Другие разделы'
    };
    container.innerHTML = emptyStateHTML(titles[page] || 'Раздел в разработке', 'Этот раздел скоро появится!');
}

function showError(message) {
    document.getElementById('scheduleContent').innerHTML = emptyStateHTML('Ошибка', message);
}

// Start app
loadSchedule();
