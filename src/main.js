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

// 封装设置背景图片和添加链接到标题的逻辑
function setBackgroundAndTitle(json) {
    // 构建背景图片的 URL
    const bgurl = `https://cn.bing.com${json.default.images[0].urlbase}_UHD.jpg&qlt=100`;
    // 设置页面背景图片
    document.body.style.backgroundImage = `url(${bgurl})`;
    // 设置页面标题
    document.title = json.default.images[0].title;

    // 获取 h1 元素
    const h1Element = document.querySelector('h1');
    // 创建一个 a 元素
    const aElement = document.createElement('a');
    // 设置 a 元素的 href 属性为图片的版权链接
    aElement.href = json.default.images[0].copyrightlink;
    // 设置 a 元素的文本为图片的标题
    aElement.innerText = json.default.images[0].title;
    // 将 a 元素添加到 h1 元素中
    h1Element.appendChild(aElement);
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