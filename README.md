# 哈基工 x 哈吉梁 点菜舱

一个双人专属的科技萌系点菜网页。进入时输入共享访问码，选择“哈基工 / 哈吉梁”，再选择“厨师 / 顾客”。厨师上架菜品，顾客点餐，订单状态可流转。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`，默认访问码是 `haji-love`。如果没有配置 Supabase，应用会自动进入“本地演示”模式，数据保存在当前浏览器的 localStorage。

## Supabase 配置

1. 在 Supabase SQL Editor 执行 `supabase/schema.sql`。
2. 创建 public Storage bucket：`dish-images`。
3. 复制 `.env.example` 为 `.env.local`，填入：
   - `APP_ACCESS_CODE`
   - `NEXT_PUBLIC_APP_ACCESS_CODE`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET`

服务端 API 会校验 `x-app-code`，并使用 service role key 读写 Supabase；不要把 service role key 放到 `NEXT_PUBLIC_` 变量里。

## 部署到 Vercel

1. 将项目推到 GitHub。
2. 在 Vercel 导入项目。
3. 在 Vercel Project Settings 里添加和 `.env.example` 对应的环境变量。
4. 部署完成后，两部手机都可以访问 Vercel 生成的 HTTPS 地址。

## Vercel 注册不了时：部署到 Netlify

Netlify 也可以部署这个 Next.js 项目。

1. 注册并登录 Netlify：`https://www.netlify.com/`
2. 点 `Add new site`，选择 `Import an existing project`。
3. 连接 GitHub，选择这个项目仓库。
4. Build command 填：`npm run build`。
5. Publish directory 填：`.next`。
6. 在 `Site configuration` / `Environment variables` 添加：
   - `APP_ACCESS_CODE`
   - `NEXT_PUBLIC_APP_ACCESS_CODE`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET`
7. 点 Deploy。

如果 Netlify 也注册不了，可以先用本机局域网或临时公网隧道预览；正式长期使用仍建议选择 Netlify、Vercel、Render 这类平台。

## 功能

- 厨师端：上传菜名和图片、永久保存菜品、上下架、查看订单、更新状态。
- 顾客端：浏览菜品、加入菜单、设置数量和备注、提交订单、查看状态。
- 手机优先：大按钮、玻璃态面板、原创软萌角色、科技感网格和动效。
