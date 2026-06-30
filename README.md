# 【プロジェクト定義】MarkdownドキュメントのAstroによるWebサイト化

## 1. 背景と要求事項

階層構造に意味を持つ、相互リンクが貼られた大量のプレーンなMarkdown（.md）ファイル群を、デザインが整ったWebサイトとして公開・運用したい。

### 必須要件（Requirements）

1. **階層構造の維持:** ディレクトリのフォルダ階層が、そのままWebサイトのURL構造（ルーティング）に反映されること。
2. **相互リンクの維持:** Markdown内に記述された既存の相対リンク（例: `[詳細](./sub/detail.md)`) を壊さず、ビルド時に自動でWeb用のURL（`.md` の除去など）に変換すること。
3. **プレーンMarkdownの許容:** Markdown側にメタデータ（Frontmatter）が一切なくても、ファイル名からタイトルを自動補完して綺麗に表示できること。また、必要に応じて逐次Frontmatter（`title`, `order` 等）を追加・拡張できる柔軟性を持つこと。
4. **運用上の役割分離:** ドキュメントの執筆・履歴管理（Markdownリポジトリ）と、サイトのシステム・デザイン（Astroリポジトリ）を完全に分離し、執筆者がAstroのコードを意識せずに運用できること。

---

## 2. 技術的選択肢とプロコン（比較）

### 選択肢A：Git Submoduleによるリポジトリ連携

Astroリポジトリの中に、Markdownリポジトリを子リポジトリとして直接埋め込む方法。

* **プロ（メリット）:** ローカル環境で `git submodule update` を叩くだけで同期でき、ホスティングサービス側の標準機能でビルド・デプロイが完結しやすい。
* **コン（デメリット）:** Gitのポインタ管理が複雑。Markdown更新後にAstro側でもコミットが必要なため更新漏れが起きやすく、Git操作においてハマりやすい。

### 選択肢B：GitHub Actionsによるビルド時コピー（★採用案）

2つのリポジトリを完全に独立させ、Markdownの `main` ブランチへのマージをトリガーに、GitHub Actions上でMarkdownをAstro側にコピーして一括ビルドする方法。

* **プロ（メリット）:** Gitの運用が最もシンプルでトラブルが起きない。執筆者はMarkdownを `push` するだけで完全自動でサイトが更新されるため、運用ストレスが皆無。
* **コン（デメリット）:** ローカル開発時に手動でのフォルダコピーが必要（※ただし、npmスクリプトで1行に自動化することで完全解決可能）。

---

## 3. 案を選択した理由

Git Submodule特有の「ポインタ更新忘れ」や「クローン時のエラー」といった運用上のハマりポイントを排除するため。GitHub ActionsによるCI/CDの自動化と、ローカル環境における独自の同期スクリプトを組み合わせることで、「Git運用はシンプルに保ちつつ、開発・本番ともに自動化された快適な環境」が作れると判断したため。

---

## 4. 具体的構成案

### 📁 フォルダ構造（ローカル開発時）

```text
📁 開発用共通フォルダ/
├── 📁 markdown-repo/  (ドキュメント専用。Git管理)
└── 📁 astro-site/     (Astroシステム・デザイン。別Git管理)
    ├── 📁 src/
    │   ├── 📁 content/
    │   │   └── 📁 docs/  (※ここにmarkdown-repoの中身が同期される)
    │   └── 📁 pages/
    │       └── 📄 [...slug].astro  (全階層を受け止める動的ルーティング)
    └── 📄 astro.config.mjs

```

### 🛠️ 技術スタックと具体的実装コード

#### ① Astro：コンテンツコレクション定義（Astro 5.x `glob` ローダー）

プレーンな状態でも、`id`（階層パス）を保持して型安全に読み込む。

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string().optional(),
    order: z.number().optional(),
  }),
});
export const collections = { docs };

```

#### ② Astro：相対リンク自動変換プラグイン ＆ Tailwind

`.md` リンクをWeb用に自動変換し、Tailwind Typography (`prose`) でプレーンなMarkdownを装飾。

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import visit from 'unist-util-visit';

function remarkFixMarkdownLinks() {
  return (tree) => {
    visit(tree, 'link', (node) => {
      if (!node.url.startsWith('http') && node.url.endsWith('.md')) {
        node.url = node.url.replace(/\/index\.md$/, '').replace(/\.md$/, '');
      }
    });
  };
}

export default defineConfig({
  integrations: [tailwind({ nest: true })],
  markdown: {
    remarkPlugins: [remarkFixMarkdownLinks],
  }
});

```

#### ③ Astro：動的ルーティング ＆ タイトル自動補完

Frontmatterにタイトルがない場合は、ファイル名をタイトルとして救済する。

```astro
---
// src/pages/[...slug].astro
import { getCollection, render } from 'astro:content';
import BaseLayout from '../layouts/BaseLayout.astro';
import path from 'node:path';

export async function getStaticPaths() {
  const docs = await getCollection('docs');
  return docs.map((entry) => {
    const slug = entry.id.replace(/\/index\.md$/, '').replace(/\.md$/, '');
    return {
      params: { slug: slug === 'index' ? undefined : slug },
      props: { entry },
    };
  });
}
const { entry } = Astro.props;
const { Content } = await render(entry);
const pageTitle = entry.data.title || path.basename(entry.id, '.md');
---
<BaseLayout title={pageTitle}>
  <article class="prose max-w-none">
    <h1>{pageTitle}</h1>
    <Content />
  </article>
</BaseLayout>

```

#### ④ ローカル同期スクリプト（`package.json`）

開発サーバー起動時、隣のMarkdownリポジトリから自動的にファイルをミラーリングコピーする。

```json
// Mac/Linux (rsync版)
"scripts": {
  "sync-docs": "rsync -av --delete ../markdown-repo/ src/content/docs/",
  "dev": "npm run sync-docs && astro dev",
  "build": "npm run sync-docs && astro build"
}
// Windows (robocopy版)
"scripts": {
  "sync-docs": "robocopy ..\\markdown-repo\\ src\\content\\docs\\ /mir /xd .git",
  "dev": "npm run sync-docs & astro dev",
  "build": "npm run sync-docs & astro build"
}

```

#### ⑤ 本番環境自動化（`markdown-repo` 側の GitHub Actions）

`main` にマージされたら、Astroリポジトリを引き抜いて結合し、自動ビルド・デプロイを走らせる。

```yaml
# .github/workflows/deploy.yml
name: Deploy Astro Site
on:
  push:
    branches: [- main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { path: markdown-content }
      - uses: actions/checkout@v4
        with:
          repository: 'ユーザー名/Astroリポジトリ名'
          token: ${{ secrets.ASTRO_REPO_TOKEN }}
          path: astro-site
      - name: Copy & Sync
        run: |
          mkdir -p astro-site/src/content/docs
          rsync -av --delete markdown-content/ astro-site/src/content/docs/
          rm -rf astro-site/src/content/docs/.git
      - name: Install & Build
        working-directory: ./astro-site
        run: |
          npm ci
          npm run build
      # (この後に任意のホスティングサービスへのデプロイステップを記述)

```
---

## 🗺️ 全体ロードマップ（ステップ定義）

### 【フェーズ1】ローカル環境の構築

* **ステップ 1-1：Astroの初期化と基本インストール**
* **ステップ 1-2：デザイン（Tailwind）＆システムファイルの作成**
* **ステップ 1-3：ローカル同期スクリプトの組み込み**
* **ステップ 1-4：ローカル開発サーバーでの動作確認**認）**
* *隣のMarkdownがコピーされ、ブラウザで綺麗に見えるかどうかのチェック*



### 【フェーズ2】ドキュメントサイトとしての機能拡張

* **ステップ 2-1：ディレクトリ構造から「サイドバー（目次ツリー）」を自動生成**
* *フォルダ階層を解析して、Wikiのようなメニューを画面左側に自動表示する*


* **ステップ 2-2：Markdown内の「リンク切れ」のチェック・修正対応**
* *実際に動かしてみて、特殊な記述やリンクが壊れていないかの検証*



### 【フェーズ3】GitHub連携 ＆ 本番自動化（CI/CD）

* **ステップ 3-1：Astro側リポジトリのGitHubへの初コミット・プッシュ**
* **ステップ 3-2：GitHubの認証トークン（PAT）の発行とリポジトリへの設定**
* **ステップ 3-3：Markdownリポジトリ側への「GitHub Actions」ワークフローの設置**

### 【フェーズ4】ホスティング・公開

* **ステップ 4-1：ホスティングサービス（Cloudflare Pages、Vercelなど）との連携**
* **ステップ 4-2：本番URLでの動作確認と、自動更新（マージ → 即反映）の最終テスト**

---
# 【フェーズ1】ローカル環境の構築

## 🛠️ ステップ 1-1：Astroの初期化手順
このステップでは、README.mdと.gitignoreしかない空の `astro-site` フォルダに、Astroのシステムをインストールして土台を作ります。

お使いの端末（Macのターミナル、WindowsのコマンドプロンプトやPowerShell、またはVS Codeの内蔵ターミナル）を開き、以下の手順通りにコマンドを実行してください。

### 1. `astro-site` ディレクトリに移動する

まず、作成したGitHubリポジトリのフォルダ内に移動します。

```bash
cd astro-site

```

> **確認:** フォルダを移動したら、念のため `ls` (Mac) または `dir` (Windows) を叩き、中に `README.md` と `.gitignore` がある（空のGitHubリポジトリである）ことを確認してください。

### 2. Astro初期化コマンドを実行する

以下のコマンドを入力して Enter を押します。

```bash
npm create astro@latest .

```

※末尾の `.`（ドット）は「この今いるフォルダ内に作る」という意味なので、必ず付けてください。

### 3. 対話式質問への回答

コマンドを実行すると、Astroのセットアップウィザード（英語）が始まります。いくつか質問が表示されるので、以下のように矢印キーと Enter で回答してください。

* **Q1: How would you like to start your new project?**
（どのようにプロジェクトを始めますか？）
👉 **`Empty`** を選択して Enter。
*(今回は既存のMarkdown群を綺麗に流し込むため、余計なファイルがない最小構成からスタートします)*
* **Q2: Do you plan to write TypeScript?**
（TypeScriptを使用しますか？）
👉 **`Yes`** を選択して Enter。
*(Astro 5.xの最新機能「コンテンツコレクション」を安全に動かすために必須となります)*
* **Q3: How strict should TypeScript be?**
（TypeScriptの型チェックの厳格さはどうしますか？）
👉 **`Strict`** を選択して Enter。
*(標準的な設定です)*
* **Q4: Install dependencies?**
（必要なパッケージを今すぐインストールしますか？）
👉 **`Yes`** を選択して Enter。
*(インターネット経由でAstroの本体がダウンロードされます。数十秒ほどかかります)*

---

## 🏁 ステップ 1-1 の完了確認

インストールの処理が終わり、ターミナルが入力受付状態に戻ったら成功です！
フォルダの中に、自動的に以下のようなファイルやフォルダが増えているはずです。

* `src/` （ここに今後画面やレイアウトを作っていきます）
* `public/` （画像などを入れるフォルダ）
* `astro.config.mjs` （Astroの設定ファイル）
* `package.json` （プロジェクトの構成台帳）
* `tsconfig.json` （TypeScriptの設定ファイル）
* `node_modules/` （インストールされたシステム本体）

---

## 🛠️ ステップ 1-2 の手順
このステップでは、Markdownをプロのドキュメントサイト並みに美しく表示するための「Tailwind CSS」の導入と、ページを表示するための核となるファイルを3つ作成します。

今回も `astro-site` ディレクトリにいる状態で、以下の手順を進めてください。

### 1. Tailwind CSS（デザイン用機能）の自動セットアップ

ターミナルで以下のコマンドを実行します。Astroが自動で必要な設定を書き換えてくれます。

```bash
npx astro add tailwind

```

実行すると、ターミナル上で以下のように2〜3回確認を求められます。

* **"Astro will run the following command..."** （パッケージをインストールしていいですか？）
👉 **`y`** を入力して Enter。
* **"Astro will make the following changes to your config file..."** （設定ファイルを更新していいですか？）
👉 **`y`**（またはEnter）で進めます。
* **"Astro will make the following changes to your tsconfig.json..."** （TypeScriptの設定を更新していいですか？）
👉 **`y`**（またはEnter）で進めます。

ターミナルに `Success!` と表示されればTailwindの導入は完了です。

### 2. Node.jsの型定義パッケージの追加

Astro内でファイル名やパスを安全に扱う（`path` モジュールなどを使う）ために、型定義を1つ追加しておきます。ターミナルで以下を実行してください。

```bash
npm install --save-dev @types/node

```

---

### 3. システムファイルの新規作成（3つ）

ここからは、エディタ（VS Codeなど）を使ってファイルを3つ作成していきます。
最終的に以下のような配置になるよう、フォルダとファイルを新しく作ってください。

```text
astro-site/
└── src/
    ├── content/
    │   └── config.ts        👈 【新規作成 ①】
    ├── layouts/
    │   └── BaseLayout.astro 👈 【新規作成 ②】
    └── pages/
        └── [...slug].astro  👈 【新規作成 ③】

```

#### 【新規作成 ①】 `src/content/config.ts`

「コンテンツコレクション」というAstroの機能を使って、Markdownファイルを安全に読み込むための設定ファイルです。`src/content/` フォルダを作り、その中に `config.ts` を作成して以下のコードを貼り付けてください。

```typescript
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  // 隣のフォルダからコピーされてくる md ファイル群を監視する設定
  loader: glob({ pattern: '**/*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string().optional(),
    order: z.number().optional(),
  }),
});

export const collections = { docs };

```

#### 【新規作成 ②】 `src/layouts/BaseLayout.astro`

すべてのドキュメント共通の「外枠（HTMLの土台）」となるファイルです。`src/layouts/` フォルダを作り、その中に `BaseLayout.astro` を作成して以下を貼り付けます。

```astro
---
const { title } = Astro.props;
---
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{title}</title>
  </head>
  <body class="bg-slate-50 text-slate-800 p-8">
    <main class="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-sm">
      <slot /> </main>
  </body>
</html>

```

#### 【新規作成 ③】 `src/pages/[...slug].astro`

URLの階層構造（例: `/guide/intro`）をそのまま受け止め、対応するMarkdownの中身を自動でレンダリングする一番重要なファイルです。`src/pages/` フォルダの中にある既存の `index.astro` は削除するか名前を変え、新しく `[...slug].astro` という名前（カギカッコを含む）でファイルを作成して以下を貼り付けます。

```astro
---
import { getCollection, render } from 'astro:content';
import BaseLayout from '../layouts/BaseLayout.astro';
import path from 'node:path';

export async function getStaticPaths() {
  const docs = await getCollection('docs');
  return docs.map((entry) => {
    // index.md はルートURL、それ以外はファイル名をURL（slug）にする
    const slug = entry.id.replace(/\/index\.md$/, '').replace(/\.md$/, '');
    return {
      params: { slug: slug === 'index' ? undefined : slug },
      props: { entry },
    };
  });
}

const { entry } = Astro.props;
const { Content } = await render(entry);

// タイトルがなければファイル名をタイトルにする救済措置
const pageTitle = entry.data.title || path.basename(entry.id, '.md');
---

<BaseLayout title={pageTitle}>
  <article class="prose prose-slate max-w-none">
    <h1>{pageTitle}</h1>
    <Content />
  </article>
</BaseLayout>

```

---

## 🏁 ステップ 1-2 の完了確認

3つのファイルを作成し、それぞれ保存できたらステップ 1-2 は完了です！

次は、Markdown内の相互リンクを切れさせないための重要な設定と、隣のリポジトリからドキュメントを一瞬でコピーしてくる魔法のスクリプトを仕込む **【ステップ 1-3：ローカル同期スクリプトの組み込み】** に進みます。



ファイルの作成など、準備ができたら教えてください！

ここまでエラーなく無事に完了しましたでしょうか？
問題なければ、次はデザインの土台と必要なパッケージを追加する【ステップ 1-2】に進みます。進捗を教えてください！

```
╭─src/layouts/Layout.astro─────────╮
│  ---                             │
│  import '../styles/global.css'   │
│  ---                             │
╰──────────────────────────────────╯
と言われたが大丈夫?
```
---

## 🛠️ ステップ 1-3 の手順
このステップでは、以下の2つの作業を行います。

1. **相互リンクを維持する設定**（Astroの環境設定ファイルにプラグインを適用）
2. **ローカル同期スクリプトの作成**（隣のMarkdownフォルダから自動で最新ファイルをコピーする仕組み）

### 1. Astroの設定ファイルを書き換える

プロジェクトのルート（一番上の階層）にある `astro.config.mjs` を開いてください。
初期設定のコードが書かれていますが、それをすべて消して、以下のコードに丸ごと置き換えて保存してください。

```javascript
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import visit from 'unist-util-visit';

// Markdown内の「.md」への相対リンクを、Web用のURL構造に自動変換するカスタムプラグイン
function remarkFixMarkdownLinks() {
  return (tree) => {
    visit(tree, 'link', (node) => {
      // 外部リンク（http〜）ではなく、かつ末尾が「.md」のリンクを対象にする
      if (!node.url.startsWith('http') && node.url.endsWith('.md')) {
        // 例: "./sub/page.md" -> "./sub/page"
        // index.md の場合はフォルダ名自体がURLになるよう適切に置換
        node.url = node.url.replace(/\/index\.md$/, '').replace(/\.md$/, '');
      }
    });
  };
}

export default defineConfig({
  integrations: [tailwind({ nest: true })],
  markdown: {
    // 上記で作った相対リンク修復プラグインをAstroに適用
    remarkPlugins: [remarkFixMarkdownLinks],
  }
});

```

---

### 2. `package.json` に同期スクリプトを仕込む

次に、プロジェクトのルートにある `package.json` を開きます。
`"scripts": { ... }` という項目がありますので、**ご自身のPCのOS（Mac/Linux か Windows か）に合わせて**、以下のように書き換えて保存してください。

#### 💻 Mac / Linux の場合（`rsync` を使用）

```json
  "scripts": {
    "sync-docs": "rsync -av --delete ../markdown-repo/ src/content/docs/",
    "dev": "npm run sync-docs && astro dev",
    "build": "npm run sync-docs && astro build",
    "preview": "astro preview",
    "astro": "astro"
  },

```

#### 💻 Windows の場合（`robocopy` を使用）

```json
  "scripts": {
    "sync-docs": "robocopy ..\\markdown-repo\\ src\\content\\docs\\ /mir /xd .git",
    "dev": "npm run sync-docs & astro dev",
    "build": "npm run sync-docs & astro build",
    "preview": "astro preview",
    "astro": "astro"
  },

```

> **💡 コードの解説:**
> ここで定義した `"sync-docs"` は、「1つ上の階層にある `markdown-repo` フォルダの中身を、Astroの `src/content/docs/` フォルダの中に丸ごとミラーリングコピーする（不要なファイルは削除する）」という命令です。
> これを `dev`（開発起動コマンド）の前に合体させることで、毎回自動同期が走るようになります。

---

## 🏁 ステップ 1-3 の完了確認

2つのファイルの書き換え・保存が終われば完了です！

いよいよフェーズ1の最終クジラ、**【ステップ 1-4：ローカル開発サーバーでの動作確認】** に進む準備が整いました。
ファイルの保存が終わりましたら、「確認OK」と教えてください。実際にサイトを立ち上げてブラウザで見てみましょう！
