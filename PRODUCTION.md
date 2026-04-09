# Production Deployment Guide

This guide will help you deploy AIHP CrewTrack to production.

## Prerequisites

1. **Supabase Project**: Set up a Supabase project at [supabase.com](https://supabase.com)
2. **Expo Account**: Create an account at [expo.dev](https://expo.dev)
3. **EAS CLI**: Install EAS CLI for building production apps
   ```bash
   npm install -g eas-cli
   ```

## Environment Setup

1. **Create `.env` file** in the root directory:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here
   ```

   This `.env` file is used for local development and web builds on your machine.
   It is not uploaded automatically to EAS cloud builds for Android or iOS.

2. **Get Supabase Credentials**:
   - Go to your Supabase project settings
   - Navigate to API settings
   - Copy the Project URL and anon/public key

3. **Get Google Maps API Key** (Optional):
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Enable Maps SDK for Android/iOS
   - Create API key and restrict it

4. **Set EAS environment variables for native builds**:
   ```bash
   eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://your-project.supabase.co --environment production
   eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value your-anon-key-here --environment production
   eas env:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value your-google-maps-api-key-here --environment production
   ```

   Repeat for preview/development if you build those profiles too.
   These `EXPO_PUBLIC_*` values are what Android and iOS cloud builds should rely on.

## Database Setup

1. **Run Migrations**:
   - Go to Supabase SQL Editor
   - Run all migration files from `supabase/migrations/` directory
   - Ensure all tables are created

2. **Configure RLS Policies**:
   - Set up Row Level Security policies as needed
   - Test that employees and admins can access their data

3. **Set Up Storage Buckets**:
   - Create `profile-images` bucket
   - Create `site-images` bucket
   - Configure public access policies

## Building for Production

### Android

1. **Configure EAS**:
   ```bash
   eas build:configure
   ```

2. **Build APK/AAB**:
   ```bash
   eas build --platform android --profile production
   ```

3. **Download and distribute** via Google Play Console

### iOS

1. **Configure EAS**:
   ```bash
   eas build:configure
   ```

2. **Build IPA**:
   ```bash
   eas build --platform ios --profile production
   ```

3. **Submit to App Store**:
   ```bash
   eas submit --platform ios
   ```

## Production Checklist

### Before Deployment

- [ ] All environment variables are set correctly
- [ ] Database migrations are applied
- [ ] RLS policies are configured
- [ ] Storage buckets are set up
- [ ] API keys are restricted and secured
- [ ] Error tracking is configured (optional: Sentry)
- [ ] App icons and splash screens are added
- [ ] Version number is updated in `app.config.js`
- [ ] Bundle identifier/package name is correct

### Security

- [ ] Supabase RLS policies are properly configured
- [ ] API keys are not exposed in client code
- [ ] Sensitive data is encrypted
- [ ] HTTPS is enforced
- [ ] Location permissions are properly requested

### Performance

- [ ] Images are optimized
- [ ] Query caching is configured
- [ ] Unnecessary re-renders are minimized
- [ ] Bundle size is optimized

### Testing

- [ ] Test check-in/check-out flow
- [ ] Test geofence functionality
- [ ] Test history display
- [ ] Test admin features
- [ ] Test on both Android and iOS
- [ ] Test with poor network conditions

## Monitoring

### Recommended Tools

1. **Error Tracking**: Set up Sentry or similar service
2. **Analytics**: Integrate analytics (optional)
3. **Performance**: Monitor app performance metrics

### Error Boundary

The app includes an Error Boundary component that catches React errors. In production, consider integrating with an error tracking service:

```typescript
// In ErrorBoundary.tsx componentDidCatch
if (IS_PRODUCTION) {
  // Sentry.captureException(error, {extra: errorInfo});
}
```

## Troubleshooting

### Common Issues

1. **"Supabase is not configured"**
   - Check `.env` file exists and has correct values
   - Verify environment variables are loaded

2. **"Database tables not found"**
   - Run migrations in Supabase SQL Editor
   - Check table names match migration files

3. **"RLS policy violation"**
   - Review Row Level Security policies
   - Ensure policies allow necessary operations

4. **Location not working**
   - Check location permissions are granted
   - Verify GPS is enabled on device
   - Test in outdoor environment for better accuracy

## Support

For issues or questions:
1. Check the main README.md
2. Review Supabase documentation
3. Check Expo documentation

## Version History

- **1.0.0** - Initial production release

