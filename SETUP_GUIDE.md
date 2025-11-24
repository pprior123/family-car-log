# 🚗 Quick Setup Guide - Automatic Sync

## ✨ 5-Minute Setup for Automatic Syncing

### Step 1: Create a GitHub Gist (2 minutes)

1. Go to [gist.github.com](https://gist.github.com) and sign in
2. Click "+ Create new gist"
3. Fill in:
   - **Filename**: `vehicle-logs.json`
   - **Content**: `{"logs":[]}`
4. Click **"Create public gist"**
5. **Copy the Gist ID** from the URL
   - Example URL: `https://gist.github.com/username/1ad2c084abaae5e6c155ccc5d398490a`
   - Gist ID: `1ad2c084abaae5e6c155ccc5d398490a`

### Step 2: Create a GitHub Personal Access Token (3 minutes)

1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
2. Fill in:
   - **Note**: `Vehicle Log App`
   - **Expiration**: Select "No expiration" (or "1 year")
   - **Select scopes**: Check ONLY ✅ **gist**
3. Scroll down and click **"Generate token"**
4. **Copy the token** (starts with `ghp_...`)
   - ⚠️ **IMPORTANT**: Save it now! You can't see it again

### Step 3: Set Up the App

1. Open your Vehicle Log app
2. Enter:
   - **Gist ID**: (the long code from Step 1)
   - **GitHub Token**: (the ghp_ token from Step 2)
3. Click **"✨ Enable Automatic Sync"**
4. Done! 🎉


## 🎯 How It Works Now

### ✅ Fully Automatic!

**Adding Logs:**
- Add a log entry → Automatically uploads to Gist
- No manual copy/paste needed!

**Viewing on Other Devices:**
- Open the app → Automatically loads latest data
- Or click 🔄 Sync button anytime

**Syncing:**
- Everything happens automatically in the background
- Status shows "☁️ Auto Sync" when enabled
- If sync fails, you'll see "⚠️ Error"

## 👥 Sharing with Family

### For Your Wife:

Send her these 3 things:
1. **App URL**: `https://YOUR-USERNAME.github.io/vehicle-log/`
2. **Gist ID**: `1ad2c084abaae5e6c155ccc5d398490a`
3. **GitHub Token**: (the same token you created)

She enters the same Gist ID and Token during setup, and you'll both share the same logs automatically!

### Security Note:

The GitHub token allows access to your Gist. Only share it with trusted family members who should have access to your vehicle logs.

## 📱 Add to Phone Home Screen

**iPhone:**
1. Open app in Safari
2. Tap Share button → "Add to Home Screen"

**Android:**
1. Open app in Chrome
2. Menu (⋮) → "Add to Home screen"

## ❓ Troubleshooting

**"Failed to sync to Gist" error:**
- Check your token is correct (starts with `ghp_`)
- Make sure you checked the "gist" scope when creating it
- Token might have expired - create a new one

**Data not syncing between devices:**
- Make sure both devices use the same Gist ID and Token
- Click 🔄 Sync to manually refresh
- Check your internet connection

**Need to reset:**
- Go to Settings
- Enter new Gist ID and Token
- Click "Enable Automatic Sync"

