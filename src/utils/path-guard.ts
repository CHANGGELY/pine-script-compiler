import * as path from 'path';

/**
 * Resolve a user-supplied path against a base directory and verify that the
 * result stays inside it.
 *
 * Protects against path traversal attacks:
 * - `..` segments escaping the base directory
 * - absolute paths pointing outside the base directory
 * - null-byte injection
 *
 * Relative paths (the normal CLI usage) resolve against the base directory
 * and pass validation as long as they do not escape it.
 *
 * @param userPath - Untrusted path provided by the user (relative or absolute)
 * @param baseDir  - Allowed working directory (defaults to the current one)
 * @returns The resolved absolute path, safe to hand over to `fs`
 * @throws Error when the resolved path escapes `baseDir`
 */
export function resolveSafePath(userPath: string, baseDir: string = process.cwd()): string {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new Error('Invalid path: path must be a non-empty string');
  }

  if (userPath.includes('\0')) {
    throw new Error('Invalid path: null byte detected');
  }

  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(resolvedBase, userPath);

  const rel = path.relative(resolvedBase, resolved);
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(
      `Path traversal blocked: '${userPath}' resolves outside the allowed directory '${resolvedBase}'`
    );
  }

  return resolved;
}

/**
 * Non-throwing variant of {@link resolveSafePath}, useful for filtering
 * collections of paths (e.g. glob results).
 *
 * @returns `true` when the path stays inside the allowed directory
 */
export function isInsideWorkingDir(userPath: string, baseDir: string = process.cwd()): boolean {
  try {
    resolveSafePath(userPath, baseDir);
    return true;
  } catch {
    return false;
  }
}
