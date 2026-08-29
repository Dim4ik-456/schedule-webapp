// Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
tg.setHeaderColor('#0f1419');
tg.setBackgroundColor('#0f1419');

// State
let currentGroup = 'БИ 2-3';
let currentWeekNum = 1;   // 1..16, текущая отображаемая неделя
let currentDayIndex = 0;  // 0=ПН..6=ВС
let scheduleData = null;
let semesterStart = null;
let lastRenderKey = '';

const dayNames = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const dayShortNames = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];
const monthNames = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const monthNamesFull = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                        'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

async function loadSchedule() {
    try {
        const res = await fetch('schedule_data.json?v=3');
        scheduleData = await res.json();
        semesterStart = new Date(scheduleData.meta.start_date + 'T00:00:00');
        currentWeekNum = getRealWeekNum();
        currentDayIndex = getRealDayIndex();
        initApp();
    } catch (e) {
        console.error(e);
        showError('Ошибка загрузки расписания');
    }
}

// Какая сейчас реальная учебная неделя (1..16)
function getRealWeekNum() {
    const now = new Date();
    now.setHours(0,0,0,0);
    if (now < semesterStart) return 1;
    const days = Math.floor((now - semesterStart) / 86400000);
    return Math.min(16, Math.floor(days / 7) + 1);
}

// Какой сейчас реальный день недели (0..6)
function getRealDayIndex() {
    const now = new Date();
    now.setHours(0,0,0,0);
    if (now < semesterStart) return 0;
    const days = Math.floor((now - semesterStart) / 86400000);
    return days % 7;
}

// Дата начала недели N
function getWeekStart(weekNum) {
    const d = new Date(semesterStart);
    d.setDate(semesterStart.getDate() + (weekNum - 1) * 7);
    d.setHours(0,0,0,0);
    return d;
}

// Дата конца недели N
function getWeekEnd(weekNum) {
    const d = getWeekStart(weekNum);
    d.setDate(d.getDate() + 6);
    return d;
}

function getWeekInfo(weekNum) {
    const wn = Math.max(1, Math.min(16, weekNum));
    const isOdd = scheduleData.meta.odd_weeks.includes(wn);
    const start = getWeekStart(wn);
    const end = getWeekEnd(wn);
    return {
        weekNumber: wn,
        isOdd: isOdd,
        parity: isOdd ? 'odd' : 'even',
        parityText: isOdd ? 'Нечётная' : 'Чётная',
        start: start,
        end: end,
        monthText: getMonthRangeText(start, end)
    };
}

function getMonthRangeText(a, b) {
    const ma = monthNamesFull[a.getMonth()];
    const mb = monthNamesFull[b.getMonth()];
    return ma === mb ? ma : ma + ' — ' + mb;
}

function fmtDate(d) {
    return d.getDate() + ' ' + monthNames[d.getMonth()];
}

function isBeforeSemester(d) {
    const x = new Date(d);
    x.setHours(0,0,0,0);
    return x < semesterStart;
}

function isToday(d) {
    const n = new Date();
    n.setHours(0,0,0,0);
    const x = new Date(d);
    x.setHours(0,0,0,0);
    return x.getTime() === n.getTime();
}

function isThisWeek(start, end) {
    const n = new Date();
    n.setHours(0,0,0,0);
    const s = new Date(start); s.setHours(0,0,0,0);
    const e = new Date(end); e.setHours(0,0,0,0);
    return n >= s && n <= e;
}

function initApp() {
    const info = getWeekInfo(currentWeekNum);
    updateWeekDisplay(info);
    updateDaysStrip(info);
    renderSchedule();
    setupListenersOnce();
}

function updateWeekDisplay(info) {
    document.getElementById('weekMonth').textContent = info.monthText;
    document.getElementById('weekType').textContent = info.parityText;
    document.getElementById('weekRange').textContent =
        fmtDate(info.start) + ' — ' + fmtDate(info.end) + ' · ' + info.weekNumber + '-я неделя';
}

function updateDaysStrip(info) {
    const strip = document.getElementById('daysStrip');
    const start = info.start;
    const currentWeek = isThisWeek(info.start, info.end);
    strip.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const el = document.createElement('div');
        el.className = 'day';
        if (i === currentDayIndex) el.classList.add('active');
        if (currentWeek && isToday(d)) el.classList.add('today');
        el.innerHTML = '<span class="day-name">' + dayShortNames[i] + '</span>' +
                       '<span class="day-num">' + d.getDate() + '</span>';
        el.addEventListener('click', () => selectDay(i));
        strip.appendChild(el);
    }
}

function selectDay(i) {
    if (i === currentDayIndex) return;
    currentDayIndex = i;
    document.querySelectorAll('.day').forEach((el, idx) => {
        el.classList.toggle('active', idx === i);
    });
    renderSchedule();
}

function goToday() {
    currentWeekNum = getRealWeekNum();
    currentDayIndex = getRealDayIndex();
    initApp();
}

function prevWeek() {
    if (currentWeekNum > 1) {
        currentWeekNum--;
        initApp();
    }
}

function nextWeek() {
    if (currentWeekNum < 16) {
        currentWeekNum++;
        initApp();
    }
}

// --- Парсинг недель ---
function parseWeeks(lesson) {
    const all = [];
    if (!lesson.weeks) {
        for (let w = 1; w <= 16; w++) {
            if (lesson.week === 'all' ||
                (lesson.week === 'odd' && w % 2 === 1) ||
                (lesson.week === 'even' && w % 2 === 0)) all.push(w);
        }
        return { start: all[0] || 1, end: all[all.length - 1] || 16, all };
    }
    const parts = lesson.weeks.split(',').map(s => s.trim());
    for (const p of parts) {
        if (p.indexOf('-') !== -1) {
            const [a, b] = p.split('-').map(Number);
            for (let w = a; w <= b; w++) {
                if (lesson.week === 'all' ||
                    (lesson.week === 'odd' && w % 2 === 1) ||
                    (lesson.week === 'even' && w % 2 === 0)) all.push(w);
            }
        } else {
            const w = Number(p);
            if (lesson.week === 'all' ||
                (lesson.week === 'odd' && w % 2 === 1) ||
                (lesson.week === 'even' && w % 2 === 0)) all.push(w);
        }
    }
    all.sort((a, b) => a - b);
    return { start: all[0] || 1, end: all[all.length - 1] || 16, all };
}

function getLessonStatus(lesson, weekNum) {
    const p = parseWeeks(lesson);
    if (p.all.indexOf(weekNum) !== -1) return { status: 'active', start: p.start, end: p.end };
    if (weekNum < p.start) return { status: 'future', start: p.start, end: p.end };
    if (weekNum > p.end) return { status: 'past', start: p.start, end: p.end };
    const fw = p.all.filter(w => w > weekNum);
    if (fw.length) return { status: 'future', start: fw[0], end: p.end };
    return { status: 'past', start: p.start, end: p.end };
}

function getDisplayLessons(dayLessons, weekNum) {
    const byTime = {};
    for (const lesson of dayLessons) {
        const st = getLessonStatus(lesson, weekNum);
        if (st.status === 'past') continue;
        const t = lesson.time;
        if (!byTime[t]) byTime[t] = [];
        byTime[t].push({ lesson, status: st.status, start: st.start, end: st.end });
    }
    const result = [];
    const times = Object.keys(byTime);
    for (const t of times) {
        const items = byTime[t];
        items.sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;
            return a.start - b.start;
        });
        result.push(items[0]);
    }
    result.sort((a, b) => times.indexOf(a.lesson.time) - times.indexOf(b.lesson.time));
    return result;
}

function getTypeClass(subject) {
    const s = subject.toLowerCase();
    if (s.indexOf('(л)') !== -1) return 'lecture';
    if (s.indexOf('(пз)') !== -1) return 'practice';
    if (s.indexOf('(лз)') !== -1) return 'lab';
    if (s.indexOf('физическая культура') !== -1) return 'sport';
    if (s.indexOf('проектное обучение') !== -1) return 'project';
    return 'lecture';
}

function renderSchedule() {
    const container = document.getElementById('scheduleContent');
    const group = scheduleData.groups[currentGroup];
    if (!group) { container.innerHTML = emptyHTML('Группа не найдена'); return; }

    const info = getWeekInfo(currentWeekNum);
    const start = info.start;
    const selDate = new Date(start);
    selDate.setDate(start.getDate() + currentDayIndex);

    if (isBeforeSemester(selDate)) {
        container.innerHTML = vacationHTML();
        return;
    }

    const dayKey = dayNames[currentDayIndex];
    const lessons = group.schedule[dayKey] || [];

    if (lessons.length === 0) {
        container.innerHTML = sundayHTML();
        return;
    }

    const items = getDisplayLessons(lessons, currentWeekNum);
    if (items.length === 0) {
        container.innerHTML = emptyHTML('Нет пар в этот день', 'На этой неделе занятий нет, но они будут позже.');
        return;
    }

    const key = currentWeekNum + '-' + currentDayIndex;
    const anim = key !== lastRenderKey;
    lastRenderKey = key;

    container.innerHTML = items.map((it, i) => {
        const l = it.lesson;
        const isFut = it.status === 'future';
        const tc = getTypeClass(l.subject);
        const fc = isFut ? 'future' : '';
        const ac = anim ? 'animate' : '';
        const fd = l.full_day;

        let badge = '';
        if (isFut) badge = '<span class="future-badge">С ' + it.start + ' недели</span>';
        else if (it.end < 16) badge = '<span class="end-badge">до ' + it.end + ' недели</span>';

        if (fd) {
            return '<div class="lesson-card ' + tc + ' full-day ' + fc + ' ' + ac + '" style="animation-delay:' + (i * 0.05) + 's">' +
                badge + '<div class="lesson-time">' + l.time + '</div>' +
                '<div class="lesson-title">' + l.subject + '</div>' +
                '<div class="lesson-meta"><div class="lesson-teacher">' + (l.teacher !== '—' ? l.teacher : 'Весь день занят') + '</div></div></div>';
        }
        return '<div class="lesson-card ' + tc + ' ' + fc + ' ' + ac + '" style="animation-delay:' + (i * 0.05) + 's">' +
            badge + '<div class="lesson-time">' + l.time + '</div>' +
            '<div class="lesson-title">' + l.subject + '</div>' +
            '<div class="lesson-meta">' +
            (l.teacher !== '—' ? '<div class="lesson-teacher">' + l.teacher + '</div>' : '') +
            (l.room !== '—' ? '<div class="lesson-room">' + l.room + '</div>' : '') +
            '</div></div>';
    }).join('');
}

function emptyHTML(title, text) {
    return '<div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-title">' + title + '</div>' +
        (text ? '<div class="empty-text">' + text + '</div>' : '') + '</div>';
}
function sundayHTML() {
    return '<div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-title">Нет пар в этот день</div></div>';
}
function vacationHTML() {
    return '<div class="vacation-state"><div class="vacation-icon">🏖️</div><div class="vacation-title">Каникулы</div></div>';
}

let listenersDone = false;
function setupListenersOnce() {
    if (listenersDone) return;
    listenersDone = true;
    document.getElementById('prevWeek').addEventListener('click', prevWeek);
    document.getElementById('nextWeek').addEventListener('click', nextWeek);
    document.getElementById('todayBtn').addEventListener('click', goToday);
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            if (item.dataset.page === 'schedule') renderSchedule();
            else document.getElementById('scheduleContent').innerHTML = emptyHTML('Спортивные занятия', 'Раздел в разработке');
        });
    });
}

function showError(msg) {
    document.getElementById('scheduleContent').innerHTML = emptyHTML('Ошибка', msg);
}

loadSchedule();
