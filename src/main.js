import 'layui'
// import '@node_modules/layui/dist/css/layui.css'
import json from '@script/data.json'


function* createImageGenerator(jsonArray) {
    for (const element of jsonArray) {
        const img = new Image();
     
        img.src =import.meta.env.VITE_IS_PROD?layui.url(element.image_path).pathname.slice(1, 3).join('/') :  element.image_path;
        
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
        
      next(data,page< (json.length/10)) ; // 此处假设总页数为 10
       },520)
       
      }
    });
  });