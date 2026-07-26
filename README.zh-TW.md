# SillyTavern Card Writer

這是一套 local-first 的 SillyTavern 角色卡與 Lorebook 編輯工具，整合 LLM 協作、審稿、翻譯、Token 預算、版本快照以及 JSON／PNG 匯入匯出。

[English documentation](./README.md)

## 主要功能

- 建立與編輯 SillyTavern V2 角色卡。
- 建立獨立 Lorebook，或匯出時嵌入 `data.character_book`。
- 匯入 V2、V3、舊式 SillyTavern JSON，以及含 `chara` metadata 的 PNG 卡片。
- 加入 PNG、JPEG、WebP、GIF 或 BMP 圖片，調整 2:3 取景後輸出 PNG 角色卡。
- Lorebook 沒有 entry 時，不輸出空的 `character_book`。
- 估算永久、動態與 Lorebook Token，並設定各類預算。
- 使用多個獨立討論串與 LLM 進行腦力激盪，不會一開始就強制生成整張卡片。
- 手動觸發角色卡／Lorebook 生成、整卡修改，或針對主要欄位進行 AI 討論與改寫。
- 檢查冗詞、LLM 理解度、遊玩體驗、缺漏資訊、Lorebook 觸發、Token 使用與 MVU 一致性。
- 翻譯時保護 macro、URL、檔案路徑、JSON key、程式碼區塊與 MVU 變數名稱。
- 不透過 LLM，直接在本機進行繁簡轉換。
- 一鍵生成簡潔的 `{{user}}` 扮演角色，以及 natural language／booru tags 封面 Prompt。
- AI 套用前建立快照，可還原或比較版本。
- 儘可能保留其他工具寫入的未知 extension 資料。

## Local-first 與資料隱私

本專案沒有帳號系統或雲端同步。專案、設定、快照與 LLM 紀錄都保存在 `data/app.sqlite`；LLM 請求診斷則寫入 `data/llm-interactions.log`。

API key 只保存在本機 SQLite，回傳到介面時會遮蔽。只有在使用者主動執行 LLM 功能時，卡片內容才會傳送給「設定」頁所選的 provider。本機繁簡轉換不會呼叫 LLM。

完整的 `data/`、環境變數檔、logs、build 輸出與本機資料庫都已排除在 Git 之外。

## 程式架構

```text
瀏覽器（Vite + React + TypeScript）
        |
        | /api
        v
Go HTTP server（127.0.0.1:8787）
        |
        +-- SQLite 專案／設定儲存
        +-- LLM provider adapters
        +-- 本機繁簡轉換
```

### 前端

- Vite 4
- React 18、TypeScript
- TanStack Query
- i18next（`zh-TW`、`en`）
- Lucide icons

### 後端

- Go 1.22+
- 標準 `net/http` server
- `modernc.org/sqlite`
- `gocc` 本機繁簡轉換

### 支援的 LLM Provider

- DeepSeek
- OpenAI
- OpenRouter
- Anthropic
- Google Gemini
- 自訂 OpenAI-compatible Chat Completions endpoint

由於各 provider 的模型清單會更新，模型 ID 採自由輸入。

## 系統需求

- Go 1.22 或更新版本
- Node.js 16.13 或更新版本
- npm

## 安裝與啟動

安裝依賴：

```bash
npm install
go mod download
```

同時啟動前端與本機 API：

```bash
npm run dev
```

開啟 <http://127.0.0.1:5173/>。Go API 會監聽 <http://127.0.0.1:8787/>。

要關閉服務，請在執行 `npm run dev` 的 terminal 按 `Ctrl+C`。

## 初次設定 LLM

1. 建立或匯入一個專案。
2. 開啟上方的「設定」分頁。
3. 選擇 LLM Provider。
4. 輸入該 provider 的 API key 與模型 ID。
5. 若使用自訂 OpenAI-compatible provider，輸入完整的 Chat Completions API URL。
6. 選擇介面語言與 Prompt 輸出語言。
7. 按下「儲存」。

模型 ID 必須是該 provider 實際支援的模型。本工具不會替使用者建立或驗證 provider 帳號。

## 建議工作流程

1. 建立新專案，或匯入 JSON／PNG 角色卡。
2. 在「概念腦暴」使用一個或多個討論串逐步確認方向。
3. 在「角色卡」與「Lorebook」生成或編輯欄位。
4. 若需要 PNG 卡片，在「角色卡」加入圖片並調整取景。
5. 到「Token 預算」檢查用量。
6. 在「審稿／翻譯」進行找碴、翻譯、壓縮、MVU 檢查或本機繁簡轉換。
7. 儲存專案，再下載 JSON 或 PNG。

AI 輸出不應被視為必然正確。「套用到卡片」只會出現在 JSON-like 程式碼區塊，套用前會建立版本快照。

## MVU 變數設計

可選的 **MVU 變數** 分頁會建立兩個仍可在 Lorebook 編輯器中直接修改的普通條目：

- `[initvar] Initial Variables (keep disabled)`：載入至 MVU `stat_data` 的 JSON 物件。條目本身刻意停用，MVU 仍會依名稱標記讀取。
- `[mvu_update] Variable Update Rules`：要求模型輸出 MagVarUpdate 相容 JSON Patch 的常駐更新規則。

編輯器提供適合新手的變數表格，可新增、刪除、修改路徑、型別與初始值；複雜結構仍可使用折疊的 JSON 進階編輯器。變數樹與更新規則都支援既有的 AI 討論／修改流程。編輯器會驗證初始 JSON；停用 MVU 時只會收起並停用條目，不會刪除內容。匯出時會安全合併載入官方 MagVarUpdate runtime 的酒館助手腳本，不覆蓋卡片原有腳本。第一版刻意不包含自訂狀態列 UI。

## 匯入與匯出格式

### 匯入

- SillyTavern V2 JSON
- SillyTavern V3 JSON，匯入後正規化到編輯器資料模型
- 舊式 SillyTavern JSON 欄位
- 使用未壓縮 `tEXt` 或 `iTXt` `chara` metadata 的 PNG 卡片

### 匯出

- SillyTavern-compatible V2 JSON
- 將 base64 V2 JSON 寫入 `chara` text chunk 的 PNG
- 可選擇嵌入 `character_book`；沒有 Lorebook entry 時會省略

圖片會依 2:3 取景輸出。動態圖片輸出時使用瀏覽器解碼出的畫面。

## 開發與驗證

```bash
# 前端型別檢查
npm run typecheck

# 前端行為測試
npm test

# 正式前端 build
npm run build

# Go 測試
go test ./...
```

## 目錄結構

```text
cmd/server/          Go server 進入點
internal/api/        HTTP routes、匯入匯出、LLM orchestration
internal/llm/        Prompt registry 與 provider clients
internal/model/      卡片／專案 model 與 Token 估算
internal/store/      SQLite persistence
internal/zhconvert/  本機繁簡轉換
src/                 React application
test/                前端行為測試
```

## 目前限制

- Token 數量是近似估算，不是 provider 原生 tokenizer 的結果。
- LLM 寫作品質與結構化輸出遵循度取決於所選模型。
- MVU 支援目前集中在生成協助、保護、翻譯安全與一致性檢查，尚未提供獨立視覺化 MVU builder。
- 尚未支援匯入 PNG `zTXt` 或壓縮 `iTXt` metadata。
- 本工具以本機單一使用者為設計前提，沒有 authentication layer。

## License

本專案採用 [MIT License](./LICENSE)。Copyright (c) 2026 STRockefeller。
