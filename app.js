// Telegram WebApp initialization
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();
if (tg.disableVerticalSwaps) {
    tg.disableVerticalSwaps();
}

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
let lastRenderedKey = null;

const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const dayShortNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const monthNamesFull = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

async function loadSchedule() {
    try {
        const response = await fetch('schedule_data.json');
        scheduleData = await response.json();
        semesterStart = new Date(scheduleData.meta.start_date);
        semesterStart.setHours(0, 0, 0, 0);
        initApp();
    } catch (e) {
        console.error('Failed to load schedule:', e);
        showError('Не удалось загрузить расписание');
    }
}

function getWeekInfo(offset) {
    const startDate = new Date(scheduleData.meta.start_date);
    const now = new Date();
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
    const sm = monthNamesFull[start.getMonth()];
    const em = monthNamesFull[end.getMonth()];
    return sm === em ? sm : sm + ' — ' + em;
}

function formatDate(date) {
    return date.getDate() + ' ' + monthNames[date.getMonth()];
}

function isDateBeforeSemester(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d < semesterStart;
}

function initApp() {
    const weekInfo = getWeekInfo(currentWeekOffset);
    currentWeekNumber = weekInfo.weekNumber;
    currentWeekParity = weekInfo.parity;
    updateWeekDisplay(weekInfo);
    updateDaysStrip(weekInfo);
    renderSchedule();
    setupEventListeners();
}

function updateWeekDisplay(weekInfo) {
    document.getElementById('weekMonth').textContent = weekInfo.monthText;
    document.getElementById('weekType').textContent = weekInfo.parityText;
    document.getElementById('weekRange').textContent =
        formatDate(weekInfo.start) + ' — ' + formatDate(weekInfo.end) + ' · ' + weekInfo.weekNumber + '-я неделя';
}

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

function selectDay(index) {
    if (index === currentDayIndex) return;
    currentDayIndex = index;
    document.querySelectorAll('.day').forEach((el, i) => {
        el.classList.toggle('active', i === index);
    });
    renderSchedule();
}

// Parse weeks string into { startWeek, endWeek, allWeeks[] }
function parseWeeks(lesson) {
    const allWeeks = [];
    let startWeek = 16;
    let endWeek = 1;

    if (!lesson.weeks) {
        for (let w = 1; w <= 16; w++) {
            if (lesson.week === 'all' ||
                (lesson.week === 'odd' && w % 2 === 1) ||
                (lesson.week === 'even' && w % 2 === 0)) {
                allWeeks.push(w);
            }
        }
        return { startWeek: allWeeks[0] || 1, endWeek: allWeeks[allWeeks.length - 1] || 16, allWeeks };
    }

    const ranges = lesson.weeks.split(',').map(r => r.trim());
    for (const range of ranges) {
        if (range.includes('-')) {
            const parts = range.split('-').map(Number);
            for (let w = parts[0]; w <= parts[1]; w++) {
                if (lesson.week === 'all' ||
                    (lesson.week === 'odd' && w % 2 === 1) ||
                    (lesson.week === 'even' && w % 2 === 0)) {
                    allWeeks.push(w);
                }
            }
        } else {
            const w = Number(range);
            if (lesson.week === 'all' ||
                (lesson.week === 'odd' && w % 2 === 1) ||
                (lesson.week === 'even' && w % 2 === 0)) {
                allWeeks.push(w);
            }
        }
    }

    allWeeks.sort((a, b) => a - b);
    return {
        startWeek: allWeeks[0] || 1,
        endWeek: allWeeks[allWeeks.length - 1] || 16,
        allWeeks
    };
}

// Get lesson status for current week
function getLessonStatus(lesson, currentWeekNum) {
    const { startWeek, endWeek, allWeeks } = parseWeeks(lesson);

    if (allWeeks.includes(currentWeekNum)) {
        return { status: 'active', startWeek, endWeek };
    }

    if (currentWeekNum < startWeek) {
        return { status: 'future', startWeek, endWeek };
    }

    if (currentWeekNum > endWeek) {
        return { status: 'past', startWeek, endWeek };
    }

    // Between start and end but not in list (gap week)
    const futureWeeks = allWeeks.filter(w => w > currentWeekNum);
    if (futureWeeks.length > 0) {
        return { status: 'future', startWeek: futureWeeks[0], endWeek };
    }

    return { status: 'past', startWeek, endWeek };
}

// Group lessons by time slot and pick the best one to display
function getDisplayLessons(dayLessons, currentWeekNum) {
    const byTime = {};

    for (const lesson of dayLessons) {
        const statusInfo = getLessonStatus(lesson, currentWeekNum);
        if (statusInfo.status === 'past') continue;

        const time = lesson.time;
        if (!byTime[time]) byTime[time] = [];
        byTime[time].push({ lesson, status: statusInfo.status, startWeek: statusInfo.startWeek, endWeek: statusInfo.endWeek });
    }

    const result = [];
    for (const time in byTime) {
        const items = byTime[time];
        // Sort: active first, then by startWeek ascending
        items.sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;
            return a.startWeek - b.startWeek;
        });

        // Take the first one (active if exists, otherwise earliest future)
        const best = items[0];
        result.push(best);
    }

    // Sort by time
    const timeOrder = Object.keys(byTime);
    result.sort((a, b) => timeOrder.indexOf(a.lesson.time) - timeOrder.indexOf(b.lesson.time));

    return result;
}

function getLessonTypeClass(subject) {
    const lower = subject.toLowerCase();
    if (lower.includes('(л)')) return 'lecture';
    if (lower.includes('(пз)')) return 'practice';
    if (lower.includes('(лз)')) return 'lab';
    if (lower.includes('физическая культура')) return 'sport';
    if (lower.includes('проектное обучение')) return 'project';
    return 'lecture';
}

function renderSchedule() {
    const container = document.getElementById('scheduleContent');
    const group = scheduleData.groups[currentGroup];

    if (!group) {
        container.innerHTML = emptyStateHTML('Группа не найдена');
        return;
    }

    const weekInfo = getWeekInfo(currentWeekOffset);
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

    const displayItems = getDisplayLessons(lessons, currentWeekNumber);

    if (displayItems.length === 0) {
        container.innerHTML = emptyStateHTML(
            'Нет пар в этот день',
            'На этой неделе занятий нет, но они будут позже в семестре.'
        );
        return;
    }

    const renderKey = currentDayIndex + '-' + currentWeekOffset;
    const shouldAnimate = renderKey !== lastRenderedKey;
    lastRenderedKey = renderKey;

    container.innerHTML = displayItems.map((item, index) => {
        const lesson = item.lesson;
        const isFuture = item.status === 'future';
        const typeClass = getLessonTypeClass(lesson.subject);
        const futureClass = isFuture ? 'future' : '';
        const animateClass = shouldAnimate ? 'animate' : '';
        const isFullDay = lesson.full_day;

        // Badge logic
        let badge = '';
        if (isFuture) {
            badge = '<span class="future-badge">С ' + item.startWeek + ' недели</span>';
        } else if (item.endWeek < 16) {
            badge = '<span class="end-badge">до ' + item.endWeek + ' недели</span>';
        }

        if (isFullDay) {
            return '<div class="lesson-card ' + typeClass + ' full-day ' + futureClass + ' ' + animateClass + '" style="animation-delay: ' + (index * 0.05) + 's">' +
                badge +
                '<div class="lesson-time">' + lesson.time + '</div>' +
                '<div class="lesson-title">' + lesson.subject + '</div>' +
                '<div class="lesson-meta">' +
                '<div class="lesson-teacher">' + (lesson.teacher !== '—' ? lesson.teacher : 'Весь день занят') + '</div>' +
                '</div></div>';
        }

        return '<div class="lesson-card ' + typeClass + ' ' + futureClass + ' ' + animateClass + '" style="animation-delay: ' + (index * 0.05) + 's">' +
            badge +
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

function vacationStateHTML(daysUntil) {
    const dayWord = daysUntil === 1 ? 'день' : (daysUntil < 5 ? 'дня' : 'дней');
    return '<div class="vacation-state">' +
        '<div class="vacation-icon">🏖️</div>' +
        '<div class="vacation-title">Каникулы!</div>' +
        '<div class="vacation-text">Семестр ещё не начался.<br>Отдыхай и набирайся сил!</div>' +
        '<div class="vacation-countdown">До начала семестра: ' + daysUntil + ' ' + dayWord + '</div>' +
        '</div>';
}

function setupEventListeners() {
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
        sport: 'Спортивные занятия'
    };
    container.innerHTML = emptyStateHTML(titles[page] || 'Раздел в разработке', 'Этот раздел скоро появится!');
}

function showError(message) {
    document.getElementById('scheduleContent').innerHTML = emptyStateHTML('Ошибка', message);
}

loadSchedule();
