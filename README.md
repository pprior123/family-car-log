# 🚗 Family Vehicle Log

A simple, mobile-friendly web application for tracking vehicle maintenance and service records across multiple family vehicles.

## ✨ Features

- **Multi-Vehicle Support** - Track maintenance for multiple family vehicles
- **Cloud Sync** - Share data across devices using GitHub Gist
- **Mobile Responsive** - Works perfectly on phones, tablets, and computers
- **Offline Capable** - Data saved locally, works without internet
- **Easy Filtering** - Filter logs by specific vehicle
- **Statistics Dashboard** - View odometer readings, distance tracked, and service history
- **Category Tracking** - Organize by maintenance type (oil change, tires, repairs, etc.)

## 🚀 Quick Start

### Option 1: Use the Hosted Version

1. Visit your GitHub Pages URL: `https://YOUR-USERNAME.github.io/vehicle-log/`
2. Follow the on-screen setup instructions
3. Start logging your vehicle maintenance!

### Option 2: Run Locally

1. Download the `index.html` file
2. Double-click to open in your web browser
3. Bookmark the page for easy access

## 📱 Installing on Your Phone

### iPhone (iOS)
1. Open the app URL in Safari
2. Tap the **Share** button (box with arrow)
3. Scroll down and tap **"Add to Home Screen"**
4. Name it "Vehicle Log" and tap **Add**
5. The app icon will appear on your home screen!

### Android
1. Open the app URL in Chrome
2. Tap the **menu** (three dots ⋮)
3. Tap **"Add to Home screen"**
4. Name it "Vehicle Log" and tap **Add**
5. The app icon will appear on your home screen!

## ☁️ Setting Up Cloud Sync

Cloud sync lets you share vehicle logs between devices (e.g., you and your spouse's phones).

### Step 1: Create a GitHub Gist

1. Go to [gist.github.com](https://gist.github.com)
2. Sign in (or create a free GitHub account)
3. Create a new Gist with:
   - **Filename**: `vehicle-logs.json`
   - **Content**: `{"logs":[]}`
4. Click **"Create public gist"**
5. Copy the **Gist ID** from the URL (the long code after your username)
   - Example URL: `https://gist.github.com/username/1ad2c084abaae5e6c155ccc5d398490a`
   - Gist ID: `1ad2c084abaae5e6c155ccc5d398490a`

### Step 2: Enable Cloud Sync in the App

1. Open the app
2. If it's your first time: paste your Gist ID and click **"Save & Start Using App"**
3. If already using the app: click **⚙️ Settings** → enter Gist ID → click **"Enable Cloud Sync"**
4. The app will now load data from your Gist!

### Step 3: Share with Family Members

Give them:
- Your GitHub Pages URL (or the HTML file)
- Your Gist ID

They follow the same setup steps, and you'll all share the same vehicle logs!

## 📊 How to Use

### Adding a Log Entry

1. Click **➕ Add Log** button
2. Fill in:
   - **Vehicle Name** (e.g., "Honda Civic", "Toyota Camry")
   - **Date** - Defaults to today, but you can select any past date to backfill records!
   - **Current Odometer** reading in km
   - **Category** (maintenance, fuel, tires, repair, inspection, other)
   - **Notes** (what was done - optional)
3. Click **Save Log Entry**

### Editing a Log Entry

1. Find the log you want to edit
2. Click the **✏️ Edit** button
3. Confirm when prompted
4. Update any field (vehicle, date, odometer, category, notes)
5. Click **Save Changes**
6. Edited entries show "Last edited" timestamp

### Deleting a Log Entry

1. Find the log you want to remove
2. Click the **🗑️ Delete** button at the bottom of the entry
3. Confirm when prompted
4. Entry is deleted and automatically synced

### Adding Historical Records

You can add maintenance records from the past:
1. Click **➕ Add Log**
2. **Change the date** to when the service actually occurred
3. Fill in the details as normal
4. Logs automatically sort chronologically

### Filtering by Vehicle

1. Use the **"Filter by Vehicle"** dropdown
2. Select a specific vehicle to see only its logs
3. View statistics for that vehicle (odometer, distance tracked, etc.)

### Viewing Statistics

When filtering by a specific vehicle, you'll see:
- **Total Logs** - Number of service records
- **Latest Odometer** - Most recent odometer reading
- **Distance Tracked** - Total km between first and last log
- **First Log Date** - When you started tracking this vehicle


## 🔄 Syncing Between Devices

### How It Works

- **Reading Data**: Automatic! The app loads from your Gist when you open it or click 🔄 Sync
- **Writing Data**: Semi-manual (due to GitHub authentication requirements)

### Uploading Your Data to Gist

After adding new logs on any device:

1. Click **⚙️ Settings**
2. In the green "Upload your data to Gist" section:
   - Click **📋 Copy Data**
   - Click **Open Gist** link
   - Click **Edit** on your Gist
   - Select all content and paste the copied data
   - Click **Update public gist**

### Downloading Latest Data

On any device:
- Click the **🔄 Sync** button
- Or refresh the page

The app automatically checks for new data when loaded!

## 💡 Tips & Best Practices

### For Families
- **Designate one person** to upload data to Gist regularly (e.g., weekly)
- Everyone else can add logs and sync to see updates
- Consider uploading after adding multiple logs rather than after each one

### Vehicle Naming
- Use consistent names: "Honda Civic" not "honda civic" or "Civic"
- The app remembers vehicle names and suggests them as you type

### Categories
- **Maintenance**: Oil changes, filter replacements, scheduled service
- **Fuel**: Fill-ups, fuel system service
- **Tires**: Rotations, replacements, alignments
- **Repair**: Unexpected fixes, part replacements
- **Inspection**: Safety inspections, emissions tests
- **Other**: Anything else


### Odometer Accuracy
- Always enter the current odometer reading when logging service
- This helps track how much you've driven between services
- Distance calculations are based on odometer differences

## 🔒 Privacy & Security

- **Your Data**: Stored locally in your browser and in your GitHub Gist
- **Public Gist**: Anyone with the Gist ID can view your logs
  - But Gist IDs are long random codes that are hard to guess
  - Vehicle maintenance data is generally not sensitive
- **No Account Required**: No email, password, or personal info needed
- **No Tracking**: The app doesn't track or collect any usage data

## ❓ FAQ

### Q: Can I use this without cloud sync?
**A:** Yes! Click "Use Local Storage Only" during setup. Your data stays on your device only.

### Q: What if I lose my Gist ID?
**A:** Check your browser's localStorage or the Settings page (it shows your current Gist ID when in cloud mode). Or check your GitHub account at gist.github.com.

### Q: Can I export my data?
**A:** Yes! Click Settings → Copy Data. This gives you all your logs in JSON format that you can save as a backup.

### Q: Will this work offline?
**A:** Yes! Data is stored locally. You can add logs offline. Just sync when you're back online.

### Q: Can I delete a log entry?
**A:** Currently, no. This is to prevent accidental deletion. You can manually edit your Gist to remove entries.

### Q: Can I use miles instead of kilometers?
**A:** The app shows "km" but you can track in miles - just be consistent. The numbers are just for tracking distance between services.


### Q: My data isn't syncing between devices. What's wrong?
**A:** 
1. Make sure both devices are using the same Gist ID
2. After adding logs, remember to Copy Data and update your Gist
3. On the other device, click the 🔄 Sync button or refresh the page

### Q: Can I switch from local-only to cloud sync later?
**A:** Yes! Go to Settings and enter your Gist ID to enable cloud sync.

## 🛠️ Technical Details

### Built With
- Pure HTML, CSS, and JavaScript (no frameworks)
- LocalStorage API for offline data persistence
- GitHub Gist API for cloud sync
- Mobile-first responsive design

### Browser Compatibility
- ✅ Chrome/Edge (recommended)
- ✅ Safari (iOS and macOS)
- ✅ Firefox
- ✅ Any modern browser with JavaScript and LocalStorage

### Data Format
Logs are stored as JSON:
```json
{
  "logs": [
    {
      "id": "unique-id",
      "vehicle": "Honda Civic",
      "odometer": 45000,
      "category": "maintenance",
      "notes": "Oil change and tire rotation",
      "date": "2024-01-15T10:30:00.000Z",
      "displayDate": "1/15/2024",
      "displayTime": "10:30 AM"
    }
  ]
}
```


## 🐛 Troubleshooting

### App won't load
- Clear your browser cache and try again
- Make sure JavaScript is enabled
- Try a different browser

### Data disappeared
- Check if you're using the same browser
- LocalStorage data is browser-specific
- If using cloud sync, click 🔄 Sync to reload from Gist

### Can't access Gist
- Make sure your Gist is **public**, not secret
- Verify the Gist ID is correct (long alphanumeric code)
- Check that the Gist filename is exactly `vehicle-logs.json`

### Changes not syncing to other devices
- Remember to manually copy and update your Gist after adding logs
- GitHub doesn't allow automatic writes without authentication
- Other devices need to click 🔄 Sync to pull updates

## 📝 License

This is a personal project. Feel free to use and modify for your own needs!

## 🙋 Support

For questions or issues:
1. Check this README first
2. Verify your setup follows the cloud sync steps
3. Try refreshing the page or clearing browser cache

## 🎯 Future Improvements

Potential features for future versions:
- Automatic cloud sync (with GitHub authentication)
- Edit/delete log entries
- Cost tracking for services
- Service reminders based on odometer/date
- Export to PDF or CSV
- Photo attachments for receipts
- Multiple language support

---

**Last Updated**: December 2025  
**Version**: 2.1

### Recent Updates (v2.1)
- ✏️ Added edit functionality for log entries with "Last edited" timestamp
- ✨ Added automatic cloud syncing with GitHub tokens
- 📅 Added date picker for log entries (backfill historical records!)
- 🗑️ Added delete functionality for log entries
- ❓ Added in-app help documentation
- 💡 Added feature request button linked to GitHub Issues

