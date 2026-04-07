// Import random values polyfill for React Native (must be before bcrypt)
// Note: Also imported in index.js at app entry point
import 'react-native-get-random-values';
import bcrypt from 'bcryptjs';

// Set up random fallback for bcrypt in React Native
// This is required because React Native doesn't have WebCryptoAPI or Node's crypto module
// bcryptjs needs random bytes for salt generation
try {
  // Import getRandomValues from the polyfill
  const { getRandomValues } = require('react-native-get-random-values');

  // Create a randomBytes function compatible with bcrypt
  // bcryptjs RandomFallback expects: (length: number) => number[]
  const randomBytes = (length: number): number[] => {
    const array = new Uint8Array(length);
    getRandomValues(array);
    return Array.from(array);
  };

  // Set the random fallback for bcrypt
  // This must be called before any bcrypt operations
  if (typeof bcrypt.setRandomFallback === 'function') {
    bcrypt.setRandomFallback(randomBytes);
  }
} catch (error: any) {
  // Silently fail - let bcrypt try to use default (might fail, but we'll catch it)
  // Error will be caught during actual password hashing
}

/**
 * Safely prepare a password for hashing - ensures it's a valid string
 * @param password Password value (can be string, number, or other)
 * @returns Validated and trimmed string password
 */
function preparePasswordForHashing(password: any): string {
  // Handle null/undefined
  if (password === null || password === undefined) {
    throw new Error('Password cannot be null or undefined');
  }

  // Handle string
  if (typeof password === 'string') {
    const trimmed = password.trim();
    if (trimmed.length === 0) {
      throw new Error('Password cannot be empty');
    }
    return trimmed;
  }

  // Handle number (convert to string)
  if (typeof password === 'number') {
    const str = String(password);
    if (str.length === 0) {
      throw new Error('Password cannot be empty');
    }
    return str;
  }

  // Handle other types - try to convert
  try {
    const str = String(password).trim();
    if (str.length === 0 || str === 'undefined' || str === 'null') {
      throw new Error('Password cannot be empty or invalid');
    }
    return str;
  } catch (e) {
    throw new Error(`Password must be a string, got ${typeof password}`);
  }
}

/**
 * Hash a password using bcrypt
 * @param password Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: any): Promise<string> {
  try {
    // Prepare and validate password
    const passwordStr = preparePasswordForHashing(password);

    // Final validation - must be a non-empty string
    if (typeof passwordStr !== 'string') {
      throw new Error(`Password must be a string, got ${typeof passwordStr}`);
    }

    if (passwordStr.length === 0) {
      throw new Error('Password cannot be empty');
    }

    // Validate salt rounds
    const saltRounds = 10;
    const rounds = Number(saltRounds);
    if (isNaN(rounds) || rounds < 1 || rounds > 31) {
      throw new Error(`Invalid salt rounds: ${saltRounds} (must be between 1 and 31)`);
    }

    // Final check before calling bcrypt
    if (typeof passwordStr !== 'string') {
      throw new Error('Password is not a string after preparation');
    }

    // Ensure rounds is definitely a number
    if (typeof rounds !== 'number' || isNaN(rounds)) {
      throw new Error(`Salt rounds must be a number, got ${typeof rounds}: ${rounds}`);
    }

    // Final type coercion to ensure bcrypt gets exactly what it needs
    const finalPassword: string = String(passwordStr);
    const finalRounds: number = Number(rounds);

    // Verify final types
    if (typeof finalPassword !== 'string') {
      throw new Error(`Final password is not a string: ${typeof finalPassword}`);
    }
    if (typeof finalRounds !== 'number' || isNaN(finalRounds)) {
      throw new Error(`Final rounds is not a number: ${typeof finalRounds}, value: ${finalRounds}`);
    }

    // Create a completely fresh primitive string (not an object wrapper)
    // This ensures bcrypt gets a true primitive string
    const primitivePassword = '' + finalPassword;
    const primitiveRounds = +finalRounds;

    // Final verification
    if (typeof primitivePassword !== 'string') {
      throw new Error(`Primitive password is not a string: ${typeof primitivePassword}`);
    }
    if (typeof primitiveRounds !== 'number' || isNaN(primitiveRounds)) {
      throw new Error(`Primitive rounds is not a number: ${typeof primitiveRounds}`);
    }

    // Call bcrypt.hash with primitive values
    let result: string;
    try {
      // Use hashSync for React Native compatibility (more reliable than async hash)
      // Wrap in Promise.resolve to maintain async interface
      if (typeof bcrypt.hashSync === 'function') {
        result = await Promise.resolve(bcrypt.hashSync(primitivePassword, primitiveRounds));
      } else if (typeof bcrypt.hash === 'function') {
        result = await bcrypt.hash(primitivePassword, primitiveRounds);
      } else {
        throw new Error('Neither bcrypt.hashSync nor bcrypt.hash is available');
      }
    } catch (bcryptError: any) {
      // Don't expose internal error details in production
      throw new Error('Password hashing failed');
    }

    // Verify result is a valid hash string
    if (typeof result !== 'string' || result.length === 0) {
      throw new Error('Hashing returned invalid result');
    }

    // Verify it looks like a bcrypt hash
    if (!result.startsWith('$2a$') && !result.startsWith('$2b$') && !result.startsWith('$2y$')) {
      throw new Error('Hashing returned invalid format');
    }

    return result;
  } catch (error: any) {
    // Provide more detailed error message
    if (error.message && error.message.includes('Failed to hash password')) {
      throw error; // Re-throw if it's already our error
    }
    const errorMsg = error?.message || String(error) || 'Unknown error';
    throw new Error(`Failed to hash password: ${errorMsg}`);
  }
}

/**
 * Compare a plain text password with a hashed password
 * @param password Plain text password
 * @param hashedPassword Hashed password from database
 * @returns True if passwords match, false otherwise
 */
export async function comparePassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  if (!password || typeof password !== 'string') {
    return false;
  }
  if (!hashedPassword || typeof hashedPassword !== 'string') {
    return false;
  }
  // Trim the password to match how hashPassword stores it (it trims before hashing)
  const trimmedPassword = password.trim();
  if (trimmedPassword.length === 0) {
    return false;
  }
  return await bcrypt.compare(trimmedPassword, hashedPassword);
}

