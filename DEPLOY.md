# Deployment Guide

## Local Testing
```bash
npm run dev
# Opens at http://localhost:9000/
```

## Deploy to Vercel (no GitHub needed)

### Option 1: Vercel CLI
```bash
# Install Vercel CLI
npm install -g vercel

# Login (creates free account)
vercel login

# Deploy from project root
vercel

# Deploy to production
vercel --prod
```

### Option 2: Vercel Web UI
1. Go to https://vercel.com
2. Sign up with email (free)
3. Click "New Project"
4. Upload the `dist/` folder
5. Done — get instant URL

## Deploy to Netlify (no GitHub needed)

### Option 1: Netlify CLI
```bash
npm install -g netlify-cli
netlify login
netlify deploy --dir=dist --prod
```

### Option 2: Netlify Drop
1. Go to https://app.netlify.com/drop
2. Drag the `dist/` folder
3. Done — get instant URL

## Deploy to Surge.sh
```bash
npx surge dist qigong-landing.surge.sh
```

## Build for Production
```bash
npm run build
# Output in dist/ folder
```
