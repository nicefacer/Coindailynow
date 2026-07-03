
import { performance } from 'perf_hooks';

/**
 * Benchmark for Array.find vs Map.get in search result mapping
 */

function runBenchmark() {
  const SIZES = [10, 100, 1000, 5000];
  const ITERATIONS = 100;

  console.log('--- Search Optimization Benchmark ---');
  console.log(`Iterations: ${ITERATIONS}\n`);

  for (const size of SIZES) {
    console.log(`Data Size: ${size} elements`);

    // Setup data
    const articleIds = Array.from({ length: size }, (_, i) => `article-${i}`);
    const translations = articleIds.map(id => ({ articleId: id, languageCode: 'en' }));
    const articles = articleIds.map(id => ({ id, title: `Article ${id}` }));

    // Shuffle articles to avoid best-case scenario for Array.find
    const shuffledArticles = [...articles].sort(() => Math.random() - 0.5);

    // 1. Array.find approach (Current)
    const startFind = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const results = translations.map(t => {
        const article = shuffledArticles.find(a => a.id === t.articleId);
        if (!article) return null;
        return { ...article, language: t.languageCode };
      }).filter(Boolean);
    }
    const endFind = performance.now();
    const findTime = (endFind - startFind) / ITERATIONS;

    // 2. Map.get approach (Optimized)
    const startMap = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const articleMap = new Map(shuffledArticles.map(a => [a.id, a]));
      const results = translations.map(t => {
        const article = articleMap.get(t.articleId);
        if (!article) return null;
        return { ...article, language: t.languageCode };
      }).filter(Boolean);
    }
    const endMap = performance.now();
    const mapTime = (endMap - startMap) / ITERATIONS;

    console.log(`  Array.find: ${findTime.toFixed(4)} ms`);
    console.log(`  Map.get:    ${mapTime.toFixed(4)} ms`);
    console.log(`  Improvement: ${((findTime - mapTime) / findTime * 100).toFixed(2)}%\n`);
  }
}

runBenchmark();
