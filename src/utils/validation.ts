import {z} from 'zod';

// Password validation: min 8 chars, letter + number + special char
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character');

// Email validation
export const emailSchema = z.string().email('Invalid email address');

// Phone validation (optional, but if provided must be valid)
export const phoneSchema = z
  .string()
  .optional()
  .refine(
    (val) => !val || /^\+?[\d\s-()]+$/.test(val),
    'Invalid phone number format'
  );

// Coordinate validation
export const latitudeSchema = z
  .number()
  .min(-90, 'Latitude must be between -90 and 90')
  .max(90, 'Latitude must be between -90 and 90');

export const longitudeSchema = z
  .number()
  .min(-180, 'Longitude must be between -180 and 180')
  .max(180, 'Longitude must be between -180 and 180');

// Login form schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

// Admin signup schema
export const adminSignupSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  company_name: z.string().min(1, 'Company name is required'),
  email: emailSchema,
  password: passwordSchema,
});

// Employee form schema
export const employeeFormSchema = z.object({
  employee_id: z.string().optional(),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: emailSchema,
  phone: phoneSchema,
  address: z.string().optional(),
  password: passwordSchema.optional(),
  site_id: z.number().optional(),
  department_id: z.number().optional(),
});

// Site form schema
export const siteFormSchema = z.object({
  name: z.string().min(1, 'Site name is required'),
  address: z.string().min(1, 'Address is required'),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  geofence_radius: z
    .number()
    .min(50, 'Geofence radius must be at least 50 meters')
    .max(5000, 'Geofence radius must be at most 5000 meters'),
  area_id: z.number().optional(),
});

// Profile update schema
export const profileUpdateSchema = z.object({
  first_name: z.string().min(1, 'First name is required').optional(),
  last_name: z.string().min(1, 'Last name is required').optional(),
  phone: phoneSchema,
  address: z.string().optional(),
});

// Change password schema
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    confirm_password: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type AdminSignupFormData = z.infer<typeof adminSignupSchema>;
export type EmployeeFormData = z.infer<typeof employeeFormSchema>;
export type SiteFormData = z.infer<typeof siteFormSchema>;
export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

