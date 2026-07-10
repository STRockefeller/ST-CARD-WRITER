# SillyTavern Card Writer

這是一個 local-first 的 SillyTavern V2 角色卡寫作工具，用來建立、編輯、審稿、翻譯與匯出角色卡。

English documentation: [README.md](./README.md)

## 專案內容

SillyTavern Card Writer 的目標是把「從點子到可匯入 SillyTavern 的角色卡」整理成一個完整工作流：

- 撰寫 SillyTavern V2 角色卡。
- 建立與編輯 lorebook。
- 匯出內嵌 `character_book` 的角色卡。
- 匯入 SillyTavern V2 JSON，以及帶有 `chara` metadata 的 PNG 卡。
- 估算永久、動態、lorebook token 用量。
- 設定 token 預算並顯示超標狀態。
- 使用 LLM 協助腦力激盪、草稿生成、改寫、壓縮、找碴、翻譯與 MVU 檢查。
- 翻譯流程會注意保護 `{{char}}`、`{{user}}`、macro、URL、檔案路徑、JSON-like 欄位與 MVU 變數名稱。

資料會保存在本機 SQLite：`data/app.sqlite`。目前沒有帳號系統，也不做雲端同步。

## 技術棧

- 前端：Vite、React、TypeScript、TanStack Query、i18next
- 後端：Go、SQLite
- LLM provider：DeepSeek
- 預設模型：`deepseek-v4-flash`，設定中也可選 `deepseek-v4-pro`

## 系統需求

- Go 1.22+
- Node.js 16+
- npm

目前依賴版本已固定在可支援 Node 16.13.1 的範圍。

## 使用方式

安裝依賴：

```bash
npm install
go mod tidy
```

啟動本機 App：

```bash
npm run dev
```

開啟：

```text
http://127.0.0.1:5173/
```

Go API 會跑在：

```text
http://127.0.0.1:8787/
```

## 初次設定 LLM API Key

1. 開啟 `http://127.0.0.1:5173/`。
2. 先建立或匯入一個專案。
3. 點上方工作區分頁的 `設定` / `Settings`。
4. 在 `DeepSeek API Key` 欄位貼上你的 DeepSeek API key。
5. 選擇模型：
   - `deepseek-v4-flash`：預設，速度較快。
   - `deepseek-v4-pro`：適合品質要求較高的生成、審稿與翻譯。
6. 選擇介面語言與 prompt 輸出語言。
7. 按下 `儲存` / `Save`。

API key 只會保存在本機 SQLite 資料庫中。之後再次顯示設定時，畫面上會看到遮蔽後的 key。

## 主要工作流

1. 建立新專案，或匯入既有 V2 JSON/PNG 卡。
2. 在 `概念腦暴` 中用 LLM 發展角色點子。
3. 到 `角色卡` 填寫或調整各欄位。
4. 到 `Lorebook` 加入世界觀、關係、規則、秘密等 entries。
5. 到 `Token 預算` 檢查永久、動態與 lorebook token 用量。
6. 到 `審稿/翻譯` 執行找碴、翻譯、壓縮或 MVU 檢查。
7. 匯出 SillyTavern V2 JSON 角色卡。

## 驗證指令

```bash
go test ./...
npm run typecheck
npm test
npm run build
```

## 目前限制

- PNG 匯入支援常見未壓縮 `tEXt` / `iTXt` 的 `chara` metadata；尚未支援 PNG 匯出。
- Token 計算目前是近似估算，不是 DeepSeek 官方 tokenizer。
- LLM 回覆會保存到歷史紀錄，但還沒有一鍵套用欄位 patch。
- MVU 目前偏向保護、檢查與一致性審稿，尚未做完整 MVU 卡片生成器。
