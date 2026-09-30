# 群岛议会

双人实时策略桌游。客户端通过 WebSocket 与 Node.js 房间服务器同步状态。

## 本地运行

```sh
npm install
npm start
```

浏览器打开 `http://localhost:4173`。

## 公网部署（Render）

项目包含 `render.yaml`，用于创建 Render Node Web Service。将项目放进你自己的 GitHub 仓库（可设为 Private），然后在 Render 选择 **New → Blueprint** 并连接该仓库，按页面提示创建服务。部署完成后，把 Render 提供的 `https://…onrender.com` 地址发给玩家；页面会自动使用 WSS 建立实时连接。

当前房间和棋局状态保存在单个 Node 进程内存中。免费服务休眠、重新部署或进程重启时，进行中的房间会结束；免费实例也可能在空闲后休眠。该版本适合小范围试玩，不适合需要长期保留房间或高可用的正式运营。
