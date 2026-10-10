# 星际闪避 · STAR DRIFT

支持键盘和手机触控的太空闪避小游戏，使用 HTML、CSS 和原生 JavaScript Canvas 开发。包含三种难度、护盾、冲刺和最高纪录，纪录保存在当前浏览器。

## 本地运行

```bash
python3 -m http.server 8000 --directory dist
```

访问 http://localhost:8000 。

## 部署

无需安装依赖或构建，将 `dist` 目录部署到静态网站托管服务即可。资源引用使用相对路径，支持部署到子目录。

`.openai/hosting.json` 保留原 Sites 项目标识和发布目录；运行游戏不需要此文件。

## 操作

- 方向键 / WASD / 拖动：移动飞船
- 空格 / 冲刺按钮：短暂无敌冲刺
- P / Escape：暂停或继续
- 收集星光获得分数，收集护盾补给恢复护盾

字体通过 Google Fonts 加载，不可用时自动回退到系统字体。
