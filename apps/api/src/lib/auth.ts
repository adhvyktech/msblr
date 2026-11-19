import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env';
import { prisma } from './prisma';
import { httpError } from './errors';

export interface AuthUser {
  id: number;
  name: string;
  mobile: string;
  personId: number | null;
  familyId: number | null;
  advertiserId: number | null;
  roles: string[];
  perms: string[];
  isHead: boolean;
  isStaff: boolean;
  /** Zones the user's scoped roles (e.g. content) are limited to; [] = unscoped. */
  zoneIds: number[];
  sessionId?: string;
  language: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_COOKIE = 'msblr_rt';
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const hashToken = sha256;

export function signAccess(u: { id: number; roles: string[]; perms: string[] }, sessionId?: string) {
  return jwt.sign({ sub: String(u.id), sid: sessionId, roles: u.roles, perms: u.perms }, env.JWT_SECRET, {
    expiresIn: ACCESS_TTL_SEC,
  });
}
export function verifyAccess(token: string): { sub: number; sid?: string } {
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    return { sub: Number(p.sub), sid: p.sid as string | undefined };
  } catch {
    throw httpError(401, 'INVALID_TOKEN', 'Session expired. Please sign in again.');
  }
}

/** Load roles/perms/zones/person/family fresh from the DB. */
export async function loadAuthUser(userId: number, sessionId?: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      person: { select: { id: true, familyId: true, isHead: true, name: true } },
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
  if (!user || user.status !== 'ACTIVE') return null;
  const roles = new Set<string>();
  const perms = new Set<string>();
  const zones = new Set<number>();
  let isStaff = false;
  for (const ur of user.roles) {
    roles.add(ur.role.name);
    if (ur.role.isStaff) isStaff = true;
    ur.role.permissions.forEach((p) => perms.add(p.perm));
    if (ur.zoneId != null) zones.add(ur.zoneId);
  }
  const isHead = !!user.person?.isHead;
  if (isHead) roles.add('head');
  else if (user.person) roles.add('family_viewer');
  if (user.advertiserId) roles.add('advertiser');
  return {
    id: user.id,
    name: user.displayName ?? user.person?.name ?? user.mobile,
    mobile: user.mobile,
    personId: user.personId,
    familyId: user.person?.familyId ?? null,
    advertiserId: user.advertiserId,
    roles: [...roles],
    perms: [...perms],
    isHead,
    isStaff,
    zoneIds: [...zones],
    sessionId,
    language: user.language,
  };
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  const q = (req.query as Record<string, unknown> | undefined)?.t;
  return typeof q === 'string' ? q : null; // short token via ?t= (used by <img src>, downloads)
}

export async function authenticate(req: FastifyRequest, _reply?: FastifyReply): Promise<void> {
  const token = bearer(req);
  if (!token) throw httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  const { sub, sid } = verifyAccess(token);
  if (sid) {
    const s = await prisma.session.findUnique({ where: { id: sid }, select: { revokedAt: true, expiresAt: true } });
    if (!s || s.revokedAt || s.expiresAt < new Date()) {
      throw httpError(401, 'SESSION_REVOKED', 'This session has ended. Please sign in again.');
    }
  }
  const u = await loadAuthUser(sub, sid);
  if (!u) throw httpError(401, 'UNAUTHENTICATED', 'Account not available.');
  req.user = u;
}

/** Sets req.user if a valid token is present; otherwise leaves it undefined (never throws). */
export async function optionalAuth(req: FastifyRequest): Promise<AuthUser | undefined> {
  try {
    if (!bearer(req)) return undefined;
    await authenticate(req);
    return req.user;
  } catch {
    return undefined;
  }
}

/** preHandler: any-of permissions. Also authenticates, so it can be used alone. */
export function requirePerm(...perms: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) await authenticate(req, reply);
    if (!perms.some((p) => req.user.perms.includes(p))) {
      throw httpError(403, 'FORBIDDEN', 'You do not have permission to do this.');
    }
  };
}
/** preHandler: any staff role (sees the Admin panel). */
export async function requireStaff(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) await authenticate(req, reply);
  if (!req.user.isStaff) throw httpError(403, 'FORBIDDEN', 'Staff access only.');
}
/** preHandler: head of a family. */
export async function requireHead(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) await authenticate(req, reply);
  if (!req.user.isHead || !req.user.familyId) throw httpError(403, 'FORBIDDEN', 'Only the head of the family can do this.');
}
export const hasPerm = (u: AuthUser | undefined, p: string) => !!u && u.perms.includes(p);

// ---------- sessions ----------
export async function getTrustedDeviceDays(): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key: 'trustedDeviceDays' } });
  const n = Number(s?.value);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export async function createSession(userId: number, o: { trustDevice?: boolean; deviceName?: string; platform?: string }) {
  const days = o.trustDevice ? await getTrustedDeviceDays() : 1;
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + days * 86400_000);
  const s = await prisma.session.create({
    data: {
      userId,
      refreshHash: sha256(refreshToken),
      deviceName: o.deviceName?.slice(0, 100),
      platform: o.platform ?? 'web',
      expiresAt,
    },
  });
  return { sessionId: s.id, refreshToken, expiresAt, persistent: !!o.trustDevice };
}

/** Rotates the refresh token; the old one stops working immediately. */
export async function rotateRefresh(token: string) {
  const hash = sha256(token);
  const s = await prisma.session.findUnique({ where: { refreshHash: hash } });
  if (!s || s.revokedAt || s.expiresAt < new Date()) {
    throw httpError(401, 'INVALID_REFRESH', 'Session expired. Please sign in again.');
  }
  const newToken = crypto.randomBytes(48).toString('base64url');
  // compare-and-swap so a replayed token can't rotate twice
  const r = await prisma.session.updateMany({
    where: { id: s.id, refreshHash: hash, revokedAt: null },
    data: { refreshHash: sha256(newToken), lastUsedAt: new Date() },
  });
  if (r.count !== 1) throw httpError(401, 'INVALID_REFRESH', 'Session expired. Please sign in again.');
  const u = await loadAuthUser(s.userId, s.id);
  if (!u) throw httpError(401, 'INVALID_REFRESH', 'Account not available.');
  return { user: u, session: s, refreshToken: newToken, accessToken: signAccess(u, s.id), expiresAt: s.expiresAt };
}
