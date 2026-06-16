# Garage Inventory

Tap an NFC tag on a bin → opens this app → shows what's inside.

## How it works
- Each bin has a unique ID. NFC stickers are written with a URL like
  `https://your-deployed-url.vercel.app/?bin=BIN_ID`
- Opening that URL jumps straight to that bin's contents
- Data is stored in Supabase (see `src/App.jsx` for connection details)

## Local development
```
npm install
npm run dev
```

## Deployment
Deployed via Vercel, connected to this GitHub repo. Push to `main` to auto-deploy.
