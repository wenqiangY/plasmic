# 开发 Plasmic Studio：第三方系统集成

## Vercel 上的 Plasmic 托管

要在开发环境中本地访问 plasmic 托管项目，需要运行 `hosting` 应用程序（`pm2-dev.config.js` 有一个配置可以使用适当的环境变量在本地运行它）。

运行 hosting 后，你可以通过访问 `http://localhost:3009/_sites/yourdomain.plasmic.run` 来访问已发布的项目，这相当于访问 `yourdomain.plasmic.run`。

## 设置 Google SSO

目前，使用 SSO 的用户必须有与组织域匹配的电子邮件域。

每个在 Plasmic 上工作并想要尝试 SSO 的开发者都需要在 Google Developers Console 上设置一个项目。

- 前往 [Google Developers Console](https://console.developers.google.com/)
- 在左上角，你可以看到你正在使用的项目（在三个黑色六边形旁边）。
  点击它，在对话框中，点击右上角的"新建项目"。
- 将你的项目命名为类似"Plasmic Yang Dev"的名称
- 点击左侧边栏的凭据选项卡。
- 首先点击"OAuth 同意屏幕"。填写必填字段，对于范围，
  确保包含"email"、"profile"、"openid"（默认应该包含）。
- 接下来，点击"凭据选项卡"
  - 选择"创建凭据"，然后选择"OAuth 客户端 ID"。
  - 应用程序类型："Web 应用程序"
  - 名称：<你想要的任何名称>
  - 授权的 Javascript 来源：[http://localhost:3003]
  - 授权的重定向 URI：[http://localhost:3003/api/v1/oauth2/google/callback]
- 将客户端 ID 和密钥保存在你的 `~/.plasmic/secrets.json` 中。它应该看起来像：
  ```json
  {
    "encryptionKey": "这是一个秘密的数据库加密密钥",
    "google": {
      "clientId": "你的客户端 ID",
      "clientSecret": "你的客户端密钥"
    }
  }
  ```

## 设置 GitHub App

- 使用你的个人账户登录 GitHub 并前往
  [GitHub Developer Settings](https://github.com/settings/apps)。
- 使用以下信息创建新的 GitHub App：
  - 主页 URL：http://localhost:3003
  - 回调 URL：http://localhost:3003/github/callback
  - 取消选中"使用户授权令牌过期"
  - 选中"在安装期间请求用户授权 (OAuth)"
  - 停用 webhook
  - 仓库权限：
    - Actions：读写
    - Administration：读写
    - Contents：读写
    - Pages：读写
    - Pull requests：读写
    - Workflows：读写
- 点击你创建的应用中的"编辑"并生成/存储客户端密钥和私钥。
- 在你的 ~/.plasmic/secrets.json 中填写以下字段：

  ```json
  {
    "github": {
      "appId": "<APP_ID>",
      "privateKey": "-----BEGIN RSA PRIVATE KEY-----\n<YOUR_KEY>...",
      "oauth": {
        "clientId": "<CLIENT_ID>",
        "clientSecret": "<CLIENT_SECRET>"
      }
    }
  }
  ```

  **注意私钥必须将其换行符替换为 "\n"。**

- 编辑 devflags（在你的本地存储中），将 githubClientId 和
  githubAppName 更改为你的应用客户端 ID 和 kebab-case 名称（从应用 URL 复制），
  然后重新加载 studio 以使更改生效。

### 开发/调试 GitHub 集成

以下是 localhost 开发的各种提示和工具。

### 设置外部可访问的 URL

GitHub Actions 需要调用你的应用服务器来执行同步，所以使用像 localhost.run 这样的服务，
并将你的 `externalBaseUrl` devflag 设置为指向你生成的临时 URL。

### 使用工具链调试标志

我们内部使用我们自己的工具链，包括 create-plasmic-app、
@plasmicapp/cli、@plasmicapp/loader 等。你可以使用 `yalc` 临时
更改 package.json 以使用你自己的本地 create-plasmic-app，你可以使用
这些包的各种调试标志，如 `PLASMIC_DEFAULT_HOST`。

例如，让 CLI/PlasmicLoader 指向你自己的 localhost 服务器：

```bash
PLASMIC_DEFAULT_HOST=http://localhost:3003 yarn backend
```

这被应用服务器忽略，但被 CLI/PlasmicLoader 使用。

查看这些项目的各种 README 以了解相关的调试标志。

### 首先发布工具链

CLI/PlasmicLoader 最终会在 GitHub Actions 运行器上运行，所以目前测试的"最简单"方法是先发布。

可能，你也可以修改生成的 package.json（在推送到 GitHub 的仓库中）以指向某个备用包源，但我还没有做过/需要这个。

## 设置计费（Stripe）

要在本地测试计费，将 Stripe 测试密钥（https://dashboard.stripe.com/test/apikeys）添加到 secrets.json：

```json
{
  "stripe": {
    "secretKey": "<粘贴密钥在这里>"
  }
}
```

## 设置 Google Sheets

拥有 GCloud 账户，启用 Sheets API，OAuth 同意屏幕。

创建 OAuth 客户端。

- 类型：web 应用程序
- 重定向：http://localhost:3003/api/v1/oauth2/google-sheets/callback

保存到 secrets.json：

```json
{
  "google-sheets": {
    "clientId": "<CLIENT_ID>",
    "clientSecret": "<CLIENT_SECRET>"
  }
}
```