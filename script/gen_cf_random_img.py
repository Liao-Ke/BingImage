import os
import shutil
import math
from pathlib import Path
from itertools import cycle

# --------------------------
# 所有配置从环境变量读取，不存在则使用默认值
# 环境变量读取说明：os.getenv(环境变量名, 默认值)
# 注意：环境变量均为字符串类型，需手动转换为对应类型（布尔/浮点/路径）
# --------------------------

# 路径配置：转换为Path对象
SOURCE_DIR = Path(os.getenv("IMG_SOURCE_DIR", "oriImg"))  # 环境变量：IMG_SOURCE_DIR
OUTPUT_DIR = Path(os.getenv("IMG_OUTPUT_DIR", "dist_test"))  # 环境变量：IMG_OUTPUT_DIR

# 布尔配置：环境变量值为 "True"/"true" 则视为True，其他视为False（默认True）
enable_category_env = os.getenv("IMG_ENABLE_CATEGORY", "True").lower()
ENABLE_CATEGORY = True if enable_category_env == "true" else False  # 环境变量：IMG_ENABLE_CATEGORY

# 浮点配置：转换为float类型，默认1.0
try:
    FILE_COUNT_MULTIPLIER = float(os.getenv("IMG_FILE_COUNT_MULTIPLIER", "1.0"))  # 环境变量：IMG_FILE_COUNT_MULTIPLIER
except (ValueError, TypeError):
    FILE_COUNT_MULTIPLIER = 1.0  # 若环境变量值非法，使用默认值

# 字符串配置：直接读取，默认.jpg
OUTPUT_EXT = os.getenv("IMG_OUTPUT_EXT", ".jpg")  # 环境变量：IMG_OUTPUT_EXT


def ensure_dir(path: Path):
    if not path.exists():
        path.mkdir(parents=True)


def process_category(category_name: str, source_files: list, dynamic_num_files: int, is_category_enabled: bool):
    """
    处理单个分类（支持无分类模式，输出到根目录）
    :param category_name: 分类名称（无分类时仅用于日志提示）
    :param source_files: 原始图片列表
    :param dynamic_num_files: 要生成的文件总数
    :param is_category_enabled: 是否启用分类（决定输出目录）
    """
    # 根据是否启用分类，确定输出目录
    if is_category_enabled:
        output_dir = OUTPUT_DIR / category_name
    else:
        output_dir = OUTPUT_DIR  # 不分类时，直接输出到根目录

    ensure_dir(output_dir)

    # 清空对应输出目录的文件（分类模式清空子目录，无分类模式清空根目录）
    for item in output_dir.iterdir():
        if item.is_file():
            item.unlink()

    num_source_imgs = len(source_files)
    if num_source_imgs == 0 or dynamic_num_files <= 0:
        return 0

    # 自动计算所需的HASH_LENGTH（适配当前文件数）
    category_hash_length = max(1, math.ceil(math.log(dynamic_num_files, 16))) if dynamic_num_files > 0 else 1
    avg_copies = dynamic_num_files / num_source_imgs
    print(
        f"  [{category_name}] 发现 {num_source_imgs} 张图片，生成 {dynamic_num_files} 个文件（HASH长度：{category_hash_length}）...")

    img_cycle = cycle(source_files)
    count = 0

    for i in range(dynamic_num_files):
        src_img = next(img_cycle)

        # 生成十六进制文件名
        file_name = f"{i:0{category_hash_length}x}{OUTPUT_EXT}"
        dest_path = output_dir / file_name

        shutil.copy(src_img, dest_path)
        count += 1

    print(f"  [{category_name}] 完成，生成 {count} 个文件")
    return category_hash_length  # 返回HASH长度


def main():
    if not SOURCE_DIR.exists():
        print(f"错误：源目录 '{SOURCE_DIR}' 不存在")
        return

    # 准备输出根目录
    ensure_dir(OUTPUT_DIR)

    # 支持的图片格式
    extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    category_hash_map = {}  # 存储HASH长度

    if ENABLE_CATEGORY:
        # 启用分类模式（原有逻辑：按子目录分类输出）
        subdirs = [d for d in SOURCE_DIR.iterdir() if d.is_dir()]

        if not subdirs:
            print(f"在 {SOURCE_DIR} 中未发现子目录，请创建分类文件夹（例如 {SOURCE_DIR}/pc）")
            return

        print(f"发现 {len(subdirs)} 个分类：{[d.name for d in subdirs]}")

        for subdir in subdirs:
            category = subdir.name
            images = sorted([
                f for f in subdir.iterdir()
                if f.is_file() and f.suffix.lower() in extensions
            ])

            if images:
                num_source = len(images)
                dynamic_num_files = math.ceil(num_source * FILE_COUNT_MULTIPLIER)
                category_hash = process_category(category, images, dynamic_num_files, ENABLE_CATEGORY)
                category_hash_map[category] = category_hash
            else:
                print(f"  [{category}] 未发现图片，跳过")
                category_hash_map[category] = 0
    else:
        # 不启用分类模式：扫描SOURCE_DIR下所有子目录的图片（完整扫描），合并输出到根目录
        print("未启用分类功能，将扫描所有子目录图片并合并输出到根目录")
        all_images = []
        # 先扫描SOURCE_DIR下的直接子目录，遍历其中的图片
        subdirs = [d for d in SOURCE_DIR.iterdir() if d.is_dir()]
        for subdir in subdirs:
            subdir_images = [
                f for f in subdir.iterdir()
                if f.is_file() and f.suffix.lower() in extensions
            ]
            all_images.extend(subdir_images)
            print(f"  从 [{subdir.name}] 目录扫描到 {len(subdir_images)} 张图片")

        # 再扫描SOURCE_DIR根目录下的图片（兼容根目录直接存放图片的场景）
        root_images = [
            f for f in SOURCE_DIR.iterdir()
            if f.is_file() and f.suffix.lower() in extensions
        ]
        all_images.extend(root_images)
        if root_images:
            print(f"  从根目录扫描到 {len(root_images)} 张图片")

        # 去重并排序（避免重复路径，保证顺序一致性）
        all_images = sorted(list(set(all_images)))

        if not all_images:
            print(f"在 {SOURCE_DIR} 及其子目录中未发现图片，任务终止")
            return

        # 合并处理所有图片，分类名称标识为“无分类”
        category_name = "无分类"
        num_source = len(all_images)
        dynamic_num_files = math.ceil(num_source * FILE_COUNT_MULTIPLIER)
        category_hash = process_category(category_name, all_images, dynamic_num_files, ENABLE_CATEGORY)
        category_hash_map[category_name] = category_hash

    # 输出最终提示
    print(f"\n全部完成，结果在 '{OUTPUT_DIR}' 目录")
    print("各分类HASH长度（请对应修改Cloudflare规则）：")
    for cate, h_len in category_hash_map.items():
        if h_len > 0:
            print(f"  - [{cate}] HASH_LENGTH={h_len}")


if __name__ == "__main__":
    main()