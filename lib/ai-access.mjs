// Sites supplies authenticated identity. Owner identity stays in a server Secret.
export function ownerAccess(user, ownerEmail) {
  if (!user) return { allowed: false, status: 401, error: 'AI 问答仅供站主使用，请登录站主账号。' };
  if (typeof ownerEmail !== 'string' || !ownerEmail.trim() || typeof user.email !== 'string' || user.email.trim().toLowerCase() !== ownerEmail.trim().toLowerCase()) {
    return { allowed: false, status: 403, error: 'AI 问答仅供站主使用。你可以继续使用任务、日历和专注功能。' };
  }
  return { allowed: true, status: 200, error: '' };
}
