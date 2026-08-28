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
let lastRenderedDay = null;
let lastRenderedWeek = null;

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

// Parse week ranges into sorted array of week numbers
function getLessonWeeks(lesson) {
    const weeks = [];
    if (!lesson.weeks) {
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

// Main filter: show only lessons matching current week parity
function getLessonsForDay(dayLessons, currentWeekNum, currentParity) {
    const result = [];

    for (const lesson of dayLessons) {
        const lessonParity = lesson.week;

        // Skip lessons for wrong parity entirely
        if (lessonParity !== 'all' && lessonParity !== currentParity) {
            continue;
        }

        const lessonWeeks = getLessonWeeks(lesson);
        if (lessonWeeks.length === 0) continue;

        // Active: current week is in the list
        if (lessonWeeks.includes(currentWeekNum)) {
            result.push({ lesson, status: 'active', startWeek: null });
            continue;
        }

        // Future: current week is before any of the lesson weeks
        const minWeek = lessonWeeks[0];
        if (currentWeekNum < minWeek) {
            result.push({ lesson, status: 'future', startWeek: minWeek });
            continue;
        }

        // Past: current week is after all lesson weeks
        const maxWeek = lessonWeeks[lessonWeeks.length - 1];
        if (currentWeekNum > maxWeek) {
            continue;
        }

        // Current week is between min and max but not in list (gap week)
        // Find next future week
        const futureWeeks = lessonWeeks.filter(w => w > currentWeekNum);
        if (futureWeeks.length > 0) {
            result.push({ lesson, status: 'future', startWeek: futureWeeks[0] });
        }
    }

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

    // Filter by current week parity
    const lessonItems = getLessonsForDay(lessons, currentWeekNumber, currentWeekParity);

    if (lessonItems.length === 0) {
        container.innerHTML = emptyStateHTML(
            'Нет пар в этот день',
            'На этой неделе занятий нет, но они будут позже в семестре.'
        );
        return;
    }

    // Determine if we should animate (only on first render of this day/week combo)
    const renderKey = currentDayIndex + '-' + currentWeekOffset;
    const shouldAnimate = renderKey !== (lastRenderedDay + '-' + lastRenderedWeek);
    lastRenderedDay = currentDayIndex;
    lastRenderedWeek = currentWeekOffset;

    container.innerHTML = lessonItems.map((item, index) => {
        const lesson = item.lesson;
        const isFuture = item.status === 'future';
        const typeClass = getLessonTypeClass(lesson.subject);
        const futureBadge = isFuture ?
            '<span class="future-badge">С ' + item.startWeek + ' недели</span>' : '';
        const isFullDay = lesson.full_day;
        const futureClass = isFuture ? 'future' : '';
        const animateClass = shouldAnimate ? 'animate' : '';

        if (isFullDay) {
            return '<div class="lesson-card ' + typeClass + ' full-day ' + futureClass + ' ' + animateClass + '" style="animation-delay: ' + (index * 0.05) + 's">' +
                futureBadge +
                '<div class="lesson-time">' + lesson.time + '</div>' +
                '<div class="lesson-title">' + lesson.subject + '</div>' +
                '<div class="lesson-meta">' +
                '<div class="lesson-teacher">' + (lesson.teacher !== '—' ? lesson.teacher : 'Весь день занят') + '</div>' +
                '</div></div>';
        }

        return '<div class="lesson-card ' + typeClass + ' ' + futureClass + ' ' + animateClass + '" style="animation-delay: ' + (index * 0.05) + 's">' +
            futureBadge +
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
        sport: 'Спортивные занятия',
        other: 'Другие разделы'
    };
    container.innerHTML = emptyStateHTML(titles[page] || 'Раздел в разработке', 'Этот раздел скоро появится!');
}

function showError(message) {
    document.getElementById('scheduleContent').innerHTML = emptyStateHTML('Ошибка', message);
}

loadSchedule();
