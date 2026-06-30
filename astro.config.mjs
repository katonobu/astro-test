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
