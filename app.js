// Telegram WebApp initialization
const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();
if (tg.disableVerticalSwipes) {
    tg.disableVerticalSwipes();
}

tg.setHeaderColor('#0f1419');
tg.setBackgroundColor('#0f1419');

// App State
let currentGroup = 'БИ 2-3';
let currentWeekOffset = 0;  // 0 = текущая неделя, +1 = след, -1 = пред
let currentDayIndex = 0;    // 0 = ПН
let scheduleData = null;
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

// Получить номер текущей недели (1-16) относительно semesterStart
function getBaseWeekNumber() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now < semesterStart) return 1;
    const diffDays = Math.floor((now - semesterStart) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 1;
}

// Получить текущий день недели (0-6) относительно semesterStart
function getBaseDayIndex() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now < semesterStart) return 0;
    const diffDays = Math.floor((now - semesterStart) / (1000 * 60 * 60 * 24));
    return diffDays % 7;
}

// Инфо о неделе по смещению от текущей
function getWeekInfo(offset) {
    const baseWeek = getBaseWeekNumber();
    const targetWeek = baseWeek + offset;
    const clampedWeek = Math.max(1, Math.min(16, targetWeek));
    const isOdd = scheduleData.meta.odd_weeks.includes(clampedWeek);

    // Начало недели = semesterStart + (clampedWeek - 1) * 7 дней
    const weekStart = new Date(semesterStart);
    weekStart.setDate(semesterStart.getDate() + (clampedWeek - 1) * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return {
        weekNumber: clampedWeek,
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

function isToday(date) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === now.getTime();
}

function isDateInCurrentWeek(weekStart, weekEnd) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const ws = new Date(weekStart);
    ws.setHours(0, 0, 0, 0);
    const we = new Date(weekEnd);
    we.setHours(0, 0, 0, 0);
    return now >= ws && now <= we;
}

function initApp() {
    const weekInfo = getWeekInfo(currentWeekOffset);
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
    const isCurrentWeek = isDateInCurrentWeek(weekInfo.start, weekInfo.end);

    strip.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);

        const dayDiv = document.createElement('div');
        dayDiv.className = 'day';
        if (i === currentDayIndex) dayDiv.classList.add('active');
        if (isCurrentWeek && isToday(date)) dayDiv.classList.add('today');

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

function goToToday() {
    currentWeekOffset = 0;
    currentDayIndex = getBaseDayIndex();
    initApp();
}

function parseWeeks(lesson) {
    const allWeeks = [];

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

    const ranges = lesson.weeks.split(',').map(function(r) { return r.trim(); });
    for (let j = 0; j < ranges.length; j++) {
        const range = ranges[j];
        if (range.indexOf('-') !== -1) {
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

    allWeeks.sort(function(a, b) { return a - b; });
    return {
        startWeek: allWeeks[0] || 1,
        endWeek: allWeeks[allWeeks.length - 1] || 16,
        allWeeks: allWeeks
    };
}

function getLessonStatus(lesson, currentWeekNum) {
    const parsed = parseWeeks(lesson);
    const allWeeks = parsed.allWeeks;

    if (allWeeks.indexOf(currentWeekNum) !== -1) {
        return { status: 'active', startWeek: parsed.startWeek, endWeek: parsed.endWeek };
    }

    if (currentWeekNum < parsed.startWeek) {
        return { status: 'future', startWeek: parsed.startWeek, endWeek: parsed.endWeek };
    }

    if (currentWeekNum > parsed.endWeek) {
        return { status: 'past', startWeek: parsed.startWeek, endWeek: parsed.endWeek };
    }

    const futureWeeks = allWeeks.filter(function(w) { return w > currentWeekNum; });
    if (futureWeeks.length > 0) {
        return { status: 'future', startWeek: futureWeeks[0], endWeek: parsed.endWeek };
    }

    return { status: 'past', startWeek: parsed.startWeek, endWeek: parsed.endWeek };
}

function getDisplayLessons(dayLessons, currentWeekNum) {
    const byTime = {};

    for (let i = 0; i < dayLessons.length; i++) {
        const lesson = dayLessons[i];
        const statusInfo = getLessonStatus(lesson, currentWeekNum);
        if (statusInfo.status === 'past') continue;

        const time = lesson.time;
        if (!byTime[time]) byTime[time] = [];
        byTime[time].push({
            lesson: lesson,
            status: statusInfo.status,
            startWeek: statusInfo.startWeek,
            endWeek: statusInfo.endWeek
        });
    }

    const result = [];
    const times = Object.keys(byTime);
    for (let i = 0; i < times.length; i++) {
        const time = times[i];
        const items = byTime[time];
        items.sort(function(a, b) {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;
            return a.startWeek - b.startWeek;
        });
        result.push(items[0]);
    }

    result.sort(function(a, b) {
        return times.indexOf(a.lesson.time) - times.indexOf(b.lesson.time);
    });

    return result;
}

function getLessonTypeClass(subject) {
    const lower = subject.toLowerCase();
    if (lower.indexOf('(л)') !== -1) return 'lecture';
    if (lower.indexOf('(пз)') !== -1) return 'practice';
    if (lower.indexOf('(лз)') !== -1) return 'lab';
    if (lower.indexOf('физическая культура') !== -1) return 'sport';
    if (lower.indexOf('проектное обучение') !== -1) return 'project';
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
        container.innerHTML = vacationStateHTML();
        return;
    }

    const dayKey = dayNames[currentDayIndex];
    const lessons = group.schedule[dayKey] || [];

    if (lessons.length === 0) {
        container.innerHTML = sundayEmptyHTML();
        return;
    }

    const displayItems = getDisplayLessons(lessons, weekInfo.weekNumber);

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

    container.innerHTML = displayItems.map(function(item, index) {
        const lesson = item.lesson;
        const isFuture = item.status === 'future';
        const typeClass = getLessonTypeClass(lesson.subject);
        const futureClass = isFuture ? 'future' : '';
        const animateClass = shouldAnimate ? 'animate' : '';
        const isFullDay = lesson.full_day;

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

function sundayEmptyHTML() {
    return '<div class="empty-state">' +
        '<div class="empty-icon">⏳</div>' +
        '<div class="empty-title">Нет пар в этот день</div>' +
        '</div>';
}

function vacationStateHTML() {
    return '<div class="vacation-state">' +
        '<div class="vacation-icon">🏖️</div>' +
        '<div class="vacation-title">Каникулы</div>' +
        '</div>';
}

let listenersSetup = false;

function setupEventListeners() {
    if (listenersSetup) return;
    listenersSetup = true;

    document.getElementById('prevWeek').addEventListener('click', function() {
        currentWeekOffset--;
        initApp();
    });

    document.getElementById('nextWeek').addEventListener('click', function() {
        currentWeekOffset++;
        initApp();
    });

    document.getElementById('todayBtn').addEventListener('click', function() {
        goToToday();
    });

    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.addEventListener('click', function() {
            document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
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
