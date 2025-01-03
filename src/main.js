import 'layui'
// import '@node_modules/layui/dist/css/layui.css'
import json from '@script/data.json'

// const imgBE=document.getElementById("imgBE")
// const fragment = document.createDocumentFragment();
// json.forEach(element => {
//     const img = new Image()
//     img.src = element.image_path
//     fragment.appendChild(img)
// });
// imgBE.appendChild(fragment)
function* createImageGenerator(jsonArray) {
    for (const element of jsonArray) {
        const img = new Image();
        // img.height=300
        // img.src = element.image_path;
        // img.setAttribute('lay-src', element.image_path);
        
        img.src = element.image_path;

        var filename = layui.url(element.image_path).pathname.at(-1);
        let [newFilename] = filename.split('.');
        img.alt = newFilename;
        img.title = `${newFilename} ${element.datetime}`;
        
        yield img;
    }
}
const imageGenerator = createImageGenerator(json);
layui.use(['flow'],function(){
    const flow = layui.flow;
    // 流加载实例
    flow.load({
      elem: '.waterfall', // 流加载容器
      isLazyimg: false, // 是否延迟加载图片
      done: function(page, next){ // 执行下一页的回调
        // 模拟数据插入
       setTimeout(function(){

        let data = '';
        for (let i = 0; i < 10; i++) {
            const img = imageGenerator.next().value;
            if (img) {
                data += img.outerHTML;
            }
        }
        console.log(data);
        
      next(data,page< (json.length/10)) ; // 此处假设总页数为 10
       },520)
       
      }
    });
  });