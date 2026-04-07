# Supabase Edge Functions

This directory contains Supabase Edge Functions that replicate the API endpoints from the web application.

## Deployment

Deploy functions using the Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy a function
supabase functions deploy function-name

# Deploy all functions
supabase functions deploy
```

## Available Functions

### Authentication
- `admin-login` - Admin login endpoint
- `admin-signup` - Admin registration
- `employee-login` - Employee login

### Admin Endpoints
- `admin-dashboard` - Dashboard statistics
- `admin-employees` - Employee management
- `admin-sites` - Site management
- `admin-locations` - Employee locations
- `admin-notifications` - Notifications

### Employee Endpoints
- `employee-profile` - Employee profile
- `employee-attendance` - Attendance management
- `employee-location` - Location updates

## Environment Variables

Set these in your Supabase project dashboard under Settings > Edge Functions:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for admin operations)
- `SENDGRID_API_KEY` - For email sending (optional)

## Notes

- All functions handle CORS automatically
- Functions use the service role key for database operations
- In production, implement proper password hashing (bcrypt)
- Implement JWT token generation for authentication
- Add rate limiting for production use

