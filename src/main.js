import './styles/app.css'

// 假设 getCurrentDateFormatted 函数的实现如下
function getCurrentDateFormatted(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function formatDate(dateStr) {
    // 从输入字符串中提取年、月、日、时、分
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const hour = dateStr.slice(8, 10);
    const minute = dateStr.slice(10, 12);

    // 创建一个 Date 对象
    const date = new Date(year, month - 1, day, hour, minute);

    // 获取星期几
    const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const week = weekday[date.getDay()];

    // 组合成最终的日期字符串
    return `${year}年${month}月${day}日 ${week} ${hour}:${minute}`;
}

// 封装设置背景图片和添加链接到标题的逻辑
function setBackgroundAndTitle(json) {
    // 构建背景图片的 URL
    const bgurl = `https://cn.bing.com${json.default.images[0].urlbase}_UHD.jpg&qlt=100`;
    // 设置页面背景图片
    document.body.style.backgroundImage = `url(${bgurl})`;
    // 设置页面标题
    document.title = json.default.images[0].title;

    // 获取 id 为 navbar 的元素
    const navbarElement = document.getElementById('navbar');
    // 创建一个 a 元素
    const aElement = document.createElement('a');
    // 创建一个 div 元素
    const divElement = document.createElement('div');
    // 设置 div 元素的 class 属性为 navbar-start	
    divElement.classList.add('navbar-start');

    // 设置 a 元素的 class 属性为 link
    aElement.classList.add('link');
    // 设置 a 元素的 class 属性为 link-hover
    aElement.classList.add('link-hover');
    // 设置 a 元素的 class 属性为 btn btn-link 
    aElement.classList.add('btn', 'btn-link');
    // 设置 a 元素的 target 属性为 _blank
    aElement.target = '_blank';
    // 设置 a 元素的 href 属性为图片的版权链接
    aElement.href = json.default.images[0].copyrightlink;
    // 设置 a 元素的文本为图片的标题
    aElement.innerText = `${json.default.images[0].copyright}`;
    // 将 a 元素添加到 div 元素中
    divElement.appendChild(aElement);
    // 将 div 元素添加到 h1 元素之中
    navbarElement.appendChild(divElement);

    divElement.insertAdjacentHTML("afterbegin",`${json.default.images[0].title}`)
    navbarElement.insertAdjacentHTML("beforeend",`<span class="navbar-end font-extrabold">${formatDate(json.default.images[0].fullstartdate)}</span>`)
}

// 尝试加载指定日期的数据
async function tryLoadData(dateOffset = 0) {
    const formattedDate = getCurrentDateFormatted(dateOffset);
    try {
        // 动态导入指定日期的数据文件
        const json = await import(`../image/${formattedDate}/data.json`);
        // 调用设置背景图片和标题的函数
        setBackgroundAndTitle(json);
        return true;
    } catch (error) {
        console.error(`Failed to load data for date ${formattedDate}:`, error);
        return false;
    }
}

// 主函数，尝试加载数据，最多尝试 5 次
async function main() {
    for (let i = 0; i < 5; i++) {
        if (await tryLoadData(i)) {
            return;
        }
    }
    console.log('Failed to load data after multiple attempts.');
}

// 调用主函数
main();