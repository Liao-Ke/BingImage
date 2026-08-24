/**
 * 必应美图档案主页
 *
 * 功能：沉浸式全屏浏览 2023 年至今的必应每日壁纸
 * - 数据源：import.meta.glob 构建期打包全部 image/YYYYMMDD/data.json（共 ~1000 份、合计约 700KB），
 *   构建产物自包含，部署只需 dist，站点根无需包含数据目录；图片一律走远程 Bing URL
 * - 交互：滚轮 / 触控滑动 / 键盘 / 缩略图时间轴 / URL 路径直达（/20260529，history 模式；兼容旧 #20260529 链接）
 * - 主图：远程 Bing UHD 原图；加载失败显示占位
 * - 时间轴：窗口化虚拟列表，只挂载可视区附近的 DOM，缩略图用远程 640x360 小图，失败显示日期占位
 * - 预载策略：切换时即时预取相邻 ±1 主图；浏览器空闲时（requestIdleCallback）再向更远扩展预载，总量上限 10 张
 * - 预载开关：默认关闭（约 5MB/张的流量开销），顶栏「预载」按钮切换，localStorage 记忆；关闭时零预载流量
 * - 副作用：切换时通过 history.pushState 改写路径，支持浏览器前进/后退
 * - 部署要求：history 模式刷新依赖服务器把任意路径回退到 index.html（SPA fallback），
 *   vite dev/preview 已内置；生产环境需 Nginx try_files / Apache RewriteRule 等配置
 */
import "./style.css";

/* ==================== 类型定义 ==================== */

/** image/YYYYMMDD/data.json 原始结构（仅取用字段） */
interface RawDetail {
  images?: {
    urlbase?: string;
    title?: string;
    copyright?: string;
    copyrightlink?: string;
    /** Bing 图片测验相对链接（100% 存在） */
    quiz?: string;
    /** 完整展示时间戳 YYYYMMDDHHMM（UTC，100% 存在） */
    fullstartdate?: string;
  }[];
}

/** 单日索引条目 */
interface IndexEntry {
  /** 目录名，如 "20260529" */
  date: string;
  /** 展示用日期，如 "2026年05月29日" */
  label: string;
}

/** 单日展示详情 */
interface Detail {
  title: string;
  copyright: string;
  copyrightlink: string;
  /** 远程 UHD 主图 */
  remoteUrl: string;
  /** 远程缩略图（640x360，约 40KB，实测可用） */
  thumbUrl: string;
  /** Bing 官方图片测验链接（完整 URL） */
  quizUrl: string;
  /** 完整展示时间，如 "2026-05-28 07:00 UTC" */
  fullTime: string;
}

/* ==================== DOM 引用 ==================== */

const stage = document.querySelector<HTMLElement>("#stage")!;
/** 双层舞台：一张显示、一张后台装载，切换时交叉淡入 */
const slides = [
  document.querySelector<HTMLElement>("#slide-a")!,
  document.querySelector<HTMLElement>("#slide-b")!,
];
const dateDisplay = document.querySelector<HTMLElement>("#date-display")!;
const timeDisplay = document.querySelector<HTMLElement>("#time-display")!;
const counter = document.querySelector<HTMLElement>("#counter")!;
const overlay = document.querySelector<HTMLElement>("#stage-overlay")!;
const overlayText = overlay.querySelector<HTMLElement>("p")!;
const retryBtn = document.querySelector<HTMLButtonElement>("#retry-btn")!;
const timeline = document.querySelector<HTMLElement>("#timeline")!;
const timelineWrap = document.querySelector<HTMLElement>("#timeline-wrap")!;
const navPrev = document.querySelector<HTMLButtonElement>("#nav-prev")!;
const navNext = document.querySelector<HTMLButtonElement>("#nav-next")!;
const btnRandom = document.querySelector<HTMLButtonElement>("#btn-random")!;
const btnLatest = document.querySelector<HTMLButtonElement>("#btn-latest")!;
const btnPrefetch = document.querySelector<HTMLButtonElement>("#btn-prefetch")!;
const toast = document.querySelector<HTMLElement>("#toast")!;

/* ==================== 常量与状态 ==================== */

/** 缩略图尺寸（与 style.css 中 --thumb-w/h/gap 保持一致） */
const THUMB_W = 144;
const THUMB_H = 81;
const THUMB_GAP = 8;
const STRIDE = THUMB_W + THUMB_GAP;
/** 可视区外预挂载缓冲数量 */
const RENDER_BUFFER = 24;
/** 滚轮连续切换冷却时间（毫秒），防止触摸板惯性连跳 */
const SWITCH_COOLDOWN = 700;
/** 滚轮累积触发阈值 */
const WHEEL_THRESHOLD = 60;
/** 触摸滑动切换阈值（像素） */
const SWIPE_THRESHOLD = 50;
/** 闲时预载图片总量上限（UHD 图约 5MB/张，控制带宽占用） */
const IDLE_PREFETCH_LIMIT = 10;

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderedIndex = -1;
/** 最近一次 goTo 请求的下标；用于丢弃过期请求（快速连按时） */
let pendingIndex = -1;
/** 当前可见的舞台层下标（slides 下标） */
let activeLayer = 0;

/* ==================== 数据层 ==================== */

/** 构建期打包全部单日数据；lazy 加载，dev 下按需请求，build 后全部内联 */
const detailLoaders = import.meta.glob<{ default: RawDetail }>("../image/*/data.json");

/** 日期索引：从 glob 键提取 "image/20231119/data.json" -> "20231119"，按时序升序 */
const entries: IndexEntry[] = Object.keys(detailLoaders)
  .map((key) => {
    const m = key.match(/(\d{4})(\d{2})(\d{2})\/data\.json$/);
    if (!m) return null;
    return {
      date: m[1] + m[2] + m[3],
      label: `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`,
    } satisfies IndexEntry;
  })
  .filter((e): e is IndexEntry => e !== null)
  .sort((a, b) => a.date.localeCompare(b.date));

/** 日期 -> 下标，URL 直达用 */
const dateIndex = new Map(entries.map((e, i) => [e.date, i]));

/** 每年第一条的下标（年份标签定位用） */
const yearStarts: { year: string; index: number }[] = entries.reduce<{ year: string; index: number }[]>((acc, e, i) => {
  const year = e.date.slice(0, 4);
  if (!acc.length || acc[acc.length - 1].year !== year) acc.push({ year, index: i });
  return acc;
}, []);

const detailCache = new Map<string, Promise<Detail>>();

/** 加载单日详情；失败时不缓存，以便重试 */
function loadDetail(date: string): Promise<Detail> {
  let p = detailCache.get(date);
  if (!p) {
    const loader = detailLoaders[`../image/${date}/data.json`];
    p = loader
      ? loader().then((mod) => buildDetail(mod.default))
      : Promise.reject(new Error(`无数据: ${date}`));
    p.catch(() => detailCache.delete(date)); // 失败移出缓存，重试可重新请求
    detailCache.set(date, p);
  }
  return p;
}

/** 由原始 JSON 构造展示详情（图片 URL 一律远程 Bing） */
function buildDetail(raw: RawDetail): Detail {
  const img = raw.images?.[0];
  if (!img) throw new Error("缺少 images[0]");
  const base = img.urlbase ?? "";
  const fsd = img.fullstartdate ?? "";
  return {
    title: img.title ?? "",
    copyright: img.copyright ?? "",
    copyrightlink: img.copyrightlink ?? "",
    // UHD 原图与 640x360 缩略图为实测可用的 Bing 规格
    remoteUrl: base ? `https://cn.bing.com${base}_UHD.jpg&qlt=100` : "",
    thumbUrl: base ? `https://cn.bing.com${base}_640x360.jpg` : "",
    quizUrl: img.quiz ? `https://cn.bing.com${img.quiz}` : "",
    // fullstartdate 为 12 位 UTC 时间戳，格式化为 "YYYY-MM-DD HH:mm UTC"
    fullTime: fsd
      ? `${fsd.slice(0, 4)}-${fsd.slice(4, 6)}-${fsd.slice(6, 8)} ${fsd.slice(8, 10)}:${fsd.slice(10, 12)} UTC`
      : "",
  };
}

/* ==================== 主图舞台 ==================== */

/** 等待图片加载完成（load 或 error 都算完成，防止永久挂起） */
function waitLoad(img: HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    if (img.complete) return resolve();
    const done = () => {
      img.removeEventListener("load", done);
      img.removeEventListener("error", done);
      resolve();
    };
    img.addEventListener("load", done);
    img.addEventListener("error", done);
  });
}

/** 把条目内容填入指定舞台层（不切换可见性） */
function fillSlide(layer: HTMLElement, detail: Detail): void {
  const img = layer.querySelector<HTMLImageElement>("img")!;
  const titleEl = layer.querySelector<HTMLElement>(".slide-title")!;
  const copyEl = layer.querySelector<HTMLElement>(".slide-copyright")!;
  // 远程图失败 -> 占位样式（alt 文字仍可读）
  img.onerror = () => img.classList.add("img-error");
  img.classList.remove("img-error");
  // 主图为装饰性背景，标题由 caption 的 h2 朗读（避免读屏重复）
  img.alt = "";
  img.src = detail.remoteUrl;
  titleEl.textContent = detail.title;
  const actions = document.createElement("div");
  actions.className = "caption-actions";
  const link = document.createElement("a");
  link.href = detail.copyrightlink;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = detail.copyright;
  actions.append(link);
  if (detail.quizUrl) {
    // Bing 官方猜图测验入口
    const quiz = document.createElement("a");
    quiz.className = "quiz-btn";
    quiz.href = detail.quizUrl;
    quiz.target = "_blank";
    quiz.rel = "noopener";
    quiz.textContent = "图片测验";
    actions.append(quiz);
  }
  copyEl.replaceChildren(actions);
}

/** 切换可见层：等新层图片就绪后交叉淡入 */
async function reveal(layer: HTMLElement, index: number, detail: Detail): Promise<void> {
  // 新图下载超 300ms 时显示加载指示，避免"点了没反应"的错觉
  const loadTimer = window.setTimeout(() => stage.classList.add("loading"), 300);
  await waitLoad(layer.querySelector<HTMLImageElement>("img")!);
  window.clearTimeout(loadTimer);
  stage.classList.remove("loading");
  if (pendingIndex !== index) return; // 已被更新的请求取代
  const prev = slides[activeLayer];
  prev.classList.remove("active");
  prev.setAttribute("aria-hidden", "true");
  layer.classList.add("active");
  layer.setAttribute("aria-hidden", "false");
  activeLayer = 1 - activeLayer;
  renderedIndex = index;
  updateChrome(index, detail);
  syncTimeline(index);
  prefetchAround(index);
  scheduleIdlePrefetch(index);
}

/**
 * 跳转到指定条目
 * @param opts.push 是否写入历史记录（用户主动操作 true，程序恢复 false）
 * @param opts.smooth 时间轴是否平滑滚动（首屏初始定位应传 false，避免长距离动画）
 */
async function goTo(index: number, opts: { push?: boolean; smooth?: boolean } = {}): Promise<void> {
  if (!entries.length || index < 0 || index >= entries.length || index === renderedIndex) return;
  pendingIndex = index;
  const entry = entries[index];
  const target = slides[1 - activeLayer]; // 非活动层接收新内容
  target.classList.remove("active");
  try {
    const detail = await loadDetail(entry.date);
    if (pendingIndex !== index) return; // 过期请求丢弃
    fillSlide(target, detail);
    syncPath(entry.date, opts.push ?? false);
    await reveal(target, index, detail);
  } catch {
    if (pendingIndex !== index) return;
    showOverlay(`${entry.label} 的数据加载失败`, true, index);
  }
}

/** 预取相邻日期的详情与主图，减少切换等待（即时、低量；受预载开关控制） */
function prefetchAround(index: number): void {
  if (!prefetchEnabled) return; // 开关关闭：零预载流量
  for (const offset of [-1, 1, -2, 2]) {
    const i = index + offset;
    if (i < 0 || i >= entries.length) continue;
    loadDetail(entries[i].date)
      .then((d) => {
        // 只预载紧邻两张的远程主图，避免浪费带宽
        if (d && Math.abs(offset) <= 1 && d.remoteUrl) {
          const im = new Image();
          im.src = d.remoteUrl;
        }
      })
      .catch(() => {});
  }
}

/* ---------- 闲时预载：浏览器空闲时把更远日期的主图提前下载，总量上限 10 张 ---------- */

/**
 * 预载开关：默认关闭（预载约 5MB/张，流量敏感用户需自行决定）
 * localStorage 记忆选择；关闭时即时预取与闲时预载均不执行，切换按需下载
 */
let prefetchEnabled = false;
try {
  prefetchEnabled = localStorage.getItem("bingimg-prefetch") === "1";
} catch {
  /* localStorage 不可用时保持默认关闭 */
}

/** 已闲时预载过的日期（去重，防止重复下载） */
const idlePrefetched = new Set<string>();
/** 当前闲时预载队列（以最近一次切换为中心向外扩展） */
let idleQueue: string[] = [];
/** requestIdleCallback 特性检测（Safari 等不支持时退化为 setTimeout） */
const hasIdleCallback = typeof (window as { requestIdleCallback?: unknown }).requestIdleCallback === "function";

/** 重置并调度闲时预载：从 center 两侧 d=2 开始向外扩展，最多 IDLE_PREFETCH_LIMIT 张 */
function scheduleIdlePrefetch(centerIndex: number): void {
  if (!prefetchEnabled) return; // 开关关闭：零预载流量
  const queue: string[] = [];
  for (let d = 2; queue.length < IDLE_PREFETCH_LIMIT && d < entries.length; d++) {
    for (const i of [centerIndex - d, centerIndex + d]) {
      if (i < 0 || i >= entries.length) continue;
      const date = entries[i].date;
      if (!idlePrefetched.has(date)) queue.push(date);
    }
  }
  if (!queue.length) return;
  idleQueue = queue;

  // 每帧空闲时间片处理若干张；页面停帧时 timeRemaining 可能恒为 0，
  // 因此每轮至少处理一张，避免队列饿死（最坏情况 1 秒 1 张，10 张 10 秒完成）
  const run = (deadline: IdleDeadline) => {
    let done = 0;
    while (idleQueue.length && (deadline.timeRemaining() > 10 || done === 0)) {
      const date = idleQueue.shift()!;
      idlePrefetched.add(date);
      loadDetail(date)
        .then((d) => {
          if (d.remoteUrl) {
            const im = new Image();
            im.src = d.remoteUrl;
          }
        })
        .catch(() => {});
      done++;
    }
    if (idleQueue.length) {
      if (hasIdleCallback) requestIdleCallback(run, { timeout: 1000 });
      else window.setTimeout(() => run({ timeRemaining: () => 50 } as IdleDeadline), 200);
    }
  };

  if (hasIdleCallback) requestIdleCallback(run, { timeout: 1000 });
  else window.setTimeout(() => run({ timeRemaining: () => 50 } as IdleDeadline), 200);
}

/* ==================== 顶部信息 ==================== */

function updateChrome(index: number, detail?: Detail): void {
  const entry = entries[index];
  dateDisplay.textContent = entry.label;
  // 精确展示时间（Bing fullstartdate，UTC）
  timeDisplay.textContent = detail?.fullTime ?? "";
  counter.textContent = `${index + 1} / ${entries.length}`;
  document.title = `${entry.label} · 必应美图`;
  // 首尾时禁用对应箭头（与 goTo 的范围限制一致）
  navPrev.disabled = index <= 0;
  navNext.disabled = index >= entries.length - 1;
}

/* ==================== URL 路径同步（history 模式） ==================== */

/** 生成目标路径：基于当前路径的目录部分拼接，兼容子路径部署（如 /BingImage/20260529） */
function pathFor(date: string): string {
  const dir = location.pathname.replace(/[^/]*$/, "");
  return dir + date;
}

/** 从当前路径提取日期；无日期返回空串 */
function dateFromPath(): string {
  return location.pathname.match(/(?:^|\/)(\d{8})\/?$/)?.[1] ?? "";
}

function syncPath(date: string, push: boolean): void {
  const target = pathFor(date);
  // 当前路径已是目标（含已迁移的旧 hash 链接）则跳过
  if (location.pathname === target && !location.hash) return;
  if (push) history.pushState(null, "", target);
  else history.replaceState(null, "", target);
}

// 浏览器前进/后退触发（pushState/replaceState 不触发 popstate）
window.addEventListener("popstate", () => {
  const idx = dateIndex.get(dateFromPath());
  if (idx !== undefined && idx !== renderedIndex) void goTo(idx, { push: false });
});

/* ==================== 缩略图时间轴（窗口化虚拟列表） ==================== */

const timelineInner = document.createElement("div");
timelineInner.className = "timeline-inner";
timeline.appendChild(timelineInner);

/** 已挂载的缩略图：下标 -> 按钮 */
const thumbCache = new Map<number, HTMLElement>();
/** 已请求缩略图的集合（防重复请求） */
const thumbRequested = new Set<number>();
/** 已加载完成（成功或失败）的集合 */
const thumbSettled = new Set<number>();
let lo = 0; // 已渲染窗口 [lo, hi]
let hi = -1;

function layoutThumbs(): void {
  timelineInner.style.width = `${entries.length * STRIDE - THUMB_GAP}px`;
  timelineInner.style.height = `${THUMB_H}px`;
  // 年份标签：绝对定位在该年第一张之前；纯装饰（pointer-events: none），不遮挡缩略图点击
  for (const ys of yearStarts) {
    const tag = document.createElement("div");
    tag.className = "year-tag";
    tag.textContent = ys.year;
    tag.style.transform = `translateX(${Math.max(0, ys.index * STRIDE - 44)}px)`;
    timelineInner.appendChild(tag);
  }
}

function mountThumb(i: number): void {
  const entry = entries[i];
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "thumb" + (i === renderedIndex ? " current" : "");
  btn.style.width = `${THUMB_W}px`;
  btn.style.height = `${THUMB_H}px`;
  btn.style.transform = `translateX(${i * STRIDE}px)`;
  btn.dataset.index = String(i);
  btn.setAttribute("aria-current", "false");
  btn.setAttribute("aria-label", `${entry.label} 的壁纸`);
  btn.tabIndex = i === rovingIndex ? 0 : -1; // roving：仅活动项可 Tab 聚焦
  const dateEl = document.createElement("span");
  dateEl.className = "thumb-date";
  dateEl.textContent = `${entry.date.slice(4, 6)}-${entry.date.slice(6)}`;
  const img = document.createElement("img");
  img.className = "thumb-img";
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  btn.append(img, dateEl);
  timelineInner.appendChild(btn);
  thumbCache.set(i, btn);
}

function unmountThumb(i: number): void {
  thumbCache.get(i)?.remove();
  thumbCache.delete(i);
}

/** 按滚动位置重算渲染窗口，只增删边界上的项 */
function renderWindow(): void {
  const viewStart = timeline.scrollLeft;
  const viewEnd = viewStart + timeline.clientWidth;
  const first = Math.max(0, Math.floor(viewStart / STRIDE) - RENDER_BUFFER);
  const last = Math.min(entries.length - 1, Math.ceil(viewEnd / STRIDE) + RENDER_BUFFER);
  for (let i = lo; i < first; i++) unmountThumb(i);
  for (let i = last + 1; i <= hi; i++) unmountThumb(i);
  for (let i = first; i <= last; i++) if (!thumbCache.has(i)) mountThumb(i);
  lo = first;
  hi = last;
}

/** 给真实可视区内的缩略图加载图片（远程小图，失败保留日期占位） */
function ensureVisibleThumbs(): void {
  const first = Math.max(0, Math.floor(timeline.scrollLeft / STRIDE));
  const last = Math.min(entries.length - 1, Math.ceil((timeline.scrollLeft + timeline.clientWidth) / STRIDE) - 1);
  for (let i = first; i <= last; i++) ensureThumbLoaded(i);
}

function ensureThumbLoaded(i: number): void {
  if (thumbRequested.has(i) || thumbSettled.has(i)) return;
  thumbRequested.add(i);
  loadDetail(entries[i].date)
    .then((detail) => {
      thumbSettled.add(i);
      const btn = thumbCache.get(i);
      if (!btn) return;
      const img = btn.querySelector<HTMLImageElement>("img");
      btn.setAttribute("aria-label", `${entries[i].label}：${detail.title}`);
      if (img && detail.thumbUrl) {
        img.onload = () => img.classList.add("loaded");
        img.onerror = () => img.classList.add("loaded"); // 远程缩略图失败：保持日期占位
        img.src = detail.thumbUrl;
      }
    })
    .catch(() => thumbSettled.add(i));
}

/** roving tabindex 的活动项下标（时间轴内唯一可 Tab 聚焦的缩略图） */
let rovingIndex = -1;

/** 更新 roving 焦点：仅活动项 tabindex=0，其余 -1（Tab 只进当前项，方向键在项间移动） */
function setRovingTab(i: number): void {
  rovingIndex = i;
  for (const [idx, btn] of thumbCache) btn.tabIndex = idx === i ? 0 : -1;
}

/** 键盘移动焦点到指定缩略图；未挂载（窗口化）时先滚动到目标再聚焦 */
function focusThumb(i: number): void {
  if (i < 0 || i >= entries.length) return;
  if (!thumbCache.has(i)) {
    timeline.scrollLeft = Math.max(0, i * STRIDE - (timeline.clientWidth - THUMB_W) / 2);
    renderWindow();
  }
  const btn = thumbCache.get(i);
  if (!btn) return;
  setRovingTab(i);
  btn.focus();
}

/** 主图切换后：高亮当前项并平滑滚动居中 */
function syncTimeline(index: number, smooth = true): void {
  for (const [i, btn] of thumbCache) {
    btn.classList.toggle("current", i === index);
    btn.setAttribute("aria-current", String(i === index));
  }
  setRovingTab(index);
  const targetLeft = index * STRIDE - (timeline.clientWidth - THUMB_W) / 2;
  timeline.scrollTo({
    left: Math.max(0, targetLeft),
    behavior: smooth && !prefersReduced ? "smooth" : "auto",
  });
}

// 时间轴滚动时按需重渲染（rAF 节流）
let scrollRaf = 0;
timeline.addEventListener(
  "scroll",
  () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      renderWindow();
      ensureVisibleThumbs();
    });
  },
  { passive: true }
);

// 鼠标拖拽滚动时间轴；拖动距离超过阈值后抑制点击（避免拖拽误触发跳转）
let dragActive = false;
let dragMoved = false;
let dragStartX = 0;
let dragStartScroll = 0;
// NOTE: 不用 setPointerCapture——它会把 pointerup/click 的目标重定向到 timeline，
// 事件委托 closest(".thumb") 将失效导致点击不跳转。改在 document 上监听 up 结束拖拽
timeline.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse" || e.button !== 0) return; // 仅鼠标左键，触摸走原生滚动
  dragActive = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartScroll = timeline.scrollLeft;
  const onUp = (ev: PointerEvent) => {
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    endDrag(ev.type === "pointercancel");
  };
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
});
timeline.addEventListener("pointermove", (e) => {
  if (!dragActive) return;
  const dx = e.clientX - dragStartX;
  if (Math.abs(dx) > 6) dragMoved = true;
  timeline.scrollLeft = dragStartScroll - dx;
});
// 拖拽结束仅释放状态；dragMoved 交由 click 处理时"吞掉并复位"
// （pointerup 之后 click 先于定时器执行，定时清除会误拦正常点击）
const endDrag = (canceled: boolean) => {
  dragActive = false;
  if (canceled) dragMoved = false; // 取消不会派发 click，立即复位
};
timeline.addEventListener("pointerup", () => endDrag(false));
timeline.addEventListener("pointercancel", () => endDrag(true));

// 点击缩略图跳转（事件委托，避免 1000+ 监听器）
timelineInner.addEventListener("click", (e) => {
  if (dragMoved) {
    dragMoved = false; // 拖拽产生的 click：吞掉并复位，避免吞掉下一次正常点击
    return;
  }
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".thumb");
  if (!btn?.dataset.index) return;
  const i = Number(btn.dataset.index);
  if (!Number.isNaN(i)) void goTo(i, { push: true });
});

/* ==================== 输入交互 ==================== */

// 主图区滚轮：纵向切换上一张/下一张（带累积阈值与冷却）
let wheelAcc = 0;
let wheelResetTimer = 0;
let lastSwitchAt = 0;
stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now - lastSwitchAt < SWITCH_COOLDOWN) return;
    wheelAcc += e.deltaY;
    window.clearTimeout(wheelResetTimer);
    wheelResetTimer = window.setTimeout(() => (wheelAcc = 0), 400);
    if (Math.abs(wheelAcc) >= WHEEL_THRESHOLD) {
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      lastSwitchAt = now;
      void goTo(renderedIndex + dir, { push: true });
    }
  },
  { passive: false }
);

// 时间轴区域滚轮：横向滚动时间轴
timelineWrap.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    timeline.scrollLeft += e.deltaY || e.deltaX;
  },
  { passive: false }
);

// 主图区触摸滑动
let touchStartX = 0;
let touchStartY = 0;
stage.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  },
  { passive: true }
);
stage.addEventListener(
  "touchend",
  (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      void goTo(renderedIndex + (dx < 0 ? 1 : -1), { push: true });
    }
  },
  { passive: true }
);

// 键盘导航
document.addEventListener("keydown", (e) => {
  // 焦点在时间轴内：方向键在缩略图间移动焦点（roving），Home/End 跳首/末
  const activeEl = document.activeElement;
  if (activeEl instanceof HTMLElement && timeline.contains(activeEl) && activeEl.dataset.index !== undefined) {
    const cur = Number(activeEl.dataset.index);
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      focusThumb(cur + (e.key === "ArrowRight" ? 1 : -1));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      focusThumb(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      focusThumb(entries.length - 1);
      return;
    }
  }
  const dir =
    e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp"
      ? -1
      : e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown"
        ? 1
        : 0;
  if (dir) {
    e.preventDefault();
    void goTo(renderedIndex + dir, { push: true });
  } else if (e.key === "Home") {
    e.preventDefault();
    void goTo(0, { push: true });
  } else if (e.key === "End") {
    e.preventDefault();
    void goTo(entries.length - 1, { push: true });
  }
});

// 左右箭头切换（桌面端）
navPrev.addEventListener("click", () => void goTo(renderedIndex - 1, { push: true }));
navNext.addEventListener("click", () => void goTo(renderedIndex + 1, { push: true }));
// 顶栏：随机 / 最新（数据最新一天）
btnRandom.addEventListener("click", () => {
  if (!entries.length) return;
  let i = renderedIndex;
  // 随机选一张，避免与当前相同（1000+ 张时几乎必然不同，重试一次兜底）
  while (i === renderedIndex && entries.length > 1) i = Math.floor(Math.random() * entries.length);
  void goTo(i, { push: true });
});
btnLatest.addEventListener("click", () => void goTo(entries.length - 1, { push: true }));

// 预载开关：切换即生效；关闭时清空闲时队列（已发出的请求无法取消，但停止后续调度）
function applyPrefetchUI(): void {
  btnPrefetch.classList.toggle("active", prefetchEnabled);
  btnPrefetch.setAttribute("aria-pressed", String(prefetchEnabled));
  // 文字直白表达开关状态，悬停提示同步说明
  btnPrefetch.textContent = prefetchEnabled ? "预载：开" : "预载：关";
  btnPrefetch.title = prefetchEnabled
    ? "已开启预载，将在浏览器空闲时预载相邻壁纸（约 5MB/张）；点击关闭"
    : "开启后将在浏览器空闲时预载相邻壁纸，提升切换速度（约 5MB/张，流量敏感请保持关闭）";
}
btnPrefetch.addEventListener("click", () => {
  prefetchEnabled = !prefetchEnabled;
  try {
    localStorage.setItem("bingimg-prefetch", prefetchEnabled ? "1" : "0");
  } catch {
    /* 忽略 */
  }
  applyPrefetchUI();
  if (prefetchEnabled && renderedIndex >= 0) scheduleIdlePrefetch(renderedIndex);
  else idleQueue = [];
});
applyPrefetchUI();

// 窗口尺寸变化：重算窗口并保持当前项居中
let resizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderWindow();
    ensureVisibleThumbs();
    if (renderedIndex >= 0) syncTimeline(renderedIndex, false);
  }, 100);
});

/* ==================== 加载遮罩与错误处理 ==================== */

let retryTarget = -1;

function showOverlay(text: string, retryable: boolean, retryIndex = -1): void {
  overlayText.textContent = text;
  retryBtn.hidden = !retryable;
  retryTarget = retryIndex;
  overlay.classList.add("visible");
}

function hideOverlay(): void {
  overlay.classList.remove("visible");
}

retryBtn.addEventListener("click", () => {
  if (retryTarget >= 0) void goTo(retryTarget, { push: false });
  else void init();
});

/* ==================== 首次访问提示 ==================== */

try {
  // localStorage 不可用（隐私模式等）时静默跳过
  if (!localStorage.getItem("bingimg-tip-shown")) {
    toast.classList.add("visible");
    window.setTimeout(() => {
      toast.classList.remove("visible");
      localStorage.setItem("bingimg-tip-shown", "1");
    }, 6000);
  }
} catch {
  /* 忽略 */
}

/* ==================== 启动 ==================== */

async function init(): Promise<void> {
  if (!entries.length) {
    showOverlay("暂无壁纸数据", false);
    return;
  }
  layoutThumbs();
  renderWindow();
  ensureVisibleThumbs();

  // 首屏定位：路径指定日期优先；兼容旧 #YYYYMMDD 链接（读取后迁移为路径）
  const pathDate = dateFromPath();
  const hashDate = /^\d{8}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : "";
  const startDate = pathDate || hashDate;
  const start = startDate ? dateIndex.get(startDate) : undefined;
  // goTo 内部的 syncPath 会自动 replaceState 迁移旧 hash 链接为路径
  await goTo(start !== undefined ? start : entries.length - 1, { push: false, smooth: false });
  hideOverlay();
}

void init();
