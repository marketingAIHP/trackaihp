# Deploy to Expo Go - Quick Guide

This guide will help you deploy your AIHP CrewTrack app to Expo Go so others can access it.

## Prerequisites

1. **Expo Account**: Create a free account at [expo.dev](https://expo.dev)
2. **EAS CLI**: Install EAS CLI globally
   ```bash
   npm install -g eas-cli
   ```
3. **Login to Expo**:
   ```bash
   eas login
   ```

## Method 1: Quick Share (Local Network) ⚡

This is the fastest way to share your app for testing:

1. **Start the development server**:
   ```bash
   npm start
   ```

2. **Share the QR Code**:
   - A QR code will appear in your terminal
   - Others can scan it with the Expo Go app
   - **Note**: All devices must be on the same network

3. **For remote access**, use tunnel:
   ```bash
   npm start -- --tunnel
   ```
   This allows access from anywhere (slower but works remotely)

## Method 2: Publish to Expo (Recommended) 🚀

This publishes your app so anyone can access it via Expo Go:

### Step 1: Configure EAS Project

1. **Initialize EAS** (if not done):
   ```bash
   eas init
   ```
   - This will create/link your project to Expo
   - Follow the prompts

2. **Get your Project ID**:
   - After `eas init`, you'll get a project ID
   - Update `app.config.js` with your project ID:
   ```javascript
   eas: {
     projectId: 'your-actual-project-id-here',
   }
   ```

### Step 2: Publish Your App

1. **Make sure environment variables are set**:
   - Create `.env` file with your Supabase credentials
   - See `PRODUCTION.md` for details

2. **Publish to Expo**:
   ```bash
   npm run publish
   ```
   
   Or manually:
   ```bash
   eas update --branch production --message "Initial release"
   ```

3. **Get your app URL**:
   - After publishing, you'll get a URL like:
   - `exp://exp.host/@your-username/aihp-crewtrack`
   - Share this URL with others

### Step 3: Access via Expo Go

1. **Install Expo Go**:
   - Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)

2. **Open the app**:
   - Open Expo Go app
   - Scan the QR code from the publish output
   - Or enter the URL manually

## Method 3: Development Updates

For testing updates during development:

```bash
# Publish to development branch
npm run publish:dev

# Publish to preview branch
npm run publish:preview
```

## Troubleshooting

### "Project not found"
- Run `eas init` to create/link your project
- Make sure you're logged in: `eas login`

### "Environment variables not working"
- Make sure `.env` file exists in root directory
- Variables are loaded via `app.config.js`
- Restart the Expo server after changing `.env`

### "App not loading in Expo Go"
- Check that all dependencies are compatible with Expo Go
- Some native modules require a development build
- Check Expo Go compatibility: [docs.expo.dev](https://docs.expo.dev)

### "Cannot connect to Supabase"
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Check Supabase project is active
- Ensure RLS policies allow access

## Sharing Your App

### Option 1: QR Code
- After publishing, you'll get a QR code
- Share the screenshot/image
- Others scan with Expo Go app

### Option 2: Direct Link
- Get the URL from publish output
- Share the link
- Users can open it in Expo Go

### Option 3: Expo Go App
- Open Expo Go
- Go to "Profile" tab
- Find your published app
- Share from there

## Important Notes

⚠️ **Expo Go Limitations**:
- Some native modules may not work in Expo Go
- For full native features, you need a development build
- Maps may show placeholders in Expo Go

✅ **What Works in Expo Go**:
- All core features (check-in/check-out)
- Location services
- Supabase integration
- Navigation
- UI components

## Next Steps

After testing in Expo Go:
1. If everything works, consider building standalone apps
2. See `PRODUCTION.md` for full production deployment
3. Build native apps with `npm run build:android` or `npm run build:ios`

## Quick Commands Reference

```bash
# Start development server
npm start

# Start with tunnel (remote access)
npm start -- --tunnel

# Publish to production
npm run publish

# Publish to preview
npm run publish:preview

# Publish to development
npm run publish:dev

# Login to Expo
eas login

# Initialize EAS project
eas init

# Check project status
eas project:info
```

## Support

If you encounter issues:
1. Check Expo documentation: [docs.expo.dev](https://docs.expo.dev)
2. Check EAS documentation: [docs.expo.dev/eas](https://docs.expo.dev/eas)
3. Verify your `.env` file is configured correctly

