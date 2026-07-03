#!/usr/bin/env node

/**
 * CoinDaily AI System Quick Test Script
 * Tests all AI features: content generation, research, translation, image generation
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const GRAPHQL_ENDPOINT = 'http://localhost:4000/graphql';
const OLLAMA_SERVER_URL = 'http://167.86.99.97:11434';  // Your Contabo server

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkOllamaServer() {
  log('cyan', '\n🔍 Checking Contabo Server (167.86.99.97:11434)...');
  try {
    const response = await fetch(`${OLLAMA_SERVER_URL}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      log('green', `✅ Server Connected - Models available: ${data.models?.length || 'unknown'}`);
      return true;
    }
  } catch (error) {
    log('red', `❌ Server NOT reachable at ${OLLAMA_SERVER_URL}`);
    log('yellow', '📌 Ensure server is running: sudo systemctl status ollama');
    return false;
  }
}

async function checkBackend() {
  log('cyan', '\n🔍 Checking Backend...');
  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '{ __typename }'
      })
    });
    if (response.ok) {
      log('green', `✅ Backend Connected at ${GRAPHQL_ENDPOINT}`);
      return true;
    }
  } catch (error) {
    log('red', `❌ Backend NOT found at ${GRAPHQL_ENDPOINT}`);
    return false;
  }
}

async function testContentGeneration() {
  log('blue', '\n\n📝 Testing Content Generation...');
  
  const mutation = `
    mutation {
      generateContent(input: {
        type: ARTICLE
        topic: "Bitcoin adoption in Kenya"
        language: "en"
        tone: "professional"
        wordCount: 200
      }) {
        id
        status
        content
      }
    }
  `;

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation })
    });
    
    const data = await response.json();
    
    if (data.data?.generateContent) {
      log('green', '✅ Content Generation Working');
      log('yellow', `   ID: ${data.data.generateContent.id}`);
      log('yellow', `   Status: ${data.data.generateContent.status}`);
      console.log(`\n   Content Preview:\n   ${data.data.generateContent.content?.substring(0, 150)}...`);
      return true;
    } else if (data.errors) {
      log('red', `❌ Error: ${data.errors[0]?.message}`);
      return false;
    }
  } catch (error) {
    log('red', `❌ Test Failed: ${error.message}`);
    return false;
  }
}

async function testTranslation() {
  log('blue', '\n\n🌍 Testing Translation...');
  
  const mutation = `
    mutation {
      translateContent(input: {
        text: "Bitcoin is transforming Africa's financial landscape"
        sourceLang: "en"
        targetLang: "sw"
        domain: "cryptocurrency"
      }) {
        id
        status
        translatedText
      }
    }
  `;

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation })
    });
    
    const data = await response.json();
    
    if (data.data?.translateContent) {
      log('green', '✅ Translation Working');
      log('yellow', `   Original: Bitcoin is transforming Africa's financial landscape`);
      log('yellow', `   Swahili: ${data.data.translateContent.translatedText}`);
      return true;
    } else if (data.errors) {
      log('red', `❌ Error: ${data.errors[0]?.message}`);
      return false;
    }
  } catch (error) {
    log('red', `❌ Test Failed: ${error.message}`);
    return false;
  }
}

async function testResearch() {
  log('blue', '\n\n🔬 Testing Research...');
  
  const mutation = `
    mutation {
      conductResearch(input: {
        topic: "Memecoin trends in Africa"
        depth: QUICK
      }) {
        id
        status
        findings {
          summary
        }
      }
    }
  `;

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation })
    });
    
    const data = await response.json();
    
    if (data.data?.conductResearch) {
      log('green', '✅ Research Working');
      log('yellow', `   Status: ${data.data.conductResearch.status}`);
      console.log(`\n   Summary:\n   ${data.data.conductResearch.findings?.summary?.substring(0, 150)}...`);
      return true;
    } else if (data.errors) {
      log('red', `❌ Error: ${data.errors[0]?.message}`);
      return false;
    }
  } catch (error) {
    log('red', `❌ Test Failed: ${error.message}`);
    return false;
  }
}

async function testImageGeneration() {
  log('blue', '\n\n🎨 Testing Image Generation...');
  
  const mutation = `
    mutation {
      generateImage(input: {
        prompt: "Bitcoin bull run chart, neon cyberpunk style"
        style: "cyberpunk"
        resolution: "512x512"
      }) {
        id
        status
        imageUrl
      }
    }
  `;

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation })
    });
    
    const data = await response.json();
    
    if (data.data?.generateImage) {
      log('green', '✅ Image Generation Working');
      log('yellow', `   URL: ${data.data.generateImage.imageUrl}`);
      log('yellow', `   Status: ${data.data.generateImage.status}`);
      return true;
    } else if (data.errors) {
      log('red', `❌ Error: ${data.errors[0]?.message}`);
      return false;
    }
  } catch (error) {
    log('red', `❌ Test Failed: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.clear();
  log('cyan', '╔════════════════════════════════════════════════════════════╗');
  log('cyan', '║         CoinDaily AI System - Quick Test Suite              ║');
  log('cyan', '╚════════════════════════════════════════════════════════════╝');

  // Check prerequisites
  const ollamaServerOk = await checkOllamaServer();
  const backendOk = await checkBackend();

  if (!ollamaServerOk || !backendOk) {
    log('red', '\n❌ Prerequisites not met. Please ensure:');
    if (!ollamaServerOk) log('yellow', '   - Contabo Server is running (ssh root@167.86.99.97)');
    if (!backendOk) log('yellow', '   - Backend is running on port 4000');
    process.exit(1);
  }

  // Run tests
  const results = {
    content: await testContentGeneration(),
    translation: await testTranslation(),
    research: await testResearch(),
    image: await testImageGeneration()
  };

  // Summary
  log('cyan', '\n\n╔════════════════════════════════════════════════════════════╗');
  log('cyan', '║                      TEST SUMMARY                           ║');
  log('cyan', '╚════════════════════════════════════════════════════════════╝');

  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    log(passed ? 'green' : 'red', `${status} - ${test.charAt(0).toUpperCase() + test.slice(1)}`);
  });

  const passCount = Object.values(results).filter(r => r).length;
  log('yellow', `\nTotal: ${passCount}/4 tests passed\n`);
}

// Main execution
(async () => {
  try {
    await runAllTests();
  } catch (error) {
    log('red', `\nFatal Error: ${error.message}`);
    process.exit(1);
  }
})();
