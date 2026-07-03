/**
 * PM2 Ecosystem Configuration
 * CoinDaily Platform - All Applications
 * 
 * Domains:
 * - sygn.live (News) - Port 3000
 * - jet.sygn.live (Admin) - Port 3002
 * - press.sygn.live (PR) - Port 3003
 * - ai.sygn.live (AI) - Port 3004
 * - cabfi.xyz (CFIS / finance-system) - Port 3007
 * - app.sygn.live (Backend) - Port 4000
 * - token.sygn.live (MVP / token landing) - Port 3001 (cwd: /var/www/token-landing, deployed separately)
 */

module.exports = {
  apps: [
    // ============================================
    // BACKEND API - app.sygn.live
    // ============================================
    {
      name: 'coindaily-backend',
      cwd: './backend',
      script: 'dist/backend/src/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '500M',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s'
    },

    // ============================================
    // NEWS APP - sygn.live
    // The main public news site lives in ./frontend (Next.js 14).
    // There is intentionally NO ./apps/news directory — frontend/ IS the news app.
    // If you ever split it into apps/news, update this cwd in lockstep.
    // ============================================
    {
      name: 'coindaily-news',
      cwd: './frontend',
      script: 'npm',
      args: 'start',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_PUBLIC_API_URL: 'https://app.sygn.live',
        NEXT_PUBLIC_GRAPHQL_URL: 'https://app.sygn.live/graphql',
        NEXT_PUBLIC_WS_URL: 'wss://app.sygn.live/graphql'
      },
      error_file: './logs/news-error.log',
      out_file: './logs/news-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '800M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s'
    },

    // ============================================
    // ADMIN PORTAL - jet.sygn.live
    // ============================================
    {
      name: 'coindaily-admin',
      cwd: './apps/admin',
      script: 'npm',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        NEXT_PUBLIC_API_URL: 'https://app.sygn.live',
        NEXT_PUBLIC_GRAPHQL_URL: 'https://app.sygn.live/graphql',
        NEXT_PUBLIC_WS_URL: 'wss://app.sygn.live/graphql'
      },
      error_file: './logs/admin-error.log',
      out_file: './logs/admin-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '400M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s'
    },

    // ============================================
    // PR & AD NETWORK - press.sygn.live
    // ============================================
    {
      name: 'coindaily-press',
      cwd: './apps/press',
      script: 'npm',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        NEXT_PUBLIC_API_URL: 'https://app.sygn.live',
        NEXT_PUBLIC_GRAPHQL_URL: 'https://app.sygn.live/graphql',
        NEXT_PUBLIC_WS_URL: 'wss://app.sygn.live/graphql',
        // Press orders forward to CFIS on cabfi.xyz (HMAC-signed)
        CFIS_URL: 'https://cabfi.xyz'
      },
      error_file: './logs/press-error.log',
      out_file: './logs/press-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '400M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s'
    },

    // ============================================
    // AI SYSTEM - ai.sygn.live
    // ============================================
    {
      name: 'coindaily-ai',
      cwd: './apps/ai',
      script: 'npm',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
        NEXT_PUBLIC_API_URL: 'https://app.sygn.live',
        NEXT_PUBLIC_GRAPHQL_URL: 'https://app.sygn.live/graphql',
        NEXT_PUBLIC_WS_URL: 'wss://app.sygn.live/graphql'
      },
      error_file: './logs/ai-error.log',
      out_file: './logs/ai-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '600M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s'
    },

    // ============================================
    // AI AGENT PIPELINE - content generation, translation, review
    // This is the Node.js agent orchestrator (ai-system/),
    // NOT the Next.js dashboard (apps/ai/).
    // ============================================
    {
      name: 'coindaily-ai-pipeline',
      cwd: './ai-system',
      script: 'dist/orchestrator/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        OLLAMA_API_URL: 'http://localhost:11434',
        NLLB_API_ENDPOINT: 'http://localhost:8080',
        SDXL_API_ENDPOINT: 'http://localhost:7860',
        DEEPSEEK_API_URL: 'http://localhost:11434',
        REDIS_URL: 'redis://localhost:6379'
      },
      error_file: './logs/ai-pipeline-error.log',
      out_file: './logs/ai-pipeline-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      max_restarts: 5,
      min_uptime: '30s',
      // Restart delay to avoid hammering Ollama on repeated failures
      restart_delay: 5000
    },

    // ============================================
    // GOV MONITOR — polls regulator / central bank press feeds (P3.8)
    // Emits high-priority alerts to Redis stream `gov_alerts:stream`
    // and a recent-alerts list consumed by admin /api/admin/gov-alerts/recent.
    // ============================================
    {
      name: 'coindaily-govmonitor',
      cwd: './ai-system',
      script: 'dist/workers/govMonitorRunner.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        REDIS_URL: 'redis://localhost:6379',
        GOV_MONITOR_INTERVAL_MS: '900000',
        GOV_MONITOR_MAX_PER_SOURCE: '5',
      },
      error_file: './logs/govmonitor-error.log',
      out_file: './logs/govmonitor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '300M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 5000,
    },

    // ============================================
    // IENGINE — AI VISUAL JOURNALISM WORKERS
    // GPU workers, upscale, thumbnail, delivery
    // ============================================
    {
      name: 'coindaily-iengine',
      cwd: '.',
      script: 'dist/Iengine/index.js',
      args: '--workers',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        COMFYUI_URL: 'http://localhost:8188',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        IENGINE_REDIS_DB: 2,
        IENGINE_GPU_COUNT: 1,
        IENGINE_CONCURRENCY_PER_GPU: 1,
        BACKEND_API_URL: 'http://localhost:4000'
      },
      error_file: './logs/iengine-error.log',
      out_file: './logs/iengine-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 5000
    },

    // ============================================
    // CFIS (Finance System) - cabfi.xyz
    // Hosted on cabfi.xyz, communicates with backend on sygn.live via HMAC.
    // ============================================
    {
      name: 'coindaily-cfis',
      cwd: './finance-system',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3007,
        // CFIS receives signed webhooks from press.sygn.live and posts receipts back
        // to the news backend on sygn.live.
        BACKEND_API_URL: 'https://backend.sygn.live',
        CFIS_PUBLIC_HOST: 'cabfi.xyz',
        CFIS_CORS_ORIGINS: 'https://cabfi.xyz,https://jet.sygn.live,https://app.sygn.live,https://press.sygn.live'
      },
      error_file: './logs/cfis-error.log',
      out_file: './logs/cfis-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s'
    },

    // ============================================
    // TRANSLATION SERVICE (Python)
    // ============================================
    {
      name: 'coindaily-translation',
      cwd: './translation-service',
      script: 'venv/bin/python',
      args: '-m uvicorn server:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PYTHONPATH: '.',
        MODEL_NAME: 'facebook/nllb-200-distilled-600M'
      },
      error_file: './logs/translation-error.log',
      out_file: './logs/translation-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '2G',
      autorestart: true,
      watch: false,
      max_restarts: 5,
      min_uptime: '30s'
    }
  ]
};
