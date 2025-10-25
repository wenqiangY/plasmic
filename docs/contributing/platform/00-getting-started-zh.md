# 开发 Plasmic Studio：入门指南

## 数据库设置

Plasmic 使用 PostgreSQL (v15) 作为数据库。我们强烈建议通过 docker 设置 postgres（详见 `docker-compose.yml`）。如果你按照 Docker 设置指南操作，数据库将自动为你创建。
如果你更喜欢手动应用程序设置，只需在终端中运行 `docker-compose up -d --no-deps plasmic-db` 来构建和启动 postgresql 实例。

## 操作系统特定说明

### Mac OS X

本节仅适用于手动安装 postgres，而不是通过 docker。

根据最新版本更新以下 Postgresql 版本号！

```bash
{ sed 's/#.*//' | while read line; do sudo port install -b $line; done ; } << "EOF"
curl-ca-bundle
postgresql15
postgresql15-server
hadolint # for Dockerfile checking
EOF

# 按照 postgresql-server 安装期间打印的说明操作：
sudo port select postgresql postgresql15
sudo mkdir -p /opt/local/var/db/postgresql15/defaultdb
sudo chown postgres:postgres /opt/local/var/db/postgresql15/defaultdb
sudo su postgres -c 'cd /opt/local/var/db/postgresql15 && /opt/local/lib/postgresql15/bin/initdb -D /opt/local/var/db/postgresql15/defaultdb'
sudo port load postgresql15-server
```

（如果你使用 macports，你的生活会轻松很多。不要使用 brew 安装 PG。）

为了让 `sudo -u postgres psql` 正常工作而不出现错误消息，你应该执行 `chmod 755 ~`。

### Ubuntu 18.04+

- 安装操作系统包：

  ```bash
  apt update
  apt install build-essential python3 python3-pip virtualenvwrapper postgresql postgresql-contrib wget screen
  ```

- 你可能还需要增加最大监视文件限制（参见 [issue](https://github.com/facebook/create-react-app/issues/2549)）：
  ```bash
  echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
  ```

## asdf

`asdf` (https://asdf-vm.com/) 管理我们使用的多个运行时/工具版本，如 `node` 和 `python`。
如果你需要在同一台机器上的多个环境中工作，这会很有用。

版本保存在版本控制中的 `.tool-versions` 和 `.envrc` 文件中。

1. 安装 `asdf`：https://asdf-vm.com/guide/getting-started.html
1. 安装插件：
   ```bash
   asdf plugin add nodejs
   asdf plugin add python
   asdf plugin add direnv
   ```
1. 从根目录运行 `asdf install`（以及任何有 `.tool-versions` 的目录）。
1. 在根目录中运行：`direnv allow`。
1. 检查安装的工具是否正常工作并具有正确的版本。
   ```bash
   node --version
   python --version
   ```

注意：

- 你需要 asdf 来管理 python 而不是使用 Mac 的系统 python，因为
  - 在最新的 MacOS 12.6 中（突然切换到 python 3.9），在某些环境（如 pre-commit pyenv）中构建二进制包会失败，除非你安装 Xcode。
  - 我们可以更一致地控制跨平台依赖的 python 版本，这可能对 npm gyp 构建的成功率有微妙影响。另外，不会再因为更新 MacOS 而突然从 python 3.8 切换到 3.9！
- 你需要 asdf-direnv 以便：
  - 你可以获得由 direnv 管理的本地虚拟环境（在 direnv 中称为"layouts"）- 这些本地环境不由 asdf 处理。
  - 像 `node --various-node-flags $(which yarn)` 这样的命令能按预期工作（在各种脚本中使用）。
  - 加上避免 shims 的一般好处。

## Docker 设置

默认情况下，源代码作为共享卷与主机挂载。node_modules 分别挂载，每个都有自己的卷，以便缓存 npm install 步骤并确保我们不会用构建产物污染共享卷。

这种设置对 CPU/RAM 消耗相当重，确保你为应用程序容器**至少**有 8GB 的 RAM 可用。

通过 docker 启动应用程序只需要从仓库根目录执行一个命令：

```bash
docker-compose up -d
```

它将自动启动数据库、初始化数据、执行所有迁移、构建 studio 正常运行所需的所有源代码，并启动服务器。

## 手动设置（推荐）

在继续之前，确保你已经配置了[数据库](#数据库设置)和 [git hooks](#配置-git-和-git-hooks)。

### 1. 环境变量

确保项目根目录和 `./platform/wab` 文件夹包含以下 `.env` 文件：

```bash
DATABASE_URI=postgres://wab:SEKRET@localhost:5432/wab
WAB_DBNAME=plasmic-db
WAB_DBPASSWORD=SEKRET
NODE_ENV=development
```

### 2. 安装依赖

运行 `yarn install` 两次 -- 一次在根文件夹，第二次在 `./platform/wab`

### 3. 初始化数据库

在 `./platform/wab` 中运行：

```bash
yarn seed
```

### 4. 应用程序设置

在项目根目录中运行：

```bash
yarn setup-all && yarn bootstrap
```

### 5. 启动开发服务器

在 GNU screens 中运行所有服务器：

```bash
yarn dev
```

## 使用应用程序

应用程序运行在 http://localhost:3003/。

如果你刚刚重置了数据库，将为你创建以下用户
（详见[初始化脚本](/platform/wab/src/wab/server/db/DbInit.ts)）：

- admin@admin.example.com
- user@example.com
- user2@example.com

这些账户的密码是 `!53kr3tz!`。

警告：避免使用 admin@admin.example.com 用户进行测试。
默认情况下，admin.example.com 域被视为管理员并具有
提升的权限（例如访问所有团队、工作空间、项目等）。
对于大多数开发目的，使用普通用户如 user@example.com。

## 故障排除

### 找不到可执行文件 `hadolint`

如果你对 docker 配置进行任何更改，请安装 [hadolint](https://github.com/hadolint/hadolint)

### tools/dev.bash: line 3: concurrently: command not found

如果你的 `/platform/wab/tools/dev.bash` 抛出关于 `concurrently` 不是函数的错误，将其重写为 `npx concurrently`

## 下一步

在 [01-config-tooling-zh.md](./01-config-tooling-zh.md) 中深入了解工具和配置。