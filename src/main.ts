import "./style.css";

const imgJsonUrl = new URL("../script/data.json", import.meta.url);
const imgJson = await (await fetch(imgJsonUrl)).json();
// const imgJson = await import('../image/20231119/data.json');

function formatDateToYearMonthDay(dateString: string): Date {
  // 使用正则表达式匹配年月日部分
  const regex = /(\d{4})年(\d{1,2})月(\d{1,2})日/;
  const match = dateString.match(regex);

  if (!match) {
    throw new Error("无法解析日期格式");
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // JavaScript月份从0开始
  const day = parseInt(match[3], 10);

  // 创建仅包含年月日的Date对象
  const formattedDate = new Date(year, month, day);
  return formattedDate;
}

const minDate = formatDateToYearMonthDay(imgJson[0].datetime);
const maxDate = formatDateToYearMonthDay(imgJson[imgJson.length - 1].datetime);

const container = document.querySelector(".scroll-container") as HTMLDivElement;

let curDate = new Date();
if (curDate > maxDate) {
  curDate = new Date(maxDate);
}

function getDateFormatted(dateParam: string | number | Date) {
  const date = new Date(dateParam);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function prevDate() {
  const newDate = new Date(curDate);
  newDate.setDate(newDate.getDate() - 1);

  if (newDate < minDate) {
    return maxDate.getTime();
  }

  // curDate = newDate;
  return newDate.getTime();
}

// 后一天
function nextDate() {
  const newDate = new Date(curDate);
  newDate.setDate(newDate.getDate() + 1);

  if (newDate > maxDate) {
    return minDate.getTime();
  }

  // curDate = newDate;
  return newDate.getTime();
}
async function createElement(
  dateParam: string | number | Date,
  className: string = ""
) {
  // const img = document.createElement("img");

  // // img.src=imgs[index].image_path;
  // const imgData = await import(
  //   `../image/${getDateFormatted(dateParam)}/data.json`
  // );
  // img.src = `https://cn.bing.com${imgData.default.images[0].urlbase}_UHD.jpg&qlt=100`;
  // const div = document.createElement("div");
  // div.classList.add("item");
  // div.appendChild(img);
  // container!.appendChild(div);
  // return div;
  const img = document.querySelector(`${className} img`) as HTMLImageElement;
  const imgTextElement = document.querySelector(
    `${className} .text`
  ) as HTMLSpanElement;
  const imgFooterElement = document.querySelector(
    `${className} .footer`
  ) as HTMLAnchorElement;
  const imgData = await import(
    `../image/${getDateFormatted(dateParam)}/data.json`
  );
  img!.src = `https://cn.bing.com${imgData.default.images[0].urlbase}_UHD.jpg&qlt=100`;
  img.alt = imgData.default.images[0].title;
  imgTextElement.textContent = imgData.default.images[0].title;
  imgFooterElement.textContent =
    imgData.default.images[0].copyright +
    "——" +
    imgData.default.images[0].enddate;
  imgFooterElement.href = imgData.default.images[0].copyrightlink;
  imgFooterElement.target = "_blank";
}

async function resetElements() {
  // container!.innerHTML = "";
  const prev = prevDate();
  const next = nextDate();
  // (await createElement(prev)).classList.add("prev");
  // (await createElement(curDate)).classList.add("current");
  // (await createElement(next)).classList.add("next");

  await createElement(prev, ".prev");
  await createElement(curDate, ".current");
  await createElement(next, ".next");
}

resetElements();

window.addEventListener("wheel", (e) => {
  if (!e.deltaY) return;

  if (e.deltaY < 0) {
    container!.className = "scroll-container scroll-up";
    container?.querySelector(".prev")?.classList.add("transitioning");
  } else {
    container!.className = "scroll-container scroll-down";
    container?.querySelector(".next")?.classList.add("transitioning");
  }
});

// 触摸事件处理
let touchStartY = 0;
let touchEndY = 0;

container.addEventListener(
  "touchstart",
  (e: TouchEvent) => {
    touchStartY = e.changedTouches[0].screenY;
  },
  false
);

container.addEventListener(
  "touchend",
  (e: TouchEvent) => {
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
  },
  false
);

function handleSwipe() {
  const swipeThreshold = 50;

  if (touchEndY - touchStartY > swipeThreshold) {
    container.className = "scroll-container scroll-up";
    container.querySelector(".prev")?.classList.add("transitioning");
  } else if (touchStartY - touchEndY > swipeThreshold) {
    container.className = "scroll-container scroll-down";
    container.querySelector(".next")?.classList.add("transitioning");
  }
}

container!.addEventListener("transitionend", async () => {
  if (container!.className.includes("scroll-up")) {
    curDate = new Date(prevDate());
    container?.querySelector(".prev")?.classList.remove("transitioning");
  } else if (container!.className.includes("scroll-down")) {
    curDate = new Date(nextDate());
    container?.querySelector(".next")?.classList.remove("transitioning");
  }

  await resetElements();
  container!.className = "scroll-container";
});
