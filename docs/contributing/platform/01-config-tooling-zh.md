# 开发 Plasmic Studio：配置和工具指南

## 配置（可选）

在 `~/.plasmic/secrets.json` 中写入类似以下内容：

```json
{
  "encryptionKey": "dummykey",
  "google": {
    "clientId": "请参见下面的谷歌说明",
    "clientSecret": "请参见下面的谷歌说明"
  },
  "smtpAuth": {
    "user": "设置为SMTP用户",
    "pass": "设置为SMTP密钥"
  },
  "segmentWriteKey": "忽略此项"
}
```

你还需要 `~/.aws/credentials`，因为各种部分如代码生成/发布和 Figma 导入使用 S3。

请使用你提供的 IAM 凭据和访问令牌。

## 数据库

### 设置数据库

在项目根目录，确保 Postgresql 服务器正在运行，然后运行：

```bash
yarn db:setup
yarn db:reset # 如果 `sudo -u postgres psql` 不工作，指定 no_sudo=1
```

### 重置数据库状态

如果你想要，可以通过运行以下命令重置数据库状态（在项目根目录）：

```bash
yarn db:reset # 如有必要添加 --sudo（希望不需要）
```

> 重要：记得清除浏览器 cookies 并重启任何正在运行的服务器。

## 运行服务器

### 使用 screen 运行服务器

在 screens 中运行所有服务器：

```bash
bash tools/start.bash
```

如果你想禁用类型检查以获得更快的增量开发服务器构建，使用：

```bash
NO_TYPECHECK=1 bash tools/start.bash
```

start.bash 之后，你将自动获得三个窗格查看各种终端，每个都运行一些进程子集。

### （实验性）在不同端口上运行

如果你想在备用后端（应用服务器）端口上运行：

```bash
BACKEND_PORT=3007 bash tools/start.bash
```

如果你想在备用前端（webpack 开发服务器）端口上运行：

```bash
PORT=3006 bash tools/start.bash
```

如果你想在备用数据库名称上运行：

```bash
WAB_DBNAME=altwab bash tools/start.bash
```

### （不完整）手动运行服务器

（这只是记录在 wab 中运行的内容，但你还必须在 wab 之外运行内容。）

在 `wab` 文件夹中

运行后端

```bash
yarn backend
```

运行前端客户端开发服务器

```bash
yarn start
```

运行主机客户端，只是端口 3005 上到前端的代理

```bash
yarn host-server
```

### 使用 pm2 运行服务器

你也可以使用 pm2 在开发环境中管理所有服务器进程。
首先，初始化 shell：

```bash
workon wab
. ~/.node/*/bin/activate
```

全局安装 pm2，这样你可以使用 pm2 而不是 "yarn pm2"

```bash
yarn global add pm2
```

要启动所有进程，只需

```bash
cd wab
pm2 start pm2-dev.config.js
```

要停止所有进程，

```bash
pm2 stop all
```

要删除所有进程，

```bash
pm2 delete all
```

要检查日志，

```bash
pm2 logs
```

参考 https://pm2.keymetrics.io/docs/usage/quick-start/ 获取更多使用信息。

## 拉取代码库时

每当你获取最新更改时，大多数时候，你只需要运行：

```bash
yarn
make
# 重启 node 服务器
# 重启 webpack，偶尔需要
```

但如果仍然出现问题，尝试：

```bash
yarn setup
# 重启 node 服务器
# 重启 webpack，偶尔需要
```

如果上述方法不能解决问题，再次尝试但运行 `yarn setup-all`。

## SVG 图标

对于流动的 SVG 图标，从 https://github.com/keremciu/font-bundles 安装图标字体

## Plume 特殊包

为了确保你的本地数据库包含最新版本的 Plume
包，以便你可以从 Plume 模板创建组件，运行：

```bash
yarn plume:dev update
```

如果你不这样做，当你打开任何新项目时，studio 可能会显示 NotFoundError。

## 测试

使用以下命令运行 Jest 测试：

```bash
bash tools/test.bash
```

## 迁移数据库/模型包模式

要迁移包，在 `bundle-migrations` 中创建一个新文件，遵循与现有文件相同的格式。小例子：

```typescript
// wab/src/wab/server/bundle-migrations/XX-my-migration.ts

import { UnsafeBundle } from "../../shared/bundles";

export function migrate(bundle: UnsafeBundle) {
    for (const [k, v] of Object.entries(bundle.map)) {
        if (v.__type === "Rule") {
            v.values = v.values;
        }
    }
}
```

就是这样！

如果你想回滚，只需删除文件（你也可以去 gerrit 创建回滚），然后重启应用服务器。警告：这将导致数据丢失。如果你可以创建新的迁移，请这样做！

实际上，你只需要担心添加文件和回滚文件。我们的部署脚本会处理其余部分。以下是如何在本地环境中进行更改的简要说明：

- 在线迁移：添加新迁移并重启服务器。
- 在线回滚：删除迁移并重启服务器。
- 离线迁移：添加新迁移并运行 `yarn db:migrate-bundles`。
- 离线回滚：删除迁移并运行 `yarn db:migrate-bundles`。

## 迁移开发/测试包

我们有一些用于开发/测试目的的本地 JSON 包，你也需要迁移它们。

要迁移这些，运行：

```bash
yarn migrate-dev-bundles
```

这会根据版本戳运行任何必要的迁移。

然后确保运行 jest 并更新测试快照。

注意：这将首先对文件执行 `git checkout`，重置为新的检出状态！这让你可以在文件上重复测试和运行迁移脚本。

## 调试 Studio

因为 Studio 在跨域 iframe 中运行，调试变得有点棘手。

特别是，React Devtools Chrome 扩展将不工作。但是，你可以运行独立的 React Devtools Electron 包。

安装并运行 `react-devtools`：

```bash
yarn global add react-devtools
react-devtools
```

或者你可以用 npx 运行它：

```bash
npx react-devtools
```

现在当你用 devflag `?enableReactDevTools=true` 打开 Studio 时，它应该自动连接。
它应该适用于开发服务器和生产环境。

## 调试 Node 服务器

你可以使用 IntelliJ/Webstorm。

或使用 `node --inspect` 通过 Chrome DevTools 调试你的 node 应用 - 只需在 Chrome 中打开 about:inspect，如
<https://medium.com/@paul_irish/debugging-node-js-nightlies-with-chrome-devtools-7c4a1b95ae27> 所述。

## Ant

我们选择批量导入所有 Ant 样式并在 antd-overrides.less 中覆盖它们的全局样式。
这允许实时主题化（不需要重启开发服务器）。

阅读更多关于 Ant 主题化的信息：https://paper.dropbox.com/doc/Web-Dev-Tips--AQguKQi_C8k0RX8XYqxhF3reAg-ohIiFVGa3PcjyBrm8zHew#:uid=860080543912951306384687&h2=Theming

## 维护依赖

检查哪些依赖未使用（或缺失）：

```bash
yarn custom-depcheck
```

检查需要更新的内容：

```bash
yarn outdated
```

更新依赖：

```bash
yarn upgrade --latest
```

这将升级所有内容。你也可以尝试选择性地升级单个包，但由于 yarn 如何处理升级也是其他依赖的间接依赖的依赖，事情会变得复杂。

## 备用配置

当指向不同的数据库时，你目前必须确保本地编辑 ormconfig.json（由 typeorm CLI 使用）并设置 WAB_DBNAME 环境变量。

## 更新子模块仓库

要就地更新子模块仓库（而不是编辑单独的检出、提交、推送，然后在这里拉取只是为了尝试更改），请按照以下步骤操作，以 wab/create-react-app-new/ 为例：

- 确保 wab/create-react-app-new/ 在 master 上，而不是在分离的 HEAD 中。[更多详情]。
- 直接编辑 wab/create-react-app-new/ 中的子模块文件。
- 在子模块仓库中提交。
- 在父仓库中提交，以便父仓库将其跟踪提交哈希更新到最新。
- git-review 子模块。
- 首先合并子模块提交。
- 一旦子模块提交被合并，父级上的 git-review 就会工作。

[更多详情]：https://stackoverflow.com/questions/18770545/why-is-my-git-submodule-head-detached-from-master/55570998 了解更多相关信息。

## 编写 E2E 测试

一些要点：

- 通常 `cy` 操作最顶层的文档，但我们经常想要与 arena 框架交互。为此，使用 `Framed` 实用程序类。

- 通常，确保使用 `{force:true}`，否则 cypress 会尝试自动滚动内容到视图中（我们几乎从不希望这样，因为我们的应用中没有真正的滚动）。

## 审计依赖的许可证

对于 node 依赖，从每个项目目录执行：

```bash
npx license-checker --csv --out license-checker.csv
```

对于 Python 依赖，从每个项目目录执行：

```bash
pip-licenses --from=mixed -f csv > pip-licenses.csv
```

## 生产构建

运行 `yarn build` 为生产构建客户端应用。这需要很长时间（>5分钟）。

你可以用以下方式测试构建的产物：

```bash
yarn global add local-web-server
cd build/
ws --spa index.html --rewrite '/api/(.*) -> http://localhost:3004/api/$1'
```

然后打开 http://localhost:8000。