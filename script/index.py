#!/usr/bin/python3
# -*- coding:utf-8 -*-
"""
@Time    :   2023/11/19 9:26 
@Version :   1.0
@Author  :   Liao
"""
import os
import time

import requests
from fake_useragent import UserAgent


def get_image_info():
    headers = {"User-Agent": UserAgent().random}
    url = "https://cn.bing.com/HPImageArchive.aspx?format=js&n=1"
    try:
        with requests.get(url, headers=headers) as resp:
            img_data = resp.text
            resp.encoding = resp.apparent_encoding
            img_url = "https://cn.bing.com" + resp.json()["images"][0]["urlbase"] + "_UHD.jpg&qlt=100"
            img_title = resp.json()["images"][0]["title"] + ".jpg"
    except requests.exceptions.ConnectionError as err:
        set_error(f"图片信息请求异常：{err}")
        exit(1)
    for ch in r'\/*:"?<>|':
        img_title = img_title.replace(ch, "")
    return img_title, img_url, img_data


def get_format_time():
    return time.strftime("%Y年%m月%d日 {w}  %H:%M:%S", time.localtime()).format(
        w=f"星期{['日', '一', '二', '三', '四', '五', '六'][int(time.strftime('%w', time.localtime()))]}")


def set_error(msg):
    with open("./log.txt", "a", encoding="utf-8") as err:
        err.write(str(msg) + "    " + get_format_time() + "   \n")


if __name__ == "__main__":
    path = "../image/" + time.strftime("%Y%m%d", time.localtime())
    image_info = get_image_info()
    image_path = path + "/" + image_info[0]
    if os.path.exists(image_path):
        set_error("今日已下载")
        exit(0)
    os.makedirs(path, exist_ok=True)

    with open(path + "/data.json", "a", encoding="utf-8") as f:
        f.write(image_info[2])

    try:
        with requests.get(image_info[1], "rb") as d:
            with open(image_path, "wb") as f:
                f.write(d.content)
    except requests.exceptions.ConnectionError as e:
        set_error(f"下载图片异常：{e}")
        exit(1)
    with open("./data.txt", "a") as f:
        f.write(image_path + "   " + get_format_time() + "   \n")
