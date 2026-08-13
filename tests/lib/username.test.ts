import { describe, it, expect } from 'vitest';
import { USERNAME_PATTERN } from '../../lib/username';

// Kept in sync with db/schema.sql's CHECK constraint on profiles.username -
// a mismatch here means the client accepts a username the database then
// rejects, which is exactly the kind of thing that should fail a test
// rather than surface as a confusing runtime error.
describe('USERNAME_PATTERN', () => {
  it.each(['abc', 'goddy_ora', 'user123', 'a'.repeat(20)])('accepts valid username "%s"', (name) => {
    expect(USERNAME_PATTERN.test(name)).toBe(true);
  });

  it.each([
    'ab', // too short
    'a'.repeat(21), // too long
    'Goddy', // uppercase not allowed
    'user name', // space
    'user-name', // hyphen not allowed
    'user.name' // dot not allowed
  ])('rejects invalid username "%s"', (name) => {
    expect(USERNAME_PATTERN.test(name)).toBe(false);
  });
});
